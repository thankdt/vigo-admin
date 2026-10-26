/**
 * Hàm thuần cho đường phát hành PROD có rào (`scripts/release-prod.sh`, `scripts/deploy-pages.ts`).
 * Không gọi mạng, không đọc token, không chạy tiến trình con — chỉ đọc/ghi tệp được truyền vào.
 * Test: scripts/release-lib.node.test.ts (`npm run test:pages`). Quy trình: docs/DEPLOY.md.
 *
 * Phần kiểm phải chạy TRƯỚC khi có node_modules (cây sạch, ref == origin/main, build-id PROD là tổ tiên,
 * mode tệp token, TTY) buộc phải viết bằng bash trong release-prod.sh. `parseBuildId`/`prodGate`/`isPrivateMode`
 * dưới đây là đặc tả của CÙNG luật đó (test ở release-lib.node.test.ts); release-prod.node.test.ts kiểm bản bash
 * trên đúng các ca ấy. Sửa luật thì sửa CẢ HAI nơi.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Tên miền API PROD mà bundle PROD PHẢI chứa (src/lib/api.ts: mặc định khi không đặt NEXT_PUBLIC_API_BASE_URL). */
export const PROD_API_HOST = 'api.vigogroup.vn';
/** Chuỗi của môi trường DEV — xuất hiện trong bundle PROD nghĩa là build nhầm biến môi trường DEV. */
export const DEV_MARKER = 'vigodev.online';

/** Vị trí build-info: NGOÀI `out/` để không bị đẩy công khai (out/ được chép nguyên lên 4 project Pages). */
export const BUILD_INFO_REL = path.join('.release', 'build-info.json');
/** Tệp công khai duy nhất mô tả bản build: chỉ chứa sha. Rào "PROD có code chưa vào main" đọc tệp này. */
export const BUILD_ID_REL = path.join('out', 'build-id.txt');

const SHA40 = /^[0-9a-f]{40}$/;

export function isSha40(s: string): boolean {
  return SHA40.test(s);
}

/**
 * Nội dung `/build-id.txt` lấy từ PROD → sha hoặc null.
 * Pages trả index.html (200) cho URL không có tệp (SPA fallback, xem pages-lib.ts) ⇒ "có phản hồi 200" KHÔNG có nghĩa là
 * có build-id; chỉ chấp nhận đúng 40 hex.
 */
export function parseBuildId(text: string | null | undefined): string | null {
  if (text == null) return null;
  const t = text.trim();
  return isSha40(t) ? t : null;
}

export interface ProdGateInput {
  /** sha đang chạy trên PROD (null = không đọc được / chưa có build-id.txt). */
  prodSha: string | null;
  /** `git merge-base --is-ancestor prodSha target` (bỏ qua khi prodSha null). */
  isAncestor: boolean;
  /** Người đã xác nhận bằng `--first-ship` rằng ref đích chứa mọi thứ đang chạy trên PROD. */
  firstShip: boolean;
}

/** Rào "PROD có code chưa vào main". `--first-ship` CHỈ nới ca thiếu build-id, không bao giờ nới ca không-phải-tổ-tiên. */
export function prodGate(i: ProdGateInput): { ok: boolean; reason: string } {
  if (i.prodSha) {
    return i.isAncestor
      ? { ok: true, reason: `PROD ${i.prodSha} là tổ tiên của ref đích` }
      : { ok: false, reason: `PROD đang chạy ${i.prodSha} — KHÔNG phải tổ tiên của ref đích (PROD có code chưa vào ref này)` };
  }
  return i.firstShip
    ? { ok: true, reason: 'PROD chưa có build-id.txt — người đã xác nhận bằng --first-ship' }
    : { ok: false, reason: 'PROD chưa có/không đọc được build-id.txt — cần --first-ship (người xác nhận)' };
}

/** Tệp token chỉ được chủ sở hữu đọc/ghi: không bit nào cho group/other (600, 400, 700…). */
export function isPrivateMode(mode: number): boolean {
  return (mode & 0o077) === 0;
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Liệt kê tệp (đường dẫn tương đối, dấu `/`, đã sắp) dưới `root`. Gặp symlink ⇒ ném lỗi (không đoán đích). */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink()) throw new Error(`symlink trong ${root}: ${r} — từ chối`);
      if (ent.isDirectory()) walk(abs, r);
      else if (ent.isFile()) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

/** Băm cả cây: sha256 của các dòng `<đường-dẫn>\0<sha256 nội dung>\n` theo thứ tự đã sắp. Đổi/thêm/xoá 1 tệp ⇒ đổi băm. */
export function treeHash(root: string): string {
  const h = crypto.createHash('sha256');
  for (const rel of listFiles(root)) {
    h.update(`${rel}\0${sha256(fs.readFileSync(path.join(root, rel)))}\n`);
  }
  return h.digest('hex');
}

export function fileSha256(p: string): string {
  return sha256(fs.readFileSync(p));
}

const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.txt', '.json', '.css', '.map']);

/**
 * Quét bundle: `out/_next` PHẢI chứa PROD_API_HOST; KHÔNG tệp nào trong `out/` được chứa DEV_MARKER.
 * Trả danh sách vấn đề (rỗng = đạt).
 */
