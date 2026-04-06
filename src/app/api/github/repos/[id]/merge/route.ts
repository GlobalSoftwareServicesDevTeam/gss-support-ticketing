import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const GITHUB_API = "https://api.github.com";

// POST: merge another repo's history into this repo
// This uses GitHub's "import" approach: adds source repo as a remote, fetches, and merges
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { sourceRepo, sourceBranch, targetBranch, token, strategy } = await req.json();

  if (!sourceRepo || typeof sourceRepo !== "string") {
    return NextResponse.json(
      { error: "sourceRepo is required (owner/name format)" },
      { status: 400 }
    );
  }

  // Validate format
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(sourceRepo)) {
    return NextResponse.json(
      { error: "sourceRepo must be in owner/name format" },
      { status: 400 }
    );
  }

  const repo = await prisma.gitHubRepo.findUnique({ where: { id } });
  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const ghToken = token || process.env.GITHUB_PAT;
  if (!ghToken) {
    return NextResponse.json(
      { error: "No GitHub token provided and GITHUB_PAT not set" },
      { status: 400 }
    );
  }

  const mergeStrategy = strategy || "merge"; // "merge" or "rebase"
  const srcBranch = sourceBranch || "main";
  const tgtBranch = targetBranch || "main";

  // Step 1: Verify source repo exists and is accessible
  const srcRes = await fetch(`${GITHUB_API}/repos/${sourceRepo}`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
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

  // Step 2: Verify target repo exists
  const tgtRes = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.name}`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!tgtRes.ok) {
    return NextResponse.json(
      { error: `Target repo '${repo.fullName}' not accessible on GitHub` },
      { status: 404 }
    );
  }

  // Step 3: Use GitHub Actions workflow dispatch to run the merge,
  // or create a merge commit via the API using the Git Data API

  // Approach: Create a temporary branch from source, push to target, then merge
  // We use Git references and merge API

  try {
    // Get the latest SHA of the source branch
    const srcRefRes = await fetch(
      `${GITHUB_API}/repos/${sourceRepo}/git/ref/heads/${encodeURIComponent(srcBranch)}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!srcRefRes.ok) {
      return NextResponse.json(
        { error: `Source branch '${srcBranch}' not found in ${sourceRepo}` },
        { status: 404 }
      );
    }

    const srcRefData = await srcRefRes.json();
    const sourceSha = srcRefData.object.sha;

    // Create a temporary branch in target repo from the source SHA
    // First, we need to create the commit in the target repo
    // We'll use the merge API which allows unrelated histories

    const tempBranchName = `merge-from-${sourceRepo.replace("/", "-")}-${Date.now()}`;

    // Get source commit tree
    const srcCommitRes = await fetch(
      `${GITHUB_API}/repos/${sourceRepo}/git/commits/${sourceSha}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!srcCommitRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch source commit details" },
        { status: 500 }
      );
    }

    // Get target branch SHA
    const tgtRefRes = await fetch(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/git/ref/heads/${encodeURIComponent(tgtBranch)}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!tgtRefRes.ok) {
      return NextResponse.json(
        { error: `Target branch '${tgtBranch}' not found in ${repo.fullName}` },
        { status: 404 }
      );
    }

    const tgtRefData = await tgtRefRes.json();
    const targetSha = tgtRefData.object.sha;

    // Create a temp branch in target from the source SHA
    // This works if both repos are under the same owner or the token has access
    const createRefRes = await fetch(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/git/refs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${tempBranchName}`,
          sha: targetSha,
        }),
      }
    );

    if (!createRefRes.ok) {
      // Fall back: try the merge API directly
      // Use the merges endpoint which supports cross-repo merges
      const mergeRes = await fetch(
        `${GITHUB_API}/repos/${repo.owner}/${repo.name}/merges`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            base: tgtBranch,
            head: sourceSha,
            commit_message: `Merge history from ${sourceRepo} (${srcBranch}) into ${repo.fullName} (${tgtBranch})`,
          }),
        }
      );

      if (!mergeRes.ok) {
        const mergeErr = await mergeRes.text();
        return NextResponse.json(
          {
            error: `GitHub merge failed. This usually means the repos have unrelated histories. You may need to perform this merge locally using: git remote add source ${srcData.clone_url} && git fetch source && git merge source/${srcBranch} --allow-unrelated-histories`,
            details: mergeErr,
            localInstructions: {
              step1: `git clone ${repo.htmlUrl}`,
              step2: `cd ${repo.name}`,
              step3: `git remote add source ${srcData.clone_url}`,
              step4: `git fetch source`,
              step5: mergeStrategy === "rebase"
                ? `git rebase source/${srcBranch}`
                : `git merge source/${srcBranch} --allow-unrelated-histories -m "Merge history from ${sourceRepo}"`,
              step6: `git push origin ${tgtBranch}`,
              step7: `git remote remove source`,
            },
          },
          { status: 422 }
        );
      }

      const mergeData = await mergeRes.json();
      return NextResponse.json({
        success: true,
        message: `Successfully merged ${sourceRepo}/${srcBranch} into ${repo.fullName}/${tgtBranch}`,
        commitSha: mergeData.sha,
        commitUrl: mergeData.html_url,
      });
    }

    // Temp branch created, now merge it with the target
    const mergeRes = await fetch(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/merges`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base: tempBranchName,
          head: sourceSha,
          commit_message: `Import history from ${sourceRepo} (${srcBranch})`,
        }),
      }
    );

    let mergeResult = null;
    if (mergeRes.ok) {
      mergeResult = await mergeRes.json();
    }

    // Now merge the temp branch into target
    const finalMergeRes = await fetch(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/merges`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base: tgtBranch,
          head: tempBranchName,
          commit_message: `Merge history from ${sourceRepo} (${srcBranch}) into ${tgtBranch}`,
        }),
      }
    );

    // Clean up temp branch
    await fetch(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/git/refs/heads/${tempBranchName}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!finalMergeRes.ok) {
      const finalErr = await finalMergeRes.text();
      return NextResponse.json(
        {
          error: `Merge into ${tgtBranch} failed. Repos may have unrelated histories.`,
          details: finalErr,
          localInstructions: {
            step1: `git clone ${repo.htmlUrl}`,
            step2: `cd ${repo.name}`,
            step3: `git remote add source ${srcData.clone_url}`,
            step4: `git fetch source`,
            step5: `git merge source/${srcBranch} --allow-unrelated-histories -m "Merge history from ${sourceRepo}"`,
            step6: `git push origin ${tgtBranch}`,
            step7: `git remote remove source`,
          },
        },
        { status: 422 }
      );
    }

    const finalData = await finalMergeRes.json();

    return NextResponse.json({
      success: true,
      message: `Successfully merged ${sourceRepo}/${srcBranch} into ${repo.fullName}/${tgtBranch}`,
      commitSha: mergeResult?.sha || finalData.sha,
      commitUrl: finalData.html_url,
    });
  } catch (error) {
    console.error("Merge history error:", error);
    return NextResponse.json(
      { error: "Failed to merge repository history" },
      { status: 500 }
    );
  }
}
