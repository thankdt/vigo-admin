// CloudFront Function — minimal rewrite for htx.vigogroup.vn.
//
// Why so small: Next.js static-export bundles encode the on-disk route path
// (/htx/login, /htx/dashboard, ...) into the JS chunks, so the browser URL must match for
// hydration to succeed. Rewriting /login → /htx/login/index.html caused a client-side
// exception because the bundles thought they were at /htx/login while window.location said
// /login.
//
// Net behavior:
//   - htx.vigogroup.vn/                     → S3 fetches /htx/index.html (root portal page,
//                                              JS redirects to /htx/login or /htx/dashboard).
//   - htx.vigogroup.vn/htx/<anything>       → passthrough.
//   - htx.vigogroup.vn/_next/* /favicon.ico → passthrough (shared with admin distribution).
//   - htx.vigogroup.vn/<other>              → passthrough → S3 404. Owner uses /htx/* URLs.
//
// Owners typically just open htx.vigogroup.vn (root) and the JS handles the rest, so the
// /htx/ prefix in subsequent URLs is a small UX cost worth paying for stable hydration.
function handler(event) {
  var req = event.request;
  if (req.uri === '/') {
    req.uri = '/htx/index.html';
  }
  return req;
}
