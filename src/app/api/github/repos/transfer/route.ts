import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

async function readGitHubError(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { message?: string; errors?: Array<{ message?: string; code?: string }>; documentation_url?: string };
    const details = Array.isArray(parsed.errors)
      ? parsed.errors
          .map((e) => e.message || e.code)
          .filter(Boolean)
          .join("; ")
      : "";
    const doc = parsed.documentation_url ? ` Docs: ${parsed.documentation_url}` : "";
    return `${parsed.message || text}${details ? ` (${details})` : ""}${doc}`;
  } catch {
    return text;
  }
}

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

async function transferSingleRepo(
  sourceRepo: string,
  newOwner: string,
  srcToken: string
) {
  const [sourceOwner, repoName] = sourceRepo.split("/");

  if (sourceOwner.toLowerCase() === newOwner.toLowerCase()) {
    return { ok: false, error: "Source and target owners are the same" };
  }

  const srcRes = await fetch(`${GITHUB_API}/repos/${sourceRepo}`, {
    headers: {
      Authorization: `Bearer ${srcToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!srcRes.ok) {
    const sourceError = await readGitHubError(srcRes);
    return {
      ok: false,
      error: `Source repo '${sourceRepo}' not accessible (${srcRes.status}): ${sourceError}`,
      status: srcRes.status,
    };
  }

  const srcData = await srcRes.json();

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
        new_name: repoName,
      }),
    }
  );

  if (!transferRes.ok) {
    const errorText = await readGitHubError(transferRes);
    let hint = "";
    if (transferRes.status === 403) {
      hint = " The token must have admin rights on the source repo. For org transfers, the target user must be an org owner.";
    } else if (transferRes.status === 422) {
      hint = " The target account may already have a repo with this name, or the transfer may be restricted by org policies.";
    }
    return {
      ok: false,
      error: `GitHub transfer failed (${transferRes.status}): ${errorText}${hint}`,
      status: transferRes.status,
    };
  }

  const transferData = await transferRes.json();

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

  return {
    ok: true,
    sourceRepo,
    newFullName: `${newOwner}/${transferData.name || repoName}`,
    newUrl: transferData.html_url || `https://github.com/${newOwner}/${repoName}`,
  };
}

// POST: transfer a repo from another GitHub account to the main account
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceRepo, sourceOwner, targetOwner, transferAll } = await req.json();

  if (transferAll) {
    if (!sourceOwner || typeof sourceOwner !== "string") {
      return NextResponse.json(
        { error: "sourceOwner is required when transferAll is true" },
        { status: 400 }
      );
    }

    if (!targetOwner || typeof targetOwner !== "string") {
      return NextResponse.json(
        { error: "targetOwner is required when transferAll is true" },
        { status: 400 }
      );
    }

    if (sourceOwner.toLowerCase() === targetOwner.toLowerCase()) {
      return NextResponse.json(
        { error: "Source and target owners are the same" },
        { status: 400 }
      );
    }

    const srcToken = await getTokenForOwner(sourceOwner);
    if (!srcToken) {
      return NextResponse.json(
        { error: `No GitHub account found for source owner '${sourceOwner}'. Add the account in GitHub Accounts first.` },
        { status: 400 }
      );
    }

    const repos = await prisma.gitHubRepo.findMany({
      where: { owner: sourceOwner },
      select: { name: true },
      orderBy: { name: "asc" },
    });

    if (repos.length === 0) {
      return NextResponse.json(
        { error: `No repos found in the local system for owner '${sourceOwner}'. Sync first.` },
        { status: 404 }
      );
    }

    const results: Array<{ sourceRepo: string; ok: boolean; newFullName?: string; error?: string; status?: number }> = [];
    for (const repo of repos) {
      const result = await transferSingleRepo(
        `${sourceOwner}/${repo.name}`,
        targetOwner,
        srcToken
      );
      if (result.ok) {
        results.push({
          sourceRepo: `${sourceOwner}/${repo.name}`,
          ok: true,
          newFullName: result.newFullName,
        });
      } else {
        results.push({
          sourceRepo: `${sourceOwner}/${repo.name}`,
          ok: false,
          error: result.error,
          status: result.status,
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - successCount;
    const failuresByStatus = results
      .filter((r) => !r.ok)
      .reduce<Record<string, number>>((acc, r) => {
        const key = String(r.status || "unknown");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

    return NextResponse.json({
      success: failedCount === 0,
      message: `Transfer complete: ${successCount}/${results.length} repos moved from ${sourceOwner} to ${targetOwner}`,
      summary: { total: results.length, success: successCount, failed: failedCount },
      failuresByStatus,
      results,
      note: "GitHub may take a few minutes to complete each transfer and apply redirects.",
    });
  }

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

  const [parsedSourceOwner] = sourceRepo.split("/");

  // Look up tokens from saved GitHub accounts by owner name
  const srcToken = await getTokenForOwner(parsedSourceOwner);
  if (!srcToken) {
    return NextResponse.json(
      { error: `No GitHub account found for source owner '${parsedSourceOwner}'. Add the account in GitHub Accounts first.` },
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

  const transferResult = await transferSingleRepo(sourceRepo, newOwner, srcToken);
  if (!transferResult.ok) {
    return NextResponse.json(
      { error: transferResult.error },
      { status: transferResult.status || 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Repository transferred from ${sourceRepo} to ${transferResult.newFullName}`,
    newFullName: transferResult.newFullName,
    newUrl: transferResult.newUrl,
    note: "GitHub may take a few minutes to complete the transfer. Redirects from the old URL will be set up automatically.",
  });
}
