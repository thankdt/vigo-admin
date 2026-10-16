/**
 * Test cho scripts/pages-lib.ts — chạy bằng node:test qua tsx (KHÔNG phải vitest, xem vitest.config.ts):
 *   npm run test:pages
 *
 * Mục tiêu: chứng minh phép dựng thư mục triển khai cho từng cổng KHÔNG đụng `out/` gốc và tái hiện đúng
 * 3 CloudFront Function cũ (scripts/*-rewrite-function.js) + SPA fallback của S3 (ErrorDocument=index.html).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PORTALS, HEADERS_FILE, REQUIRED_FILES, preparePortalDir, validateOut } from './pages-lib';

function write(root: string, rel: string, body: string) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

/** Dựng một `out/` giả có đủ các trang gốc mà 4 cổng cần (nội dung khác nhau để so được). */
function fakeOut(): { work: string; out: string; dist: string } {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-lib-'));
  const out = path.join(work, 'out');
  write(out, 'index.html', 'ADMIN-ROOT');
  write(out, 'index.txt', 'RSC-ROOT');
  write(out, '404.html', 'NEXT-404');
  write(out, '404/index.html', 'NEXT-404-DIR');
  write(out, 'htx/index.html', 'HTX-LANDING');
  write(out, 'htx/login/index.html', 'HTX-LOGIN');
  write(out, 'kol-portal/login/index.html', 'KOL-LOGIN');
  write(out, 'agent-portal/login/index.html', 'AGENT-LOGIN');
  write(out, 'dashboard/index.html', 'ADMIN-DASH');
  write(out, '_next/static/chunks/a.js', 'JS');
  return { work, out, dist: path.join(work, '.pages-dist') };
}

const read = (p: string) => fs.readFileSync(p, 'utf8');

test('bảng cổng: dự án và host duy nhất, trang gốc nằm trong danh sách file bắt buộc', () => {
  assert.equal(new Set(PORTALS.map((p) => p.project)).size, PORTALS.length);
  assert.equal(new Set(PORTALS.map((p) => p.host)).size, PORTALS.length);
  assert.deepEqual(PORTALS.map((p) => p.host).sort(), [
    'admin.vigogroup.vn',
    'daily.vigogroup.vn',
    'htx.vigogroup.vn',
    'kol.vigogroup.vn',
  ]);
  for (const p of PORTALS) if (p.landing) assert.ok(REQUIRED_FILES.includes(p.landing), p.landing);
});

test('validateOut: đủ file thì không có vấn đề; thiếu thì liệt kê đúng', () => {
  const { out } = fakeOut();
  assert.deepEqual(validateOut(out), []);
  fs.rmSync(path.join(out, 'kol-portal'), { recursive: true });
  assert.deepEqual(validateOut(out), ['kol-portal/login/index.html']);
  assert.deepEqual(validateOut(path.join(out, 'khong-ton-tai')), REQUIRED_FILES);
});

test('mọi cổng: bỏ 404.html (chế độ SPA của Pages), có _headers, KHÔNG sửa out/ gốc', () => {
  const { out, dist } = fakeOut();
  for (const portal of PORTALS) {
    const dest = path.join(dist, portal.key);
    preparePortalDir(out, dest, portal, dist);
    assert.equal(fs.existsSync(path.join(dest, '404.html')), false, `${portal.key}: còn 404.html`);
    assert.equal(fs.existsSync(path.join(dest, '404/index.html')), true, `${portal.key}: mất thư mục 404/`);
    assert.equal(read(path.join(dest, '_headers')), HEADERS_FILE);
    assert.equal(fs.existsSync(path.join(dest, '_redirects')), false, `${portal.key}: _redirects làm Pages bỏ qua SPA`);
    assert.equal(read(path.join(dest, 'dashboard/index.html')), 'ADMIN-DASH');
    assert.equal(read(path.join(dest, 'index.txt')), 'RSC-ROOT');
    assert.equal(read(path.join(dest, '_next/static/chunks/a.js')), 'JS');
  }
  // out/ gốc không bị đụng
  assert.equal(read(path.join(out, '404.html')), 'NEXT-404');
  assert.equal(read(path.join(out, 'index.html')), 'ADMIN-ROOT');
});

test('trang gốc từng cổng = đúng nhánh của CloudFront Function cũ', () => {
  const { out, dist } = fakeOut();
  const expectRoot: Record<string, string> = {
    admin: 'ADMIN-ROOT', //  vigo-admin-rsc-txt-guard: không đổi URI "/"
    htx: 'HTX-LANDING', //   "/" -> /htx/index.html
    kol: 'KOL-LOGIN', //     "/" -> /kol-portal/login/index.html
    daily: 'AGENT-LOGIN', // "/" -> /agent-portal/login/index.html
  };
  for (const portal of PORTALS) {
    const dest = path.join(dist, portal.key);
    preparePortalDir(out, dest, portal, dist);
    assert.equal(read(path.join(dest, 'index.html')), expectRoot[portal.key], portal.key);
  }
  // các tệp khác của htx không bị đổi theo
  assert.equal(read(path.join(dist, 'htx', 'htx/index.html')), 'HTX-LANDING');
  assert.equal(read(path.join(dist, 'htx', 'htx/login/index.html')), 'HTX-LOGIN');
});

test('chạy lại nhiều lần cho cùng kết quả (idempotent), không để lại tệp cũ', () => {
  const { out, dist } = fakeOut();
  const portal = PORTALS.find((p) => p.key === 'htx')!;
  const dest = path.join(dist, 'htx');
  preparePortalDir(out, dest, portal, dist);
  write(dest, 'rac-cu.txt', 'x');
  preparePortalDir(out, dest, portal, dist);
  assert.equal(fs.existsSync(path.join(dest, 'rac-cu.txt')), false);
  assert.equal(read(path.join(dest, 'index.html')), 'HTX-LANDING');
});

test('từ chối đích nằm ngoài thư mục gốc cho phép (không bao giờ xoá nhầm)', () => {
  const { work, out, dist } = fakeOut();
  const portal = PORTALS[0];
  assert.throws(() => preparePortalDir(out, path.join(work, 'ngoai'), portal, dist), /ngoài/);
  assert.throws(() => preparePortalDir(out, dist, portal, dist), /ngoài|chính/);
  assert.throws(() => preparePortalDir(out, out, portal, dist), /ngoài/);
  assert.throws(() => preparePortalDir(out, path.join(dist, '..'), portal, dist), /ngoài/);
  assert.equal(fs.existsSync(path.join(out, 'index.html')), true);
});

test('thiếu file landing của cổng ⇒ lỗi rõ ràng, không triển khai bản hỏng', () => {
  const { out, dist } = fakeOut();
  fs.rmSync(path.join(out, 'htx/index.html'));
  const portal = PORTALS.find((p) => p.key === 'htx')!;
  assert.throws(() => preparePortalDir(out, path.join(dist, 'htx'), portal, dist), /htx\/index\.html/);
});
