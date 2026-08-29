declare global {
  interface Window {
    _gaq?: unknown[][];
  }
}

const GA_ACCOUNT = "UA-25482641-1";

function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return false;
  const hostname = window.location?.hostname ?? "";
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return false;
  }
  return true;
}

let initialized = false;

export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  if (!isAnalyticsEnabled()) {
    return;
  }

  window._gaq = window._gaq || [];
  window._gaq.push(["_setAccount", GA_ACCOUNT]);
  window._gaq.push(["_setDomainName", "none"]);
  window._gaq.push(["_setAllowLinker", true]);
  window._gaq.push(["_trackPageview"]);

  const ga = document.createElement("script");
  ga.type = "text/javascript";
  ga.async = true;
  ga.src = `${
    window.location.protocol === "https:" ? "https://ssl" : "http://www"
  }.google-analytics.com/ga.js`;
  const s = document.getElementsByTagName("script")[0];
  if (s?.parentNode) {
    s.parentNode.insertBefore(ga, s);
  } else {
    document.head.appendChild(ga);
  }
}

export function trackPageView(path?: string): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsEnabled()) return;

  window._gaq = window._gaq || [];
  if (path) {
    window._gaq.push(["_trackPageview", path]);
  } else {
    window._gaq.push(["_trackPageview"]);
  }
}

export function trackEvent(
  category: string,
  action: string,
  label?: string,
): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsEnabled()) return;

  window._gaq = window._gaq || [];
  if (label !== undefined) {
    window._gaq.push(["_trackEvent", category, action, label]);
  } else {
    window._gaq.push(["_trackEvent", category, action]);
  }
}
