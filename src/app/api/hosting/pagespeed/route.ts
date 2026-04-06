import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// POST: Run Google PageSpeed Insights analysis
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { url, strategy = "mobile" } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Ensure URL has a protocol
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  // Validate URL format
  try {
    new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  try {
    const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    apiUrl.searchParams.set("url", targetUrl);
    apiUrl.searchParams.set("strategy", strategy === "desktop" ? "desktop" : "mobile");
    apiUrl.searchParams.set("category", "performance");
    apiUrl.searchParams.append("category", "accessibility");
    apiUrl.searchParams.append("category", "best-practices");
    apiUrl.searchParams.append("category", "seo");

    // Add API key if configured (higher rate limits)
    if (process.env.GOOGLE_PAGESPEED_API_KEY) {
      apiUrl.searchParams.set("key", process.env.GOOGLE_PAGESPEED_API_KEY);
    }

    const res = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      return NextResponse.json(
        { error: errData?.error?.message || `PageSpeed API error (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();

    // Extract key metrics
    const lighthouse = data.lighthouseResult;
    const categories = lighthouse?.categories || {};
    const audits = lighthouse?.audits || {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditEntries = Object.values(audits) as any[];

    const result = {
      url: lighthouse?.finalUrl || targetUrl,
      fetchTime: lighthouse?.fetchTime,
      strategy,

      scores: {
        performance: Math.round((categories.performance?.score || 0) * 100),
        accessibility: Math.round((categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((categories["best-practices"]?.score || 0) * 100),
        seo: Math.round((categories.seo?.score || 0) * 100),
      },

      metrics: {
        firstContentfulPaint: audits["first-contentful-paint"]?.displayValue || null,
        largestContentfulPaint: audits["largest-contentful-paint"]?.displayValue || null,
        totalBlockingTime: audits["total-blocking-time"]?.displayValue || null,
        cumulativeLayoutShift: audits["cumulative-layout-shift"]?.displayValue || null,
        speedIndex: audits["speed-index"]?.displayValue || null,
        timeToInteractive: audits["interactive"]?.displayValue || null,
      },

      opportunities: auditEntries
        .filter((a) =>
          a.details?.type === "opportunity" &&
          typeof a.score === "number" &&
          a.score < 1
        )
        .map((a) => ({
          title: a.title as string,
          description: a.description as string,
          displayValue: (a.displayValue as string) || null,
          score: a.score as number,
        }))
        .slice(0, 10),

      diagnostics: auditEntries
        .filter((a) =>
          a.details?.type === "table" &&
          typeof a.score === "number" &&
          a.score < 1
        )
        .map((a) => ({
          title: a.title as string,
          description: a.description as string,
          displayValue: (a.displayValue as string) || null,
        }))
        .slice(0, 8),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("PageSpeed error:", error);
    return NextResponse.json(
      { error: "Failed to run PageSpeed analysis. The site may be unreachable or the request timed out." },
      { status: 502 }
    );
  }
}
