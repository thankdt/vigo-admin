/**
 * Test cho scripts/release-lib.ts — node:test qua tsx (`npm run test:pages`), KHÔNG phải vitest.
 * Mục tiêu: các rào của đường phát hành PROD (docs/DEPLOY.md) đúng ở cả ca đạt lẫn ca phải dừng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BUILD_ID_REL,
  BUILD_INFO_REL,
  checkBuildInfo,
  compareTypecheck,
  isPrivateMode,
  makeBuildInfo,
  parseBaseline,
  parseBuildId,
  parseTscErrors,
  prodGate,
  scanBundle,
  treeHash,
} from './release-lib';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function write(root: string, rel: string, body: string) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'release-lib-'));
}

test('parseBuildId: chỉ nhận đúng 40 hex (SPA fallback trả index.html 200 ⇒ null)', () => {
  assert.equal(parseBuildId(`${SHA_A}\n`), SHA_A);
  assert.equal(parseBuildId(`  ${SHA_A}  `), SHA_A);
  assert.equal(parseBuildId('<!DOCTYPE html><html>…</html>'), null);
  assert.equal(parseBuildId(SHA_A.toUpperCase()), null);
  assert.equal(parseBuildId(SHA_A.slice(0, 39)), null);
  assert.equal(parseBuildId(''), null);
  assert.equal(parseBuildId(null), null);
});

test('prodGate: không phải tổ tiên ⇒ dừng, kể cả có --first-ship', () => {
  assert.equal(prodGate({ prodSha: SHA_A, isAncestor: true, firstShip: false }).ok, true);
  assert.equal(prodGate({ prodSha: SHA_A, isAncestor: false, firstShip: false }).ok, false);
  assert.equal(prodGate({ prodSha: SHA_A, isAncestor: false, firstShip: true }).ok, false);
});

test('prodGate: thiếu build-id ⇒ chỉ qua khi người xác nhận --first-ship', () => {
  assert.equal(prodGate({ prodSha: null, isAncestor: false, firstShip: false }).ok, false);
  assert.equal(prodGate({ prodSha: null, isAncestor: false, firstShip: true }).ok, true);
});

test('isPrivateMode: chỉ chủ sở hữu (600/400/700) — 644/640/660 bị từ chối', () => {
  for (const m of [0o600, 0o400, 0o700]) assert.equal(isPrivateMode(m), true, m.toString(8));
  for (const m of [0o644, 0o640, 0o660, 0o604, 0o601, 0o666]) assert.equal(isPrivateMode(m), false, m.toString(8));
});

test('scanBundle: đạt khi _next chứa API PROD và không có vigodev.online', () => {
  const out = path.join(tmp(), 'out');
  write(out, 'index.html', '<script src="/_next/static/chunks/a.js"></script>');
  write(out, '_next/static/chunks/a.js', 'const API="https://api.vigogroup.vn";');
  assert.deepEqual(scanBundle(out), []);
});

test('scanBundle: dừng khi bundle không trỏ API PROD hoặc lẫn DEV', () => {
  const out = path.join(tmp(), 'out');
  write(out, 'index.html', 'x');
  write(out, '_next/static/chunks/a.js', 'const API="https://api.vigodev.online";');
  const p = scanBundle(out);
  assert.equal(p.length, 2);
  assert.match(p[0], /api\.vigogroup\.vn/);
  assert.match(p[1], /vigodev\.online/);

  const out2 = path.join(tmp(), 'out');
  write(out2, '_next/static/chunks/a.js', 'https://api.vigogroup.vn');
  write(out2, 'htx/index.html', '<a href="https://admin.vigodev.online">');
  assert.equal(scanBundle(out2).length, 1);

  assert.match(scanBundle(path.join(tmp(), 'khong-co'))[0], /thiếu/);
});

test('parseTscErrors: khoá tệp:mã, bỏ số dòng/cột và dòng tiếp nối', () => {
  const text = [
    '> nextn@0.1.0 typecheck',
    "src/a b/(app)/x.tsx(195,9): error TS2322: Type 'X' is not assignable.",
    "  Type 'undefined' is not assignable to type 'string | null'.",
    'src/y.ts(1,1): error TS2554: Expected 3 arguments, but got 2.',
  ].join('\n');
  assert.deepEqual(parseTscErrors(text), ['src/a b/(app)/x.tsx:TS2322', 'src/y.ts:TS2554']);
});

test('compareTypecheck: so theo bội — thêm 1 lỗi cùng loại vẫn là lỗi MỚI; sửa lỗi cũ không bù được lỗi mới', () => {
  const base = parseBaseline('# chú thích\nf.tsx:TS2554\nf.tsx:TS2554\n\nf.tsx:TS2345 # cuối dòng\n');
  assert.deepEqual(base, ['f.tsx:TS2554', 'f.tsx:TS2554', 'f.tsx:TS2345']);
  assert.deepEqual(compareTypecheck(base, [...base]), { added: [], fixed: [] });
  assert.deepEqual(compareTypecheck(base, ['f.tsx:TS2554']), { added: [], fixed: ['f.tsx:TS2345', 'f.tsx:TS2554'] });
  assert.deepEqual(compareTypecheck(base, [...base, 'f.tsx:TS2554']).added, ['f.tsx:TS2554']);
  const swapped = compareTypecheck(base, ['f.tsx:TS2554', 'f.tsx:TS2554', 'g.ts:TS2304']);
  assert.deepEqual(swapped.added, ['g.ts:TS2304']);
});

test('baseline trong repo đọc được và khớp đúng 6 lỗi có sẵn ở macro-rule-quick-edit-dialog.tsx', () => {
  const base = parseBaseline(fs.readFileSync(path.join(__dirname, 'typecheck-baseline.txt'), 'utf8'));
  assert.equal(base.length, 6);
  for (const k of base) assert.match(k, /^src\/app\/\(app\)\/bookings\/components\/macro-rule-quick-edit-dialog\.tsx:TS\d+$/);
});

test('treeHash: ổn định, đổi khi sửa/thêm/đổi tên tệp; symlink bị từ chối', () => {
  const out = path.join(tmp(), 'out');
  write(out, 'index.html', 'A');
  write(out, '_next/x.js', 'B');
  const h1 = treeHash(out);
  assert.equal(treeHash(out), h1);
  write(out, '_next/x.js', 'B2');
  const h2 = treeHash(out);
  assert.notEqual(h2, h1);
  write(out, 'new.txt', '');
  assert.notEqual(treeHash(out), h2);
  fs.renameSync(path.join(out, 'new.txt'), path.join(out, 'new2.txt'));
  assert.notEqual(treeHash(out), h2);
  fs.symlinkSync('/etc/hosts', path.join(out, 'link'));
  assert.throws(() => treeHash(out), /symlink/);
});

function preparedDir(sha: string): string {
  const dir = tmp();
  write(dir, 'package-lock.json', '{}');
  write(dir, 'out/index.html', 'A');
  write(dir, BUILD_ID_REL, `${sha}\n`);
  const info = makeBuildInfo(dir, { sha, ref: 'origin/main', allowRef: false, firstShip: false, prodSha: null, now: new Date(0), node: 'v22' });
  write(dir, BUILD_INFO_REL, JSON.stringify(info));
  return dir;
}

test('build-info: nằm NGOÀI out/ (out/ được chép công khai lên Pages)', () => {
  assert.ok(!BUILD_INFO_REL.startsWith(`out${path.sep}`));
  assert.ok(BUILD_ID_REL.startsWith(`out${path.sep}`));
});

test('checkBuildInfo: đạt khi khớp HEAD và out/ không đổi', () => {
  const dir = preparedDir(SHA_A);
  assert.deepEqual(checkBuildInfo(dir, SHA_A), []);
  const info = JSON.parse(fs.readFileSync(path.join(dir, BUILD_INFO_REL), 'utf8'));
  assert.equal(info.builtAtUtc, '1970-01-01T00:00:00.000Z');
  assert.equal(info.lockSha256.length, 64);
});

test('checkBuildInfo: thiếu build-info / sha ≠ HEAD / out/ bị sửa / build-id lệch ⇒ từ chối', () => {
  assert.match(checkBuildInfo(tmp(), SHA_A)[0], /release:prepare/);

  const d1 = preparedDir(SHA_A);
  assert.ok(checkBuildInfo(d1, SHA_B).some((p) => /≠ HEAD/.test(p)));

  const d2 = preparedDir(SHA_A);
  write(d2, 'out/_next/injected.js', 'x');
  assert.ok(checkBuildInfo(d2, SHA_A).some((p) => /out\/ đã đổi/.test(p)));

  const d3 = preparedDir(SHA_A);
  fs.writeFileSync(path.join(d3, BUILD_ID_REL), SHA_B);
  const p3 = checkBuildInfo(d3, SHA_A);
  assert.ok(p3.some((p) => /build-id\.txt/.test(p)));
});

test('makeBuildInfo: sha sai định dạng ⇒ ném lỗi', () => {
  const dir = tmp();
  write(dir, 'package-lock.json', '{}');
  write(dir, 'out/index.html', 'A');
  assert.throws(
    () => makeBuildInfo(dir, { sha: 'abc', ref: 'r', allowRef: false, firstShip: false, prodSha: null, now: new Date(), node: 'v' }),
    /sha/,
  );
});
