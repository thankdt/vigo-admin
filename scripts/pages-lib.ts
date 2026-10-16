/**
 * Dựng thư mục triển khai Cloudflare Pages cho 4 cổng từ MỘT bản static export (`out/`).
 *
 * Bối cảnh (chuyển hosting khỏi AWS, 17/10/2026): trước đây `out/` được đẩy lên S3 `vigo-admin` và 4 CloudFront
 * (admin./htx./kol./daily.) phục vụ CHUNG bucket đó, khác nhau ở đúng một CloudFront Function:
 *   - htx.   : URI "/" -> /htx/index.html                      (scripts/htx-rewrite-function.js)
 *   - kol.   : URI "/" -> /kol-portal/login/index.html         (scripts/kol-rewrite-function.js)
 *   - daily. : URI "/" -> /agent-portal/login/index.html       (scripts/agent-rewrite-function.js)
 *   - admin. : không đổi URI (chỉ có lưới đỡ rsc-txt-guard, xem ghi chú dưới)
 * và mọi URL không có file (S3 403/404) trả /index.html với mã 200 (ErrorDocument của S3 website).
 *
 * Trên Pages mỗi cổng là MỘT project riêng (cùng nội dung, khác trang gốc):
 *   1. Trang gốc: sao chép file landing của cổng đè lên index.html — đúng byte mà Function cũ chọn, URL trình duyệt vẫn "/"
 *      (không rewrite/redirect vì bundle static-export mã hoá đường dẫn trên đĩa — bản gốc: `git show cf5bec2:scripts/htx-rewrite-function.js`).
 *      `_redirects` KHÔNG làm được việc này: rewrite 200 bị bỏ qua khi đã có file index.html ở đường dẫn nguồn.
 *   2. SPA fallback: Pages tự trả index.html (200) cho URL lạ NẾU không có `404.html` ở gốc; export của Next có 404.html
 *      nên phải XOÁ nó (đã thử thật: để lại thì Pages trả 404.html với mã 404 và bỏ qua `_redirects`). Thư mục `404/` giữ nguyên.
 *   3. `_headers`: chunk băm tên (_next/static/*) cache 1 năm như deploy-s3.ts cũ (git: cf5bec2); còn lại để mặc định (revalidate).
 *
 * KHÔNG tái hiện: CloudFront Function `vigo-admin-rsc-txt-guard` (lưới đỡ: 302 khi trình duyệt điều hướng thẳng vào
 * "<đường-dẫn>/index.txt"). Bản vá gốc nằm ở patches/next+15.5.9.patch, đã có trong mọi bản build; chỉ còn cứu các tab mở
 * bundle cũ chưa vá. Thêm lại bằng một Pages Function giới hạn bởi _routes.json nếu triệu chứng quay lại.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Portal {
  key: 'admin' | 'htx' | 'kol' | 'daily';
  /** Tên project Cloudflare Pages (đã tạo sẵn, gắn custom domain `host`). */
  project: string;
  host: string;
  /** File (tương đối với out/) được sao chép thành index.html của cổng; null = giữ index.html của admin. */
  landing: string | null;
}

export const PORTALS: readonly Portal[] = [
  { key: 'admin', project: 'vigo-admin', host: 'admin.vigogroup.vn', landing: null },
  { key: 'htx', project: 'vigo-htx', host: 'htx.vigogroup.vn', landing: 'htx/index.html' },
  { key: 'kol', project: 'vigo-kol', host: 'kol.vigogroup.vn', landing: 'kol-portal/login/index.html' },
  { key: 'daily', project: 'vigo-daily', host: 'daily.vigogroup.vn', landing: 'agent-portal/login/index.html' },
];

/** Thiếu bất kỳ mục nào ở đây nghĩa là `out/` không phải bản export đầy đủ — dừng, đừng triển khai nửa vời. */
export const REQUIRED_FILES = [
  'index.html',
  'htx/index.html',
  'kol-portal/login/index.html',
  'agent-portal/login/index.html',
  '_next',
];

export const HEADERS_FILE = ['/_next/static/*', '  Cache-Control: public, max-age=31536000, immutable', ''].join('\n');

/** Trả danh sách mục thiếu (rỗng = đạt). */
export function validateOut(outDir: string): string[] {
  return REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(outDir, rel)));
}

/**
 * Dựng `destDir` từ `outDir` cho một cổng. `allowedRoot` là thư mục duy nhất mà hàm được phép xoá/ghi bên trong:
 * `destDir` phải nằm TRONG nó (không phải chính nó) — rào chống `rm -rf` nhầm khi truyền sai đường dẫn.
 */
export function preparePortalDir(outDir: string, destDir: string, portal: Portal, allowedRoot: string): void {
  const dest = path.resolve(destDir);
  const root = path.resolve(allowedRoot);
  if (!dest.startsWith(root + path.sep)) {
    throw new Error(`đích ${dest} nằm ngoài thư mục cho phép ${root} (hoặc chính nó) — từ chối`);
  }
  const src = path.resolve(outDir);
  if (dest === src || dest.startsWith(src + path.sep) || src.startsWith(dest + path.sep)) {
    throw new Error(`đích ${dest} trùng/lồng với nguồn ${src} — từ chối`);
  }
  if (portal.landing && !fs.existsSync(path.join(src, portal.landing))) {
    throw new Error(`thiếu ${portal.landing} trong ${src} — cổng ${portal.key} không có trang gốc`);
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  fs.rmSync(path.join(dest, '404.html'), { force: true });
  if (portal.landing) fs.copyFileSync(path.join(dest, portal.landing), path.join(dest, 'index.html'));
  fs.writeFileSync(path.join(dest, '_headers'), HEADERS_FILE);
}
