declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// GA4 measurement ID. Public by design — it ships in the page source — so it
// lives here rather than in an environment variable.
//
// The previous value was UA-25482641-1, a Universal Analytics property. UA
// stopped processing data on 2023-07-01 and the properties were deleted in
// 2024, so that code had been sending page views into a void for years.
const GA_MEASUREMENT_ID = "G-V8KS5372FL";

// Analytics runs on the production hostnames only. Preview deploys share a
// build artifact with production by design, so the hostname is what separates
// them — a build-time flag could not, since promotion redeploys the very same
// bundle rather than rebuilding it.
const PRODUCTION_HOSTS = ["saycbridge.com", "www.saycbridge.com"];

function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return false;
  return PRODUCTION_HOSTS.includes(window.location?.hostname ?? "");
}

function gtag(...args: unknown[]): void {
  // gtag.js requires the raw `arguments` object, so push the array-like value
  // itself rather than a spread copy.
  window.dataLayer?.push(args);
}

let initialized = false;

export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  if (!isAnalyticsEnabled()) return;

  window.dataLayer = window.dataLayer || [];
  gtag("js", new Date());
  // This is a client-routed single page app, so the automatic page view would
  // fire once for the whole session and miss every subsequent route. Pages
  // send their own through trackPageView instead.
  gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function trackPageView(path?: string): void {
  if (!isAnalyticsEnabled()) return;

  gtag("event", "page_view", {
    page_path: path ?? window.location.pathname,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(
  category: string,
  action: string,
  label?: string,
): void {
  if (!isAnalyticsEnabled()) return;

  // GA4 has no first-class category/label, but it surfaces these two
  // parameters in reports, which keeps the call sites and the historical
  // shape of this data unchanged.
  gtag("event", action, {
    event_category: category,
    ...(label === undefined ? {} : { event_label: label }),
  });
}
