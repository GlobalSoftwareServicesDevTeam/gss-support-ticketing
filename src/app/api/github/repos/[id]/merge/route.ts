import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const GITHUB_API = "https://api.github.com";

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// POST: merge another repo's history into this repo
// Uses a temporary GitHub Actions workflow to run git merge --allow-unrelated-histories
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { sourceRepo, sourceBranch, targetBranch, token } = await req.json();

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

  const srcBranch = sourceBranch || "main";
  const tgtBranch = targetBranch || "main";
  const targetFullName = `${repo.owner}/${repo.name}`;

  try {
    // Step 1: Verify source repo exists
    const srcRes = await fetch(`${GITHUB_API}/repos/${sourceRepo}`, {
      headers: ghHeaders(ghToken),
    });
    if (!srcRes.ok) {
      return NextResponse.json(
        { error: `Source repo '${sourceRepo}' not found or not accessible` },
        { status: 404 }
      );
    }

    // Step 2: Verify target repo exists
    const tgtRes = await fetch(`${GITHUB_API}/repos/${targetFullName}`, {
      headers: ghHeaders(ghToken),
    });
    if (!tgtRes.ok) {
      return NextResponse.json(
        { error: `Target repo '${repo.fullName}' not accessible on GitHub` },
        { status: 404 }
      );
    }

    // Step 3: Verify source branch exists
    const srcRefRes = await fetch(
      `${GITHUB_API}/repos/${sourceRepo}/git/ref/heads/${encodeURIComponent(srcBranch)}`,
      { headers: ghHeaders(ghToken) }
    );
    if (!srcRefRes.ok) {
      return NextResponse.json(
        { error: `Source branch '${srcBranch}' not found in ${sourceRepo}` },
        { status: 404 }
      );
    }

    // Step 4: Create a temporary workflow file in target repo
    const workflowPath = ".github/workflows/_merge-history-temp.yml";
    const workflowContent = `name: Merge History
on:
  workflow_dispatch:
    inputs:
      source_repo:
        required: true
        type: string
      source_branch:
        required: true
        type: string
        default: main
      target_branch:
        required: true
        type: string
        default: main
      pat_token:
        required: true
        type: string
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - name: Mask token
        run: echo "::add-mask::\${{ inputs.pat_token }}"
      - uses: actions/checkout@v4
        with:
          ref: \${{ inputs.target_branch }}
          fetch-depth: 0
          token: \${{ inputs.pat_token }}
      - name: Merge history
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git remote add source https://x-access-token:\${{ inputs.pat_token }}@github.com/\${{ inputs.source_repo }}.git
          git fetch source
          git merge source/\${{ inputs.source_branch }} --allow-unrelated-histories -m "Merge history from \${{ inputs.source_repo }} (\${{ inputs.source_branch }})"
          git push origin \${{ inputs.target_branch }}
          git remote remove source
`;

    const contentBase64 = Buffer.from(workflowContent).toString("base64");

    // Check if workflow file already exists (to get its sha for update)
    let existingSha: string | undefined;
    const existingRes = await fetch(
      `${GITHUB_API}/repos/${targetFullName}/contents/${workflowPath}`,
      { headers: ghHeaders(ghToken) }
    );
    if (existingRes.ok) {
      const existingData = await existingRes.json();
      existingSha = existingData.sha;
    }

    // Create or update the workflow file
    const putBody: Record<string, unknown> = {
      message: "chore: add temporary merge-history workflow",
      content: contentBase64,
    };
    if (existingSha) putBody.sha = existingSha;

    const createWfRes = await fetch(
      `${GITHUB_API}/repos/${targetFullName}/contents/${workflowPath}`,
      {
        method: "PUT",
        headers: ghHeaders(ghToken),
        body: JSON.stringify(putBody),
      }
    );

    if (!createWfRes.ok) {
      const err = await createWfRes.text();
      console.error("Failed to create workflow file:", err);
      return NextResponse.json(
        { error: "Failed to create merge workflow in target repo" },
        { status: 500 }
      );
    }

    // Step 5: Wait a moment for GitHub to register the workflow
    await new Promise((r) => setTimeout(r, 3000));

    // Step 6: Trigger the workflow via workflow_dispatch
    const dispatchRes = await fetch(
      `${GITHUB_API}/repos/${targetFullName}/actions/workflows/_merge-history-temp.yml/dispatches`,
      {
        method: "POST",
        headers: ghHeaders(ghToken),
        body: JSON.stringify({
          ref: tgtBranch,
          inputs: {
            source_repo: sourceRepo,
            source_branch: srcBranch,
            target_branch: tgtBranch,
            pat_token: ghToken,
          },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const dispErr = await dispatchRes.text();
      console.error("Workflow dispatch failed:", dispErr);

      // Clean up the workflow file
      const getRes = await fetch(
        `${GITHUB_API}/repos/${targetFullName}/contents/${workflowPath}`,
        { headers: ghHeaders(ghToken) }
      );
      if (getRes.ok) {
        const getData = await getRes.json();
        await fetch(
          `${GITHUB_API}/repos/${targetFullName}/contents/${workflowPath}`,
          {
            method: "DELETE",
            headers: ghHeaders(ghToken),
            body: JSON.stringify({
              message: "chore: remove temporary merge-history workflow",
              sha: getData.sha,
            }),
          }
        );
      }

      return NextResponse.json(
        { error: "Failed to trigger merge workflow. Ensure the target repo has GitHub Actions enabled." },
        { status: 500 }
      );
    }

    // Step 7: Poll for the workflow run to complete (max ~2 min)
    let runId: number | null = null;
    let runStatus = "queued";
    let runConclusion = "";
    const startTime = Date.now();
    const maxWait = 120_000; // 2 minutes

    // Wait a bit then find the run
    await new Promise((r) => setTimeout(r, 3000));

    while (Date.now() - startTime < maxWait) {
      const runsRes = await fetch(
        `${GITHUB_API}/repos/${targetFullName}/actions/workflows/_merge-history-temp.yml/runs?per_page=1&event=workflow_dispatch`,
        { headers: ghHeaders(ghToken) }
      );

      if (runsRes.ok) {
        const runsData = await runsRes.json();
        if (runsData.workflow_runs?.length > 0) {
          const run = runsData.workflow_runs[0];
          runId = run.id;
          runStatus = run.status;
          runConclusion = run.conclusion || "";

          if (runStatus === "completed") break;
        }
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    // Step 8: Clean up the workflow file
    const cleanupRes = await fetch(
      `${GITHUB_API}/repos/${targetFullName}/contents/${workflowPath}`,
      { headers: ghHeaders(ghToken) }
    );
    if (cleanupRes.ok) {
      const cleanupData = await cleanupRes.json();
      await fetch(
        `${GITHUB_API}/repos/${targetFullName}/contents/${workflowPath}`,
        {
          method: "DELETE",
          headers: ghHeaders(ghToken),
          body: JSON.stringify({
            message: "chore: remove temporary merge-history workflow",
            sha: cleanupData.sha,
          }),
        }
      );
    }

    if (runStatus === "completed" && runConclusion === "success") {
      return NextResponse.json({
        success: true,
        message: `Successfully merged ${sourceRepo}/${srcBranch} into ${repo.fullName}/${tgtBranch}`,
        runId,
      });
    } else if (runStatus === "completed") {
      return NextResponse.json(
        {
          error: `Merge workflow failed (conclusion: ${runConclusion}). Check the Actions tab at https://github.com/${targetFullName}/actions for details.`,
          runId,
        },
        { status: 422 }
      );
    } else {
      // Timed out waiting
      return NextResponse.json({
        success: true,
        message: `Merge workflow triggered but still running. Check https://github.com/${targetFullName}/actions for status.`,
        pending: true,
        runId,
      });
    }
  } catch (error) {
    console.error("Merge history error:", error);
    return NextResponse.json(
      { error: "Failed to merge repository history" },
      { status: 500 }
    );
  }
}
