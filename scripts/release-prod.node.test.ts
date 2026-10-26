/**
 * Test HÀNH VI cho scripts/release-prod.sh — chạy bash script THẬT trên repo git THẬT dựng trong thư mục tạm
 * (`npm run test:pages`, node:test qua tsx).
 *
 * An toàn (đây là script đẩy PROD): môi trường dựng TỪ ĐẦU, không kế thừa process.env —
 *   PATH = <stub>:/usr/bin:/bin · HOME/TMPDIR = thư mục tạm · GIT_CONFIG_GLOBAL=/dev/null · GIT_CONFIG_NOSYSTEM=1.
 * `curl`/`npm`/`npx`/`wrangler`/`kubectl` là stub ghi log; gọi ngoài kịch bản ⇒ mã ≠ 0. Không token thật, không mạng.
 * Ngoại lệ có chủ đích: stub `npx tsx …/release-cli.ts` chuyển cho tsx THẬT của repo (hàm thuần, chỉ đọc/ghi thư mục tạm).
 * Không có bash hoặc git ⇒ bỏ qua cả tệp.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HAS_BASH = spawnSync('bash', ['-c', 'exit 0']).status === 0;
const HAS_GIT = spawnSync('git', ['--version']).status === 0;
const REPO = path.resolve(__dirname, '..');
const TSX_CLI = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SKIP = !HAS_BASH || !HAS_GIT ? 'cần bash + git' : !fs.existsSync(TSX_CLI) ? 'chưa npm ci (thiếu tsx)' : false;

/** Môi trường dựng từ đầu (next khai NODE_ENV bắt buộc trong ProcessEnv — ép kiểu, KHÔNG trộn process.env). */
const cleanEnv = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

const FAKE_TOKEN = 'tok_FAKE_khong-duoc-in-ra_123456';
const FAKE_ACCOUNT = 'acc_FAKE_987654';

const STUB = String.raw`#!/bin/bash
name=$(basename "$0")
printf '%s %s\n' "$name" "$*" >>"$STUB_LOG"
case "$name" in
  curl)
    url=''
    for a in "$@"; do case "$a" in https://*) url=$a ;; esac; done
    case "$url" in
      https://admin.vigogroup.vn/build-id.txt*)
        case "${'$'}{STUB_BUILD_ID:-MISSING}" in
          MISSING) printf '<!DOCTYPE html><html>spa fallback</html>' ;;
          FAIL) exit 22 ;;
          *) printf '%s\n' "$STUB_BUILD_ID" ;;
        esac ;;
      https://*.vigogroup.vn/_next/static/*) [ "${'$'}{STUB_HTTP:-}" = ok ] || exit 22 ;;
      https://*.vigogroup.vn/\?t=*)
        [ "${'$'}{STUB_HTTP:-}" = ok ] || exit 22
        printf '<html><script src="/_next/static/chunks/main-abc.js"></script></html>' ;;
      *) echo "stub curl: URL ngoài kịch bản: $url" >&2; exit 97 ;;
    esac ;;
  npm)
    case "$1" in
      ci)
        for d in node_modules/next/dist/client/components/router-reducer node_modules/next/dist/esm/client/components/router-reducer; do
          mkdir -p "$d"
          if [ "${'$'}{STUB_PATCH:-ok}" = ok ]; then echo '// [vigo patch] stub' >"$d/fetch-server-response.js"; else echo '// chua va' >"$d/fetch-server-response.js"; fi
        done ;;
      ls)
        echo 'nextn@0.1.0'
        [ "${'$'}{STUB_NPMLS:-ok}" = ok ] || echo '├── foo@1.0.0 invalid: "^2" from the root project' ;;
      test) exit 0 ;;
      run)
        case "$2" in
          test:pages) exit 0 ;;
          typecheck)
            while IFS= read -r l; do
              l=${'$'}{l%%#*}
              [ -n "$l" ] || continue
              echo "${'$'}{l%:*}(1,1): error ${'$'}{l##*:}: stub"
            done <scripts/typecheck-baseline.txt
            [ "${'$'}{STUB_TSC:-}" = new ] && echo 'src/moi.ts(3,4): error TS2304: Cannot find name x.'
            exit 2 ;;
          *) echo "stub npm run $2: ngoài kịch bản" >&2; exit 98 ;;
        esac ;;
      *) echo "stub npm $1: ngoài kịch bản" >&2; exit 98 ;;
    esac ;;
  npx)
    case "$1" in
      tsx)
        case "$2" in
          */release-cli.ts) shift; exec node "$STUB_TSX_CLI" "$@" ;;
          scripts/deploy-pages.ts)
            [ "${'$'}{3:-}" = --dry-run ] && exit 0
            echo 'stub: deploy-pages THẬT bị gọi' >&2; exit 96 ;;
        esac ;;
      next)
        [ "${'$'}{2:-}" = build ] || exit 98
        [ -z "${'$'}{NEXT_PUBLIC_API_BASE_URL+x}" ] || { echo 'stub: NEXT_PUBLIC_API_BASE_URL vẫn còn đặt khi build' >&2; exit 95; }
        mkdir -p out/_next/static/chunks
        echo '<html><script src="/_next/static/chunks/main-abc.js"></script></html>' >out/index.html
        if [ "${'$'}{STUB_BUNDLE:-prod}" = dev ]; then api=https://api.vigodev.online; else api=https://api.vigogroup.vn; fi
        echo "const API='$api';" >out/_next/static/chunks/main-abc.js
        exit 0 ;;
    esac
    echo "stub npx $*: ngoài kịch bản" >&2; exit 98 ;;
  *) echo "stub: $name KHÔNG được phép gọi" >&2; exit 99 ;;
esac
`;

