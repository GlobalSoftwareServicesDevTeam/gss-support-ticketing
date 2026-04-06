/**
 * Server-side reCAPTCHA v3 verification.
 *
 * Env vars:
 *   RECAPTCHA_SECRET_KEY – Google reCAPTCHA v3 secret key
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY – exposed to the browser
 */

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export interface RecaptchaResult {
  success: boolean;
  score: number;
  action: string;
  error?: string;
}

/**
 * Verify a reCAPTCHA v3 token on the server.
 * Returns success with score. Fails gracefully if reCAPTCHA is not configured
 * (allows the request through so the app still works without keys set).
 */
export async function verifyRecaptcha(
  token: string | null | undefined,
  expectedAction?: string
): Promise<RecaptchaResult> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  // If reCAPTCHA is not configured, allow the request
  if (!secretKey) {
    return { success: true, score: 1.0, action: expectedAction || "" };
  }

  if (!token) {
    return { success: false, score: 0, action: "", error: "reCAPTCHA token missing" };
  }

  try {
    const res = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      return {
        success: false,
        score: 0,
        action: data.action || "",
        error: `reCAPTCHA verification failed: ${(data["error-codes"] || []).join(", ")}`,
      };
    }

    // Check action matches if expected
    if (expectedAction && data.action !== expectedAction) {
      return {
        success: false,
        score: data.score || 0,
        action: data.action || "",
        error: `reCAPTCHA action mismatch: expected ${expectedAction}, got ${data.action}`,
      };
    }

    // Score threshold: 0.5 is Google's recommended default
    const score = data.score || 0;
    if (score < 0.5) {
      return {
        success: false,
        score,
        action: data.action || "",
        error: "reCAPTCHA score too low — suspected bot activity",
      };
    }

    return {
      success: true,
      score,
      action: data.action || "",
    };
  } catch (err) {
    console.error("reCAPTCHA verification error:", err);
    // Fail open — don't block users if Google's API is down
    return { success: true, score: 1.0, action: expectedAction || "" };
  }
}

/** Check if reCAPTCHA is configured */
export function isRecaptchaConfigured(): boolean {
  return !!(process.env.RECAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
}
