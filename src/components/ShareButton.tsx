import { useCallback, useState } from "react";
import { trackEvent } from "../analytics";

/**
 * Shares a hand via the platform share sheet (iOS/Android/desktop browsers
 * that support the Web Share API), falling back to copying the link to the
 * clipboard everywhere else.
 */
export function ShareButton({
  url,
  title,
  text,
  className = "text-sm font-semibold text-emerald-700 hover:text-emerald-900 hover:underline",
}: {
  url: string;
  title: string;
  text?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    trackEvent("Sharing", "Share Hand");

    if (navigator.share) {
      navigator.share({ title, text, url }).catch(() => {
        // The user dismissed the share sheet, or the platform refused the
        // request outright; either way there is nothing to recover from.
      });
      return;
    }

    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // No clipboard permission; the user can still copy the URL bar.
      });
  }, [url, title, text]);

  return (
    <button type="button" onClick={handleShare} className={className}>
      {copied ? "Link copied!" : "Share Hand"}
    </button>
  );
}
