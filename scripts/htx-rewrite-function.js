// CloudFront Function — rewrites every viewer request URI under htx.vigogroup.vn to live
// inside the static-export's /htx/* tree. Caller sees `htx.vigogroup.vn/dashboard`,
// CloudFront fetches `/htx/dashboard/index.html` from the same S3 bucket as the admin app.
//
// Static-export quirks the rewrite has to honour:
//   - "/" maps to "/htx" (so it eventually serves /htx/index.html via the next-config
//     trailingSlash:true behavior).
//   - Asset paths under /_next/* are SHARED with the admin distribution and must NOT be
//     prefixed — the same hashed chunks are at /_next/... in S3.
//   - Any /htx/* URI passes through unchanged so direct access still works.
function handler(event) {
  var req = event.request;
  var uri = req.uri;

  // Don't touch shared static assets.
  if (uri.indexOf('/_next/') === 0 || uri === '/favicon.ico') {
    return req;
  }

  // Already inside the portal tree — no-op.
  if (uri === '/htx' || uri.indexOf('/htx/') === 0) {
    return req;
  }

  // Root → /htx (resolves to /htx/index.html via static-export's directory routing).
  if (uri === '/') {
    req.uri = '/htx';
    return req;
  }

  // Anything else: prefix with /htx so /dashboard becomes /htx/dashboard.
  req.uri = '/htx' + uri;
  return req;
}
