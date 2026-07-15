// CloudFront Function — minimal rewrite for kol.vigogroup.vn (KOL/KOC portal).
//
// Mirrors scripts/htx-rewrite-function.js. Next.js static-export bundles encode the on-disk
// route path (/kol-portal/login, /kol-portal/dashboard, ...) into the JS chunks, so the browser
// URL must match for hydration — hence we only rewrite the bare root and pass everything else
// through unchanged (no /login → /kol-portal/login/index.html rewrite, which would desync the
// bundle's idea of its path from window.location).
//
// Net behavior:
//   - kol.vigogroup.vn/                       → S3 fetches /kol-portal/login/index.html (the KOL
//                                                portal has no bare landing page, so we go straight
//                                                to login; the login page's JS redirects to
//                                                /kol-portal/dashboard when a valid session exists).
//   - kol.vigogroup.vn/kol-portal/<anything>  → passthrough.
//   - kol.vigogroup.vn/_next/* /favicon.ico   → passthrough (shared S3 bucket with admin/htx).
//   - kol.vigogroup.vn/<other>                → passthrough → S3 404. Users use /kol-portal/* URLs.
function handler(event) {
  var req = event.request;
  if (req.uri === '/') {
    req.uri = '/kol-portal/login/index.html';
  }
  return req;
}
