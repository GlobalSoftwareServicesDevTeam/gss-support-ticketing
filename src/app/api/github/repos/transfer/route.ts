import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

async function getTokenForOwner(owner: string): Promise<string | null> {
  // Find a GitHub account whose label or username matches the owner
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (acc.label.toLowerCase() === owner.toLowerCase() ||
        acc.owner.toLowerCase() === owner.toLowerCase()) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

// POST: transfer a repo from another GitHub account to the main account
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceRepo, targetOwner } = await req.json();

  if (!sourceRepo || typeof sourceRepo !== "string") {
    return NextResponse.json(
      { error: "sourceRepo is required (owner/name format)" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(sourceRepo)) {
    return NextResponse.json(
      { error: "sourceRepo must be in owner/name format" },
      { status: 400 }
    );
  }

  const [sourceOwner, repoName] = sourceRepo.split("/");

  // Look up tokens from saved GitHub accounts by owner name
  const srcToken = await getTokenForOwner(sourceOwner);
  if (!srcToken) {
    return NextResponse.json(
      { error: `No GitHub account found for source owner '${sourceOwner}'. Add the account in GitHub Accounts first.` },
      { status: 400 }
    );
  }

  const tgtOwner = targetOwner || null;
  const tgtToken = tgtOwner ? await getTokenForOwner(tgtOwner) : srcToken;

  // Determine target owner/org - default to the authenticated user
  let newOwner = targetOwner;

  if (!newOwner && tgtToken) {
    // Get the authenticated user for the target token
    const userRes = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${tgtToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      newOwner = userData.login;
    }
  }

  if (!newOwner) {
    return NextResponse.json(
      { error: "targetOwner is required or GITHUB_PAT must be set to determine the target account" },
      { status: 400 }
    );
  }

  if (sourceOwner.toLowerCase() === newOwner.toLowerCase()) {
    return NextResponse.json(
      { error: "Source and target owners are the same" },
      { status: 400 }
    );
  }

  // Step 1: Verify source repo exists
  const srcRes = await fetch(`${GITHUB_API}/repos/${sourceRepo}`, {
    headers: {
      Authorization: `Bearer ${srcToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!srcRes.ok) {
    return NextResponse.json(
      { error: `Source repo '${sourceRepo}' not found or not accessible` },
      { status: 404 }
    );
  }

  const srcData = await srcRes.json();

  // Step 2: Initiate transfer via GitHub API
  // Note: The token must have admin access on the source repo
  // For org transfers, the target must be an org where the user is an owner
  const transferRes = await fetch(
    `${GITHUB_API}/repos/${sourceOwner}/${repoName}/transfer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${srcToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        new_owner: newOwner,
        new_name: repoName, // Keep the same name
      }),
    }
  );

  if (!transferRes.ok) {
    const errorText = await transferRes.text();
    let hint = "";
    if (transferRes.status === 403) {
      hint = " The token must have admin rights on the source repo. For org transfers, the target user must be an org owner.";
    } else if (transferRes.status === 422) {
      hint = " The target account may already have a repo with this name, or the transfer may be restricted by org policies.";
    }
    return NextResponse.json(
      { error: `GitHub transfer failed (${transferRes.status}): ${errorText}${hint}` },
      { status: transferRes.status }
    );
  }

  const transferData = await transferRes.json();

  // Step 3: Update or create local database record
  // The repo will be at a new URL after transfer
  const existing = await prisma.gitHubRepo.findFirst({
    where: { owner: sourceOwner, name: repoName },
  });

  if (existing) {
    await prisma.gitHubRepo.update({
      where: { id: existing.id },
      data: {
        owner: newOwner,
        name: transferData.name || repoName,
        fullName: `${newOwner}/${transferData.name || repoName}`,
        htmlUrl: transferData.html_url || `https://github.com/${newOwner}/${repoName}`,
        description: transferData.description || existing.description,
        isPrivate: transferData.private ?? existing.isPrivate,
      },
    });
  } else {
    // Create a new entry for the transferred repo
    await prisma.gitHubRepo.upsert({
      where: {
        owner_name: { owner: newOwner, name: transferData.name || repoName },
      },
      update: {
        fullName: `${newOwner}/${transferData.name || repoName}`,
        htmlUrl: transferData.html_url || `https://github.com/${newOwner}/${repoName}`,
        description: transferData.description || srcData.description,
        isPrivate: transferData.private ?? srcData.private,
        language: transferData.language || srcData.language,
      },
      create: {
        owner: newOwner,
        name: transferData.name || repoName,
        fullName: `${newOwner}/${transferData.name || repoName}`,
        htmlUrl: transferData.html_url || `https://github.com/${newOwner}/${repoName}`,
        description: transferData.description || srcData.description,
        isPrivate: transferData.private ?? srcData.private,
        language: transferData.language || srcData.language,
      },
    });
  }

  return NextResponse.json({
    success: true,
    message: `Repository transferred from ${sourceRepo} to ${newOwner}/${transferData.name || repoName}`,
    newFullName: `${newOwner}/${transferData.name || repoName}`,
    newUrl: transferData.html_url || `https://github.com/${newOwner}/${repoName}`,
    note: "GitHub may take a few minutes to complete the transfer. Redirects from the old URL will be set up automatically.",
  });
}
