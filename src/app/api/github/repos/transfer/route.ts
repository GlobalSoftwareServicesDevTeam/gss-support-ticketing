import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

function normalizeOwner(value: string): string {
  return value.trim();
}

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
  const normalizedOwner = normalizeOwner(owner).toLowerCase();
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (acc.label.toLowerCase() === normalizedOwner ||
        acc.owner.toLowerCase() === normalizedOwner) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

async function resolveOwnerAlias(ownerInput: string): Promise<string> {
  const normalized = normalizeOwner(ownerInput);
  const normalizedLower = normalized.toLowerCase();
  const accounts = await prisma.gitHubAccount.findMany({
    select: { owner: true, label: true },
  });

  const matched = accounts.find((acc) => {
    return (
      acc.owner.toLowerCase() === normalizedLower ||
      acc.label.toLowerCase() === normalizedLower
    );
  });

  return matched?.owner || normalized;
}

async function canTokenTransferToOwner(token: string, targetOwner: string): Promise<{ ok: boolean; reason?: string }> {
  const targetLower = targetOwner.toLowerCase();

  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userRes.ok) {
    return { ok: false, reason: "Could not verify source token against GitHub /user endpoint" };
  }

  const userData = await userRes.json() as { login?: string };
  if ((userData.login || "").toLowerCase() === targetLower) {
    return { ok: true };
  }

  const orgsRes = await fetch(`${GITHUB_API}/user/orgs?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!orgsRes.ok) {
    return {
      ok: false,
      reason: "Source token cannot list org memberships; it may not have rights to transfer to the target owner",
    };
  }

  const orgs = await orgsRes.json() as Array<{ login?: string }>;
  const hasOrg = orgs.some((org) => (org.login || "").toLowerCase() === targetLower);
  if (hasOrg) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Source token user is not the '${targetOwner}' owner and is not a visible member of that org`,
  };
}

async function getAccessibleOwnersForToken(token: string): Promise<string[]> {
  const owners = new Set<string>();

  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (userRes.ok) {
    const userData = await userRes.json() as { login?: string };
    if (userData.login?.trim()) owners.add(userData.login.trim());
  }

  const orgsRes = await fetch(`${GITHUB_API}/user/orgs?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (orgsRes.ok) {
    const orgs = await orgsRes.json() as Array<{ login?: string }>;
    for (const org of orgs) {
      if (org.login?.trim()) owners.add(org.login.trim());
    }
  }

  return Array.from(owners).sort((a, b) => a.localeCompare(b));
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

// GET: list verified target owners/orgs available to the selected source token
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sourceOwner = req.nextUrl.searchParams.get("sourceOwner")?.trim();
  if (!sourceOwner) {
    return NextResponse.json({ error: "sourceOwner query parameter is required" }, { status: 400 });
  }

  const resolvedSourceOwner = await resolveOwnerAlias(sourceOwner);
  const srcToken = await getTokenForOwner(resolvedSourceOwner);
  if (!srcToken) {
    return NextResponse.json(
      { error: `No GitHub account found for source owner '${resolvedSourceOwner}'. Add the account in GitHub Accounts first.` },
      { status: 400 }
    );
  }

  const targetOwners = await getAccessibleOwnersForToken(srcToken);
  if (targetOwners.length === 0) {
    return NextResponse.json(
      {
        error: "Could not determine accessible target owners/orgs for this source token.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    sourceOwner: resolvedSourceOwner,
    targetOwners,
  });
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

    const resolvedSourceOwner = await resolveOwnerAlias(sourceOwner);
    const resolvedTargetOwner = await resolveOwnerAlias(targetOwner);

    if (resolvedSourceOwner.toLowerCase() === resolvedTargetOwner.toLowerCase()) {
      return NextResponse.json(
        { error: "Source and target owners are the same" },
        { status: 400 }
      );
    }

    const srcToken = await getTokenForOwner(resolvedSourceOwner);
    if (!srcToken) {
      return NextResponse.json(
        { error: `No GitHub account found for source owner '${resolvedSourceOwner}'. Add the account in GitHub Accounts first.` },
        { status: 400 }
      );
    }

    const transferAccess = await canTokenTransferToOwner(srcToken, resolvedTargetOwner);
    if (!transferAccess.ok) {
      return NextResponse.json(
        {
          error: `Cannot transfer to '${resolvedTargetOwner}' with the source token. ${transferAccess.reason || "Check that the source token user has transfer rights to the target owner/org."}`,
        },
        { status: 400 }
      );
    }

    const repos = await prisma.gitHubRepo.findMany({
      where: { owner: resolvedSourceOwner },
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
        `${resolvedSourceOwner}/${repo.name}`,
        resolvedTargetOwner,
        srcToken
      );
      if (result.ok) {
        results.push({
          sourceRepo: `${resolvedSourceOwner}/${repo.name}`,
          ok: true,
          newFullName: result.newFullName,
        });
      } else {
        results.push({
          sourceRepo: `${resolvedSourceOwner}/${repo.name}`,
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
      message: `Transfer complete: ${successCount}/${results.length} repos moved from ${resolvedSourceOwner} to ${resolvedTargetOwner}`,
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
  const resolvedSourceOwner = await resolveOwnerAlias(parsedSourceOwner);
  const resolvedTargetOwner = targetOwner ? await resolveOwnerAlias(targetOwner) : null;

  // Look up tokens from saved GitHub accounts by owner name
  const srcToken = await getTokenForOwner(resolvedSourceOwner);
  if (!srcToken) {
    return NextResponse.json(
      { error: `No GitHub account found for source owner '${resolvedSourceOwner}'. Add the account in GitHub Accounts first.` },
      { status: 400 }
    );
  }

  const tgtOwner = resolvedTargetOwner || null;
  const tgtToken = tgtOwner ? await getTokenForOwner(tgtOwner) : srcToken;

  // Determine target owner/org - default to the authenticated user
  let newOwner = resolvedTargetOwner;

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

  const transferAccess = await canTokenTransferToOwner(srcToken, newOwner);
  if (!transferAccess.ok) {
    return NextResponse.json(
      {
        error: `Cannot transfer to '${newOwner}' with the source token. ${transferAccess.reason || "Check that the source token user has transfer rights to the target owner/org."}`,
      },
      { status: 400 }
    );
  }

  const sourceRepoWithResolvedOwner = `${resolvedSourceOwner}/${sourceRepo.split("/")[1]}`;
  const transferResult = await transferSingleRepo(sourceRepoWithResolvedOwner, newOwner, srcToken);
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