export function scanBundle(outDir: string): string[] {
  const problems: string[] = [];
  if (!fs.existsSync(path.join(outDir, '_next'))) return [`thiếu ${path.join(outDir, '_next')}`];
  let prodHits = 0;
  const devHits: string[] = [];
  for (const rel of listFiles(outDir)) {
    if (!TEXT_EXT.has(path.extname(rel))) continue;
    const body = fs.readFileSync(path.join(outDir, rel), 'utf8');
    if (rel.startsWith('_next/') && body.includes(PROD_API_HOST)) prodHits++;
    if (body.includes(DEV_MARKER)) devHits.push(rel);
  }
  if (prodHits === 0) problems.push(`không tệp nào trong out/_next chứa ${PROD_API_HOST} (bundle không trỏ API PROD?)`);
  if (devHits.length) {
    problems.push(`${devHits.length} tệp chứa ${DEV_MARKER} (build nhầm biến DEV?): ${devHits.slice(0, 5).join(', ')}`);
  }
  return problems;
}

/** Dòng lỗi của `tsc --noEmit` → khoá `<tệp>:<mã TS>` (bỏ số dòng/cột: chúng xê dịch khi sửa tệp). */
export function parseTscErrors(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+):/);
    if (m) keys.push(`${m[1].trim()}:${m[2]}`);
  }
  return keys;
}

/** Baseline: mỗi dòng một khoá `<tệp>:<mã TS>` (trùng lặp = nhiều lỗi cùng loại), `#` là chú thích. */
export function parseBaseline(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
}

function counts(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

/**
 * So lỗi typecheck với baseline theo BỘI (multiset): khoá nào có số lỗi > baseline là lỗi MỚI.
 * Sửa bớt lỗi baseline thì đạt (in ở `fixed`) — nhưng KHÔNG được bù lỗi mới bằng cách sửa lỗi cũ.
 */
export function compareTypecheck(baseline: string[], current: string[]): { added: string[]; fixed: string[] } {
  const b = counts(baseline);
  const c = counts(current);
  const added: string[] = [];
  const fixed: string[] = [];
  for (const [k, n] of c) for (let i = b.get(k) ?? 0; i < n; i++) added.push(k);
  for (const [k, n] of b) for (let i = c.get(k) ?? 0; i < n; i++) fixed.push(k);
  return { added: added.sort(), fixed: fixed.sort() };
}

export interface BuildInfo {
  schema: 1;
  sha: string;
  ref: string;
  allowRef: boolean;
  firstShip: boolean;
  prodShaAtPrepare: string | null;
  builtAtUtc: string;
  node: string;
  lockSha256: string;
  outTreeSha256: string;
}

export function makeBuildInfo(
  dir: string,
  o: { sha: string; ref: string; allowRef: boolean; firstShip: boolean; prodSha: string | null; now: Date; node: string },
): BuildInfo {
  if (!isSha40(o.sha)) throw new Error(`sha không hợp lệ: ${o.sha}`);
  return {
    schema: 1,
    sha: o.sha,
    ref: o.ref,
    allowRef: o.allowRef,
    firstShip: o.firstShip,
    prodShaAtPrepare: o.prodSha,
    builtAtUtc: o.now.toISOString(),
    node: o.node,
    lockSha256: fileSha256(path.join(dir, 'package-lock.json')),
    outTreeSha256: treeHash(path.join(dir, 'out')),
  };
}

export function readBuildInfo(dir: string): BuildInfo | null {
  const p = path.join(dir, BUILD_INFO_REL);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as BuildInfo;
}

/**
 * Kiểm bản build trong `dir` trước khi đẩy: build-info có, sha == `headSha`, `out/build-id.txt` == sha,
 * băm cây `out/` tính lại khớp bản ghi (out/ bị sửa sau prepare ⇒ từ chối). Trả danh sách vấn đề (rỗng = đạt).
 */
export function checkBuildInfo(dir: string, headSha: string): string[] {
  const info = readBuildInfo(dir);
  if (!info) return [`thiếu ${BUILD_INFO_REL} — chạy \`npm run release:prepare\` (scripts/release-prod.sh prepare) trước`];
  const problems: string[] = [];
  if (info.schema !== 1) problems.push(`build-info schema lạ: ${String(info.schema)}`);
  if (!isSha40(info.sha ?? '')) problems.push('build-info.sha không phải 40 hex');
  if (info.sha !== headSha) problems.push(`build-info.sha ${info.sha} ≠ HEAD ${headSha}`);
  const idPath = path.join(dir, BUILD_ID_REL);
  const id = fs.existsSync(idPath) ? fs.readFileSync(idPath, 'utf8').trim() : null;
  if (id !== info.sha) problems.push(`out/build-id.txt (${id ?? 'thiếu'}) ≠ build-info.sha`);
  const outDir = path.join(dir, 'out');
  if (!fs.existsSync(outDir)) problems.push('thiếu out/');
  else {
    const now = treeHash(outDir);
    if (now !== info.outTreeSha256) problems.push(`out/ đã đổi sau prepare (băm ${now.slice(0, 12)} ≠ ${String(info.outTreeSha256).slice(0, 12)})`);
  }
  return problems;
}
