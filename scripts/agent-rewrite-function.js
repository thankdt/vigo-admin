// CloudFront Function — minimal rewrite for the booking-agent (đặt hộ) portal subdomain.
//
// Mirrors scripts/kol-rewrite-function.js. Next.js static-export bundles encode the on-disk
// route path (/agent-portal/login, /agent-portal/dashboard, ...) into the JS chunks, so the
// browser URL must match for hydration — hence we only rewrite the bare root and pass everything
// else through unchanged (no /login → /agent-portal/login/index.html rewrite, which would desync
// the bundle's idea of its path from window.location).
//
// Net behavior:
//   - <agent-subdomain>/                          → S3 fetches /agent-portal/login/index.html (the
//                                                    agent portal has no bare landing page; the login
//                                                    page's JS redirects to /agent-portal/dashboard
//                                                    when a valid ACTIVE-agent session exists).
//   - <agent-subdomain>/agent-portal/<anything>   → passthrough.
//   - <agent-subdomain>/_next/* /favicon.ico      → passthrough (shared S3 bucket with admin/kol/htx).
//   - <agent-subdomain>/<other>                   → passthrough → S3 404. Users use /agent-portal/* URLs.
function handler(event) {
  var req = event.request;
  if (req.uri === '/') {
    req.uri = '/agent-portal/login/index.html';
  }
  return req;
}
