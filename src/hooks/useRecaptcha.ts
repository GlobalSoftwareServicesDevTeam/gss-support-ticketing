"use client";

import { useCallback } from "react";

/**
 * Hook for executing reCAPTCHA v3 in client components.
 * Requires the reCAPTCHA script to be loaded in the page.
 */
export function useRecaptcha() {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const executeRecaptcha = useCallback(
    async (action: string): Promise<string | null> => {
      if (!siteKey) return null;

      // Wait for grecaptcha to be available
      const grecaptcha = (window as unknown as { grecaptcha?: { ready: (cb: () => void) => void; execute: (key: string, opts: { action: string }) => Promise<string> } }).grecaptcha;
      if (!grecaptcha) return null;

      return new Promise((resolve) => {
        grecaptcha.ready(async () => {
          try {
            const token = await grecaptcha.execute(siteKey, { action });
            resolve(token);
          } catch {
            resolve(null);
          }
        });
      });
    },
    [siteKey]
  );

  return { executeRecaptcha, isConfigured: !!siteKey };
}