interface Fx {
  work: string;
  repo: string;
  bin: string;
  home: string;
  log: string;
  c1: string;
  c2: string;
  side: string;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args],
    { cwd, encoding: 'utf8', env: cleanEnv({ PATH: '/usr/bin:/bin', HOME: cwd, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }) },
  );
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const created: string[] = [];
after(() => {
  for (const d of created) fs.rmSync(d, { recursive: true, force: true });
});

function fixture(): Fx {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-prod-')));
  created.push(work);
  const repo = path.join(work, 'repo');
  const origin = path.join(work, 'origin.git');
  const bin = path.join(work, 'bin');
  const home = path.join(work, 'home');
  for (const d of [repo, bin, home, path.join(work, 'tmp')]) fs.mkdirSync(d, { recursive: true });
  git(work, 'init', '-q', '--bare', origin);
  git(repo, 'init', '-q');
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.mkdirSync(path.join(repo, 'patches'));
  for (const f of ['release-prod.sh', 'release-cli.ts', 'release-lib.ts', 'typecheck-baseline.txt']) {
    fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(repo, 'scripts', f));
  }
  for (const f of fs.readdirSync(path.join(REPO, 'patches'))) {
    fs.copyFileSync(path.join(REPO, 'patches', f), path.join(repo, 'patches', f));
  }
  fs.writeFileSync(path.join(repo, '.gitignore'), '/node_modules/\n/out/\n/.release/\n/.pages-dist/\n');
  fs.writeFileSync(path.join(repo, 'package-lock.json'), '{}\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'c1');
  const c1 = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'remote', 'add', 'origin', origin);
  fs.writeFileSync(path.join(repo, 'README.md'), 'c2\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'c2');
  const c2 = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  git(repo, 'switch', '-q', '-c', 'side', c1);
  fs.writeFileSync(path.join(repo, 'SIDE.md'), 'side\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'side');
  const side = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', 'main');

  for (const n of ['curl', 'npm', 'npx', 'wrangler', 'kubectl']) {
    fs.writeFileSync(path.join(bin, n), STUB, { mode: 0o755 });
  }
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  return { work, repo, bin, home, log: path.join(work, 'stub.log'), c1, c2, side };
}

const outputs: string[] = [];

function run(fx: Fx, args: string[], extra: Record<string, string> = {}): { status: number | null; out: string } {
  const env: Record<string, string> = {
    PATH: `${fx.bin}:/usr/bin:/bin`,
    HOME: fx.home,
    TMPDIR: path.join(fx.work, 'tmp'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    STUB_LOG: fx.log,
    STUB_TSX_CLI: TSX_CLI,
    RELEASE_VERIFY_SLEEP: '0',
    ...extra,
  };
  const r = spawnSync('bash', [path.join(fx.repo, 'scripts', 'release-prod.sh'), ...args], {
    cwd: fx.repo,
    env: cleanEnv(env),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  outputs.push(out);
  return { status: r.status, out };
}

const stubLog = (fx: Fx) => (fs.existsSync(fx.log) ? fs.readFileSync(fx.log, 'utf8') : '');

function releaseWorktree(fx: Fx): string {
  const list = git(fx.repo, 'worktree', 'list', '--porcelain');
  const m = list.split('\n').find((l) => l.startsWith('worktree ') && path.basename(l).startsWith('vigo-admin-release.'));
  assert.ok(m, `không thấy worktree phát hành:\n${list}`);
  return m.slice('worktree '.length);
}

test('bash -n: cú pháp hợp lệ', { skip: !HAS_BASH }, () => {
  const r = spawnSync('bash', ['-n', path.join(REPO, 'scripts', 'release-prod.sh')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('mã nguồn: không source tệp token, không set -x, không CONFIRM_PHRASE, không tạo tag', () => {
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'release-prod.sh'), 'utf8');
  const code = src
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  assert.doesNotMatch(code, /(^|[\s;])(source|\.)\s+["$]/m);
  assert.doesNotMatch(code, /set\s+-[a-z]*x/);
  assert.doesNotMatch(src, /CONFIRM_PHRASE/);
  assert.doesNotMatch(code, /git[^\n]*\btag\b/);
  assert.match(code, /set -euo pipefail/);
  assert.match(code, /umask 077/);
});

test('không lệnh con ⇒ 1 + usage; rollback-help in đủ 4 project', { skip: SKIP }, () => {
  const fx = fixture();
  const r = run(fx, []);
  assert.equal(r.status, 1);
  assert.match(r.out, /prepare/);
  const h = run(fx, ['rollback-help']);
  assert.equal(h.status, 0);
  for (const p of ['vigo-admin', 'vigo-htx', 'vigo-kol', 'vigo-daily']) assert.match(h.out, new RegExp(p));
});

test('prepare: cây bẩn ⇒ 1, chưa gọi mạng/npm', { skip: SKIP }, () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.repo, 'README.md'), 'sửa dở\n');
  const r = run(fx, ['prepare', '--first-ship']);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /không sạch/);
  assert.equal(stubLog(fx), '');
});

test('prepare: ref ≠ origin/main mà không --allow-ref ⇒ 1', { skip: SKIP }, () => {
  const fx = fixture();
  const r = run(fx, ['prepare', '--ref', 'side', '--first-ship']);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /≠ origin\/main/);
  assert.doesNotMatch(stubLog(fx), /npm ci/);
});

test('prepare: build-id PROD không phải tổ tiên ⇒ 1, kể cả có --first-ship', { skip: SKIP }, () => {
  const fx = fixture();
  for (const extra of [[], ['--first-ship']]) {
    const r = run(fx, ['prepare', ...extra], { STUB_BUILD_ID: fx.side });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /KHÔNG phải tổ tiên/);
  }
  const unknown = run(fx, ['prepare'], { STUB_BUILD_ID: 'd'.repeat(40) });
  assert.equal(unknown.status, 1, unknown.out);
  assert.match(unknown.out, /không có trong repo cục bộ/);
  assert.doesNotMatch(stubLog(fx), /npm ci/);
});

test('prepare: thiếu build-id (Pages trả index.html) mà không --first-ship ⇒ 1', { skip: SKIP }, () => {
  const fx = fixture();
  for (const mode of ['MISSING', 'FAIL']) {
    const r = run(fx, ['prepare'], { STUB_BUILD_ID: mode });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /--first-ship/);
  }
  assert.doesNotMatch(stubLog(fx), /npm ci/);
});

test('prepare đạt → verify → ship không TTY bị chặn → cleanup', { skip: SKIP }, () => {
  const fx = fixture();
  const r = run(fx, ['prepare'], { STUB_BUILD_ID: fx.c1, NEXT_PUBLIC_API_BASE_URL: 'https://api.vigodev.online' });
  assert.equal(r.status, 0, r.out);
  const wt = releaseWorktree(fx);
  assert.match(r.out, new RegExp(`npm run deploy:prod -- --dir ${wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal(fs.readFileSync(path.join(wt, 'out', 'build-id.txt'), 'utf8').trim(), fx.c2);
  const info = JSON.parse(fs.readFileSync(path.join(wt, '.release', 'build-info.json'), 'utf8'));
  assert.equal(info.sha, fx.c2);
  assert.equal(info.ref, 'origin/main');
  assert.equal(info.allowRef, false);
  assert.equal(info.prodShaAtPrepare, fx.c1);
  assert.equal(info.outTreeSha256.length, 64);
  assert.ok(!fs.existsSync(path.join(wt, 'out', 'build-info.json')));
  const log = stubLog(fx);
  for (const want of ['npm ci', 'npx next build', 'npm test', 'npm run test:pages', 'npm run typecheck', 'npx tsx scripts/deploy-pages.ts --dry-run']) {
    assert.ok(log.includes(want), `thiếu "${want}" trong log stub:\n${log}`);
  }
  assert.doesNotMatch(log, /^(wrangler|kubectl) /m);

  const v = run(fx, ['verify', '--dir', wt], { STUB_HTTP: 'ok', STUB_BUILD_ID: fx.c2 });
  assert.equal(v.status, 0, v.out);
  const vBad = run(fx, ['verify', '--dir', wt], { STUB_HTTP: 'ok', STUB_BUILD_ID: fx.c1 });
  assert.equal(vBad.status, 1, vBad.out);
  assert.match(vBad.out, /admin\.vigogroup\.vn/);

  const s = run(fx, ['ship', '--dir', wt], { CLOUDFLARE_API_TOKEN: FAKE_TOKEN, CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT });
  assert.equal(s.status, 1, s.out);
  assert.match(s.out, /terminal thật/);
  assert.doesNotMatch(stubLog(fx), /deploy-pages\.ts(?! --dry-run)/);

  assert.equal(run(fx, ['cleanup', '--dir', fx.repo]).status, 1);
  const c = run(fx, ['cleanup', '--dir', wt]);
  assert.equal(c.status, 0, c.out);
  assert.ok(!fs.existsSync(wt));
  assert.doesNotMatch(git(fx.repo, 'worktree', 'list'), /vigo-admin-release\./);
});

test('prepare --first-ship: bundle lẫn DEV / lỗi typecheck mới / thiếu marker bản vá / npm ls invalid ⇒ 1', { skip: SKIP }, () => {
  const fx = fixture();
  const cases: [Record<string, string>, RegExp][] = [
    [{ STUB_BUNDLE: 'dev' }, /vigodev\.online/],
    [{ STUB_TSC: 'new' }, /lỗi typecheck MỚI/],
    [{ STUB_PATCH: 'bad' }, /\[vigo patch\]/],
    [{ STUB_NPMLS: 'bad' }, /invalid/],
  ];
  for (const [extra, msg] of cases) {
    const r = run(fx, ['prepare', '--first-ship'], extra);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, msg);
    assert.match(r.out, /cleanup --dir/);
  }
});

test('ship: môi trường tác tử AI ⇒ 1 trước mọi việc khác', { skip: SKIP }, () => {
  const fx = fixture();
  for (const v of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'AI_AGENT']) {
    const r = run(fx, ['ship'], { [v]: '1', CLOUDFLARE_API_TOKEN: FAKE_TOKEN, CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /tác tử AI/);
  }
  assert.equal(stubLog(fx), '');
});

test('ship: tệp token mode 644 ⇒ 1; mode 600 qua bước token rồi dừng vì không TTY', { skip: SKIP }, () => {
  const fx = fixture();
  const dir = path.join(fx.home, '.config', 'vigo');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'cloudflare.env');
  fs.writeFileSync(f, `# mẫu\nCLOUDFLARE_API_TOKEN="${FAKE_TOKEN}"\nexport CLOUDFLARE_ACCOUNT_ID=${FAKE_ACCOUNT}\n`);
  fs.chmodSync(f, 0o644);
  const r = run(fx, ['ship']);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /mode 644/);

  fs.chmodSync(f, 0o600);
  const r2 = run(fx, ['ship']);
  assert.equal(r2.status, 1, r2.out);
  assert.match(r2.out, /token lấy từ/);
  assert.match(r2.out, /terminal thật/);

  fs.unlinkSync(f);
  const r3 = run(fx, ['ship']);
  assert.equal(r3.status, 1, r3.out);
  assert.match(r3.out, /cloudflare\.env/);
});

test('ship: không TTY ⇒ 1 (không có đường CONFIRM_PHRASE qua env)', { skip: SKIP }, () => {
  const fx = fixture();
  const r = run(fx, ['ship'], {
    CLOUDFLARE_API_TOKEN: FAKE_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT,
    CONFIRM_PHRASE: 'DAY-ADMIN-PROD',
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /terminal thật/);
});

test('read_kv: parse tệp token bằng grep (không source) — nháy, export, CRLF, dòng cuối thắng', { skip: SKIP }, () => {
  const fx = fixture();
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'release-prod.sh'), 'utf8');
  const fn = src.match(/^read_kv\(\) \{[\s\S]*?^\}$/m);
  assert.ok(fn, 'không tìm thấy hàm read_kv');
  const f = path.join(fx.work, 'kv.env');
  const marker = path.join(fx.work, 'da-chay');
  fs.writeFileSync(
    f,
    [
      '# chú thích',
      `CLOUDFLARE_API_TOKEN=cu`,
      `  export CLOUDFLARE_API_TOKEN="moi-1"\r`,
      `CLOUDFLARE_ACCOUNT_ID='acc 2'`,
      `X=$(touch ${marker})`,
      '',
    ].join('\n'),
  );
  const kv = (k: string) =>
    spawnSync('bash', ['-c', `${fn[0]}\nread_kv ${k} "$1"`, 'x', f], { encoding: 'utf8', env: cleanEnv({ PATH: '/usr/bin:/bin' }) }).stdout;
  assert.equal(kv('CLOUDFLARE_API_TOKEN'), 'moi-1');
  assert.equal(kv('CLOUDFLARE_ACCOUNT_ID'), 'acc 2');
  assert.equal(kv('KHONG_CO'), '');
  kv('X');
  assert.ok(!fs.existsSync(marker), 'nội dung tệp token bị thực thi');
});

test('không đầu ra nào chứa giá trị token giả', { skip: SKIP }, () => {
  assert.ok(outputs.length > 0);
  for (const o of outputs) {
    assert.ok(!o.includes(FAKE_TOKEN), 'lộ token');
    assert.ok(!o.includes(FAKE_ACCOUNT), 'lộ account id');
  }
});
