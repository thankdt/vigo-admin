/**
 * Test HÀNH VI cho scripts/release-prod.sh — chạy bash script THẬT trên repo git THẬT dựng trong thư mục tạm
 * (`npm run test:pages`, node:test qua tsx).
 *
 * An toàn (đây là script đẩy PROD): môi trường dựng TỪ ĐẦU, không kế thừa process.env —
 *   PATH = <stub>:/usr/bin:/bin · HOME/TMPDIR = thư mục tạm · GIT_CONFIG_GLOBAL=/dev/null · GIT_CONFIG_NOSYSTEM=1.
 * `curl`/`npm`/`npx`/`wrangler`/`kubectl` là stub ghi log; gọi ngoài kịch bản ⇒ mã ≠ 0. Không token thật, không mạng.
 * Ngoại lệ có chủ đích: stub `npx tsx …/release-cli.ts` chuyển cho tsx THẬT của repo (hàm thuần, chỉ đọc/ghi thư mục tạm).
 * Stub nào nhận được CLOUDFLARE_* trong env (trừ `deploy-pages.ts` bản thật) ghi `TOKEN-LEAK` vào log.
 * Phần sau TTY của ship được phủ bằng `ship --preflight` và bằng `script` (PTY giả, /usr/bin/script): các ca PTY CHỨNG
 * MINH rào TTY/cụm xác nhận lách được bằng PTY — chúng là chống lỡ tay, không phải rào chống tác tử (docs/DEPLOY.md §4).
 * Không có bash hoặc git ⇒ bỏ qua cả tệp.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
real_deploy=0
[ "$name" = npx ] && [ "${'$'}{1:-}" = tsx ] && [ "${'$'}{2:-}" = scripts/deploy-pages.ts ] && [ "${'$'}{3:-}" != --dry-run ] && real_deploy=1
if [ -n "${'$'}{CLOUDFLARE_API_TOKEN:-}${'$'}{CLOUDFLARE_ACCOUNT_ID:-}" ] && [ "$real_deploy" = 0 ]; then
  echo "TOKEN-LEAK $name ${'$'}{1:-} ${'$'}{2:-}" >>"$STUB_LOG"
fi
case "$name" in
  curl)
    url=''
    for a in "$@"; do case "$a" in https://*) url=$a ;; esac; done
    case "$url" in
      https://*.vigogroup.vn/build-id.txt*)
        h=${'$'}{url#https://}
        h=${'$'}{h%%.*}
        v=${'$'}{STUB_BUILD_ID:-MISSING}
        [ -f "$STUB_LOG.deployed" ] && [ -n "${'$'}{STUB_BUILD_ID_AFTER:-}" ] && v=$STUB_BUILD_ID_AFTER
        ov="STUB_BUILD_ID_$h"
        [ -n "${'$'}{!ov:-}" ] && v=${'$'}{!ov}
        case "$v" in
          MISSING) printf '<!DOCTYPE html><html>spa fallback</html>' ;;
          FAIL) exit 22 ;;
          *) printf '%s\n' "$v" ;;
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
      test)
        [ "${'$'}{STUB_NPMTEST:-ok}" = ok ] && exit 0
        echo 'stub: 1 test ĐỎ' >&2; exit 1 ;;
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
            if [ "${'$'}{3:-}" = --dry-run ]; then
              [ "${'$'}{STUB_DRYRUN:-ok}" = ok ] && exit 0
              echo 'stub: dry-run lỗi' >&2; exit 1
            fi
            if [ "${'$'}{STUB_DEPLOY:-}" = ok ]; then
              if [ "${'$'}{CLOUDFLARE_API_TOKEN:-}" = "${'$'}{STUB_EXPECT_TOKEN:-x}" ] && [ "${'$'}{CLOUDFLARE_ACCOUNT_ID:-}" = "${'$'}{STUB_EXPECT_ACCOUNT:-x}" ]; then
                echo 'deploy-pages-stub: token dung' >>"$STUB_LOG"
                : >"$STUB_LOG.deployed"
                exit 0
              fi
              echo 'deploy-pages-stub: token SAI' >>"$STUB_LOG"; exit 93
            fi
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

function baseEnv(fx: Fx, extra: Record<string, string>): Record<string, string> {
  return {
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
}

/** `script` = bản script chạy (mặc định bản trong repo tạm; lệnh ship mà prepare in ra dùng bản TRONG worktree). */
function run(fx: Fx, args: string[], extra: Record<string, string> = {}, script = path.join(fx.repo, 'scripts', 'release-prod.sh')): { status: number | null; out: string } {
  const r = spawnSync('bash', [script, ...args], {
    cwd: fx.repo,
    env: cleanEnv(baseEnv(fx, extra)),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  outputs.push(out);
  return { status: r.status, out };
}

/** PTY giả qua /usr/bin/script (BSD trên macOS, util-linux trên Linux). */
const HAS_SCRIPT = fs.existsSync('/usr/bin/script') && (process.platform === 'darwin' || process.platform === 'linux');
const SKIP_PTY = SKIP || (!HAS_SCRIPT ? 'cần /usr/bin/script' : false);
const sq = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`;

/**
 * Chạy bash script trong PTY; mỗi `answers[i]` = [mẫu lời nhắc, câu trả lời]: chỉ gõ câu trả lời KHI lời nhắc đã hiện
 * (không đoán thời điểm ⇒ không chập chờn). Trả cả số câu đã trả lời.
 */
function runPty(fx: Fx, script: string, args: string[], extra: Record<string, string>, answers: [RegExp, string][]): Promise<{ status: number | null; out: string; answered: number }> {
  const cmd = ['bash', script, ...args];
  const argv = process.platform === 'darwin' ? ['-q', '/dev/null', ...cmd] : ['-q', '-e', '-c', cmd.map(sq).join(' '), '/dev/null'];
  // stdin của `script` phải là pipe thật: BSD `script` (macOS) từ chối stdin là socket (pipe của Node) hay FIFO (macOS cài
  // FIFO bằng socket) ⇒ chuyển qua `cat` bằng process substitution. Không bao giờ đóng stdin trước khi tiến trình thoát.
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-c', 'exec /usr/bin/script "$@" < <(exec cat 2>/dev/null)', 'pty', ...argv], {
      cwd: fx.repo,
      env: cleanEnv(baseEnv(fx, extra)),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let from = 0;
    let i = 0;
    const onData = (d: string) => {
      out += d;
      while (i < answers.length) {
        const m = answers[i][0].exec(out.slice(from));
        if (!m) break;
        from += m.index + m[0].length;
        child.stdin.write(`${answers[i][1]}\n`);
        i++;
      }
    };
    child.stdout.setEncoding('utf8').on('data', onData);
    child.stderr.setEncoding('utf8').on('data', onData);
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('exit', () => child.stdin.end());
    child.on('close', (status) => {
      clearTimeout(timer);
      outputs.push(out);
      resolve({ status, out, answered: i });
    });
  });
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wtScript = (wt: string) => path.join(wt, 'scripts', 'release-prod.sh');
const PROMPT_TOKEN = /Dán token Cloudflare/;
const PROMPT_ACCOUNT = /Nhập Cloudflare account ID/;
const PROMPT_CONFIRM = /Gõ DAY-ADMIN-PROD để tiếp tục/;
const PROMPT_CONFIRM_OFF_MAIN = /Gõ DAY-ADMIN-NGOAI-MAIN để tiếp tục/;

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

test('prepare: build-id PROD không phải tổ tiên ⇒ 1 + chỉ lối thoát của NGƯỜI (--first-ship, kèm lệnh so); commit lạ ⇒ 1 cả khi --first-ship', { skip: SKIP }, () => {
  const fx = fixture();
  const r = run(fx, ['prepare'], { STUB_BUILD_ID: fx.side });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /KHÔNG phải tổ tiên/);
  assert.match(r.out, new RegExp(`git diff ${fx.side} ${fx.c2} --stat`));
  assert.match(r.out, /NGƯỜI[\s\S]*--first-ship/);
  for (const extra of [[], ['--first-ship']]) {
    const unknown = run(fx, ['prepare', ...extra], { STUB_BUILD_ID: 'd'.repeat(40) });
    assert.equal(unknown.status, 1, unknown.out);
    assert.match(unknown.out, /không có trong repo cục bộ/);
  }
  assert.doesNotMatch(stubLog(fx), /npm ci/);

  // Ca squash/rebase-merge: NGƯỜI so tay rồi --first-ship ⇒ qua rào (cảnh báo đỏ), prepare chạy tiếp tới cuối.
  const ok = run(fx, ['prepare', '--first-ship'], { STUB_BUILD_ID: fx.side });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /⚠⚠ PROD đang chạy/);
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
  // Lệnh ship in ra chạy bản script TRONG worktree (đường dẫn tuyệt đối), không qua `npm run` của checkout đang dùng.
  assert.match(r.out, new RegExp(`^  bash ${esc(wtScript(wt))} ship --dir ${esc(wt)}$`, 'm'));
  assert.doesNotMatch(r.out, /npm run deploy:prod/);
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
    [{ STUB_NPMTEST: 'red' }, /npm test đỏ/],
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
  assert.match(r3.out, /cloudflare\.env — sẽ hỏi nhập tay/);
  assert.match(r3.out, /terminal thật/);
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

test('ship --preflight: chạy mọi kiểm sau TTY (worktree, build-info, origin/main, rào PROD) — không token, không TTY', { skip: SKIP }, () => {
  const fx = fixture();
  const p = run(fx, ['prepare'], { STUB_BUILD_ID: fx.c1 });
  assert.equal(p.status, 0, p.out);
  const wt = releaseWorktree(fx);
  const pre = (extra: Record<string, string> = {}, flags: string[] = [], script?: string) =>
    run(fx, ['ship', '--preflight', '--dir', wt, ...flags], { STUB_BUILD_ID: fx.c1, ...extra }, script);

  // Token trong env bị gỡ ngay, không tiến trình con nào thấy (stub ghi TOKEN-LEAK nếu thấy).
  const ok = pre({ CLOUDFLARE_API_TOKEN: FAKE_TOKEN, CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /PREFLIGHT ĐẠT/);
  // Lệnh ship in ra chạy bản script TRONG worktree: ROOT = chính worktree vẫn phải chạy đúng.
  const fromWt = pre({}, [], wtScript(wt));
  assert.equal(fromWt.status, 0, fromWt.out);

  const notAnc = pre({ STUB_BUILD_ID: fx.side });
  assert.equal(notAnc.status, 1, notAnc.out);
  assert.match(notAnc.out, /KHÔNG phải tổ tiên/);
  assert.equal(pre({ STUB_BUILD_ID: fx.side }, ['--first-ship']).status, 0);

  const readme = path.join(wt, 'README.md');
  fs.writeFileSync(readme, 'sửa sau prepare\n');
  const dirty = pre();
  assert.equal(dirty.status, 1, dirty.out);
  assert.match(dirty.out, /tệp đã track bị sửa/);
  fs.writeFileSync(readme, 'c2\n');

  const idx = path.join(wt, 'out', 'index.html');
  const orig = fs.readFileSync(idx, 'utf8');
  fs.writeFileSync(idx, `${orig}<!-- sửa -->`);
  const outChanged = pre();
  assert.equal(outChanged.status, 1, outChanged.out);
  assert.match(outChanged.out, /out\/ đã đổi sau prepare/);
  fs.writeFileSync(idx, orig);

  // main đi tiếp sau prepare ⇒ dừng; --allow-ref không cứu được bản prepare KHÔNG ghi allowRef.
  fs.writeFileSync(path.join(fx.repo, 'C3.md'), 'c3\n');
  git(fx.repo, 'add', '-A');
  git(fx.repo, 'commit', '-q', '-m', 'c3');
  git(fx.repo, 'push', '-q', 'origin', 'main');
  for (const flags of [[], ['--allow-ref']]) {
    const moved = pre({}, flags);
    assert.equal(moved.status, 1, moved.out);
    assert.match(moved.out, /≠ origin\/main/);
  }
  const log = stubLog(fx);
  assert.doesNotMatch(log, /TOKEN-LEAK/);
  assert.doesNotMatch(log, /deploy-pages\.ts(?! --dry-run)/);
});

test('prepare chết ở dry-run ⇒ đã có build-id.txt nhưng KHÔNG có build-info.json ⇒ ship từ chối', { skip: SKIP }, () => {
  const fx = fixture();
  const r = run(fx, ['prepare', '--first-ship'], { STUB_DRYRUN: 'fail' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /dry-run thất bại/);
  assert.match(r.out, /KHÔNG ship được/);
  const wt = releaseWorktree(fx);
  assert.ok(fs.existsSync(path.join(wt, 'out', 'build-id.txt')));
  assert.ok(!fs.existsSync(path.join(wt, '.release', 'build-info.json')));
  const s = run(fx, ['ship', '--preflight', '--first-ship', '--dir', wt]);
  assert.equal(s.status, 1, s.out);
  assert.match(s.out, /thiếu \.release\/build-info\.json/);
});

test('ship qua PTY (script): rào TTY/cụm xác nhận lách được bằng PTY — chỉ chống lỡ tay; cụm sai ⇒ huỷ; đúng ⇒ đẩy + verify 4 cổng; token không lộ', { skip: SKIP_PTY }, async () => {
  const fx = fixture();
  const p = run(fx, ['prepare'], { STUB_BUILD_ID: fx.c1 });
  assert.equal(p.status, 0, p.out);
  const wt = releaseWorktree(fx);
  const env = {
    CLOUDFLARE_API_TOKEN: FAKE_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT,
    STUB_EXPECT_TOKEN: FAKE_TOKEN,
    STUB_EXPECT_ACCOUNT: FAKE_ACCOUNT,
    STUB_DEPLOY: 'ok',
    STUB_HTTP: 'ok',
    STUB_BUILD_ID: fx.c1,
    STUB_BUILD_ID_AFTER: fx.c2,
  };
  const bad = await runPty(fx, wtScript(wt), ['ship', '--dir', wt], env, [[PROMPT_CONFIRM, 'day-admin-prod']]);
  assert.equal(bad.answered, 1, bad.out);
  assert.notEqual(bad.status, 0, bad.out);
  assert.match(bad.out, /huỷ — không có gì được đẩy/);
  assert.ok(!fs.existsSync(`${fx.log}.deployed`));

  // htx còn bản cũ sau khi đẩy (deploy dở / lùi lệch) ⇒ verify ở CẢ 4 cổng bắt được.
  const partial = await runPty(fx, wtScript(wt), ['ship', '--dir', wt], { ...env, STUB_BUILD_ID_htx: fx.c1 }, [[PROMPT_CONFIRM, 'DAY-ADMIN-PROD']]);
  assert.notEqual(partial.status, 0, partial.out);
  assert.match(partial.out, /htx\.vigogroup\.vn: build-id\.txt = '[0-9a-f]{40}' ≠/);
  fs.rmSync(`${fx.log}.deployed`, { force: true });

  const good = await runPty(fx, wtScript(wt), ['ship', '--dir', wt], env, [[PROMPT_CONFIRM, 'DAY-ADMIN-PROD']]);
  assert.equal(good.status, 0, good.out);
  assert.match(good.out, /SHIP XONG/);
  // Script chạy từ chính worktree ⇒ lệnh dọn in ra là git trần (cleanup của chính nó sẽ từ chối), và nó chạy được.
  assert.match(good.out, new RegExp(`Dọn: git -C ${esc(fx.repo)} worktree remove --force ${esc(wt)}`));
  assert.equal(run(fx, ['cleanup', '--dir', wt], {}, wtScript(wt)).status, 1);
  const log = stubLog(fx);
  assert.match(log, /deploy-pages-stub: token dung/);
  assert.doesNotMatch(log, /TOKEN-LEAK|token SAI/);
  for (const o of [bad.out, partial.out, good.out]) {
    assert.ok(!o.includes(FAKE_TOKEN) && !o.includes(FAKE_ACCOUNT), 'lộ token/account');
  }
});

test('ship qua PTY: không có token ở env/tệp ⇒ nhập tay từ /dev/tty, KHÔNG hiện ra màn hình', { skip: SKIP_PTY }, async () => {
  const fx = fixture();
  const p = run(fx, ['prepare'], { STUB_BUILD_ID: fx.c1 });
  assert.equal(p.status, 0, p.out);
  const wt = releaseWorktree(fx);
  const r = await runPty(
    fx,
    wtScript(wt),
    ['ship', '--dir', wt],
    { STUB_EXPECT_TOKEN: FAKE_TOKEN, STUB_EXPECT_ACCOUNT: FAKE_ACCOUNT, STUB_DEPLOY: 'ok', STUB_HTTP: 'ok', STUB_BUILD_ID: fx.c1, STUB_BUILD_ID_AFTER: fx.c2 },
    [
      [PROMPT_TOKEN, FAKE_TOKEN],
      [PROMPT_ACCOUNT, FAKE_ACCOUNT],
      [PROMPT_CONFIRM, 'DAY-ADMIN-PROD'],
    ],
  );
  assert.equal(r.answered, 3, r.out);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /sẽ hỏi nhập tay/);
  assert.match(stubLog(fx), /deploy-pages-stub: token dung/);
  assert.doesNotMatch(stubLog(fx), /TOKEN-LEAK/);
  assert.ok(!r.out.includes(FAKE_TOKEN), 'token nhập tay bị hiện ra');
  assert.ok(!r.out.includes(FAKE_ACCOUNT), 'account ID nhập tay bị hiện ra');
});

test('prepare --allow-ref: lệnh ship in ra KHÔNG kèm cờ; ship --allow-ref nói rõ NGOÀI main và đòi cụm KHÁC', { skip: SKIP_PTY }, async () => {
  const fx = fixture();
  const p = run(fx, ['prepare', '--allow-ref', 'side'], { STUB_BUILD_ID: fx.c1 });
  assert.equal(p.status, 0, p.out);
  const wt = releaseWorktree(fx);
  const shipLine = p.out.split('\n').find((l) => l.includes(' ship --dir '));
  assert.ok(shipLine, p.out);
  assert.doesNotMatch(shipLine, /--allow-ref|--first-ship/);
  assert.match(p.out, /NGƯỜI tự thêm --allow-ref/);

  const noFlag = run(fx, ['ship', '--preflight', '--dir', wt], { STUB_BUILD_ID: fx.c1 });
  assert.equal(noFlag.status, 1, noFlag.out);
  assert.match(noFlag.out, /≠ origin\/main/);

  const env = {
    CLOUDFLARE_API_TOKEN: FAKE_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT,
    STUB_EXPECT_TOKEN: FAKE_TOKEN,
    STUB_EXPECT_ACCOUNT: FAKE_ACCOUNT,
    STUB_DEPLOY: 'ok',
    STUB_HTTP: 'ok',
    STUB_BUILD_ID: fx.c1,
    STUB_BUILD_ID_AFTER: fx.side,
  };
  const habit = await runPty(fx, wtScript(wt), ['ship', '--allow-ref', '--dir', wt], env, [[PROMPT_CONFIRM_OFF_MAIN, 'DAY-ADMIN-PROD']]);
  assert.equal(habit.answered, 1, habit.out);
  assert.notEqual(habit.status, 0, habit.out);
  assert.match(habit.out, /NGOÀI main: ref side = /);
  assert.match(habit.out, /huỷ/);
  assert.ok(!fs.existsSync(`${fx.log}.deployed`));

  const ok = await runPty(fx, wtScript(wt), ['ship', '--allow-ref', '--dir', wt], env, [[PROMPT_CONFIRM_OFF_MAIN, 'DAY-ADMIN-NGOAI-MAIN']]);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /SHIP XONG/);
});

test('không đầu ra nào chứa giá trị token giả', { skip: SKIP }, () => {
  assert.ok(outputs.length > 0);
  for (const o of outputs) {
    assert.ok(!o.includes(FAKE_TOKEN), 'lộ token');
    assert.ok(!o.includes(FAKE_ACCOUNT), 'lộ account id');
  }
});
