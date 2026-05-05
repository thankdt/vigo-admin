// CloudFront Function — rewrites every viewer request URI under htx.vigogroup.vn to live
// inside the static-export's /htx/* tree. Caller sees `htx.vigogroup.vn/dashboard`,
// CloudFront fetches `/htx/dashboard/index.html` from the same S3 bucket as the admin app.
//
// Static-export quirks the rewrite has to honour:
//   - next.config sets trailingSlash:true → on disk every page is `<route>/index.html`. We
//     rewrite directly to the final file path so S3 never issues a 301-to-add-slash, which
//     would leak the `/htx/` prefix into the user's URL bar.
//   - "/" maps to "/htx/index.html" (the portal's root redirect page).
//   - Asset paths under /_next/* are SHARED with the admin distribution and must NOT be
//     prefixed — the same hashed chunks live at /_next/... in S3.
//   - Any /htx/* URI passes through unchanged (still served by the same bucket).
function handler(event) {
  var req = event.request;
  var uri = req.uri;

  // Don't touch shared static assets.
  if (uri.indexOf('/_next/') === 0 || uri === '/favicon.ico') {
    return req;
  }

  // Already inside the portal tree — no-op (still in the same bucket).
  if (uri === '/htx' || uri.indexOf('/htx/') === 0) {
    return req;
  }

  // Root → portal index.
  if (uri === '/') {
    req.uri = '/htx/index.html';
    return req;
  }

  // For paths that look like a route (no file extension), rewrite directly to the
  // backing index.html under /htx so S3 returns 200 instead of redirecting.
  // Path with extension (e.g. /robots.txt) is rewritten as-is so S3 either serves it or 404s.
  var lastSlash = uri.lastIndexOf('/');
  var lastDot = uri.lastIndexOf('.');
  var hasExtension = lastDot > lastSlash;

  if (hasExtension) {
    req.uri = '/htx' + uri;
  } else {
    // Strip optional trailing slash so we don't double up: "/login" or "/login/" → "/htx/login/index.html".
    var clean = uri.charAt(uri.length - 1) === '/' ? uri.slice(0, -1) : uri;
    req.uri = '/htx' + clean + '/index.html';
  }
  return req;
}
