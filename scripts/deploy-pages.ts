/**
 * Triển khai bản static export (`out/`) lên 4 project Cloudflare Pages (admin / htx / kol / daily).
 * Thay `scripts/deploy-s3.ts` (S3 + CloudFront) sau khi chuyển hosting khỏi AWS — xem scripts/pages-lib.ts để biết cách
 * mỗi cổng được dựng.
 *
 *   npm run deploy:prod                      # = tsx scripts/deploy-pages.ts, cũng chạy ở cuối `npm run build`
 *   npx tsx scripts/deploy-pages.ts --dry-run          # chỉ dựng .pages-dist/<cổng>, KHÔNG đẩy lên
 *   npx tsx scripts/deploy-pages.ts --only=htx,kol     # chỉ các cổng liệt kê
 *
 * Cần trong `.env` (xem cloudflare-config.template): CLOUDFLARE_API_TOKEN (quyền Pages:Edit) + CLOUDFLARE_ACCOUNT_ID.
 * Dùng `wrangler` ghim phiên bản qua npx (không thêm vào package.json). Cloudflare thi thoảng trả lỗi nội bộ tạm thời
 * "Failed to publish your Function ... Unknown internal error" ở lần đầu (đã gặp thật 17/10/2026) — thử lại là qua, nên
 * script tự thử lại tối đa 3 lần mỗi cổng.
 */
import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

import { PORTALS, Portal, preparePortalDir, validateOut } from './pages-lib';

dotenv.config();

const WRANGLER = 'wrangler@4.145.0';
const OUT_DIR = path.join(process.cwd(), 'out');
const DIST_ROOT = path.join(process.cwd(), '.pages-dist');
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 8000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function gitMessage(): string {
  const run = (a: string[]) => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();
  const sha = run(['rev-parse', '--short', 'HEAD']);
  const subject = run(['log', '-1', '--format=%s']).slice(0, 200);
  return sha ? `${sha} ${subject}` : 'manual deploy';
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function wranglerDeploy(portal: Portal, dir: string, message: string): { ok: boolean; url?: string; tail: string } {
  const r = spawnSync(
    'npx',
    ['--yes', WRANGLER, 'pages', 'deploy', dir, '--project-name', portal.project, '--branch', 'main', '--commit-dirty=true', '--commit-message', message],
    { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } },
  );
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const m = text.match(/https:\/\/[a-z0-9]+\.[a-z0-9-]+\.pages\.dev/);
  const tail = text.split('\n').filter((l) => l.trim()).slice(-4).join(' | ').slice(0, 300);
  return { ok: r.status === 0 && /Deployment complete/.test(text), url: m?.[0], tail };
}

/** Production alias `<project>.pages.dev` cập nhật sau vài giây: thử lại đến khi nội dung khớp. */
async function verify(portal: Portal, dir: string): Promise<boolean> {
  const expected = sha256(fs.readFileSync(path.join(dir, 'index.html')));
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`https://${portal.project}.pages.dev/`, { redirect: 'follow' });
      if (res.status === 200 && sha256(Buffer.from(await res.arrayBuffer())) === expected) return true;
    } catch {
      /* thử lại */
    }
    await sleep(3000);
  }
  return false;
}

async function main() {
  const problems = validateOut(OUT_DIR);
  if (problems.length) {
    console.error(`out/ không đầy đủ (thiếu: ${problems.join(', ')}). Chạy \`npx next build\` trước.`);
    process.exit(1);
  }
  const portals = PORTALS.filter((p) => !only || only.includes(p.key));
  if (only && portals.length !== only.length) {
    console.error(`--only chứa cổng lạ. Hợp lệ: ${PORTALS.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }
  if (!dryRun && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)) {
    console.error('Thiếu CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID trong .env (xem cloudflare-config.template).');
    process.exit(1);
  }

  const message = gitMessage();
  const failed: string[] = [];
  for (const portal of portals) {
    const dir = path.join(DIST_ROOT, portal.key);
    preparePortalDir(OUT_DIR, dir, portal, DIST_ROOT);
    console.log(`[${portal.key}] dựng xong ${dir}`);
    if (dryRun) continue;

    let ok = false;
    for (let attempt = 1; attempt <= ATTEMPTS && !ok; attempt++) {
      const r = wranglerDeploy(portal, dir, message);
      ok = r.ok;
      console.log(`[${portal.key}] lần ${attempt}/${ATTEMPTS}: ${ok ? `OK ${r.url ?? ''}` : `LỖI ${r.tail}`}`);
      if (!ok && attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
    if (!ok) {
      failed.push(portal.key);
      continue;
    }
    const good = await verify(portal, dir);
    console.log(`[${portal.key}] kiểm https://${portal.project}.pages.dev/ ${good ? 'KHỚP' : 'CHƯA KHỚP (chờ vài phút rồi kiểm tay)'} — tên miền: https://${portal.host}`);
    if (!good) failed.push(`${portal.key}(verify)`);
  }

  if (dryRun) console.log('Dry-run xong: chưa đẩy gì lên Cloudflare.');
  if (failed.length) {
    console.error(`THẤT BẠI: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log('Upload complete!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
