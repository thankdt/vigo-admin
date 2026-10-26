/**
 * Test canh đường deploy (`npm run test:pages`, node:test qua tsx): chặn việc đường cũ hoặc chỉ dẫn cũ quay lại.
 * CHỈ kiểm bề mặt thực thi + vài neo tài liệu bắt buộc — không quét văn bản tài liệu (bảng "Đã bỏ" được phép nhắc tên cũ).
 * Cú pháp luật quyền: .claude/README.md. Quy trình: docs/DEPLOY.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

test('AGENTS.md có khối "HẠ TẦNG ĐÃ ĐỔI"; CLAUDE.md nạp nó bằng dòng @AGENTS.md trong 40 dòng đầu', () => {
  assert.ok(exists('AGENTS.md'));
  assert.match(read('AGENTS.md'), /HẠ TẦNG ĐÃ ĐỔI/);
  const head = read('CLAUDE.md').split('\n').slice(0, 40);
  assert.ok(head.some((l) => l.trim() === '@AGENTS.md'), '@AGENTS.md phải đứng riêng một dòng, không trong backtick');
  const claude = read('CLAUDE.md');
  assert.match(claude, /docs\/DEPLOY\.md/);
  assert.doesNotMatch(claude, /merge = deploy/);
  assert.doesNotMatch(claude, /npx jest/);
  assert.doesNotMatch(claude, /auto-deploys/);
});

test('AGENTS.md luật 2: release.sh MỌI lệnh con (kể cả status), crane, cờ của NGƯỜI; GEMINI.md trỏ AGENTS.md', () => {
  const rule2 = read('AGENTS.md').split('\n').find((l) => l.startsWith('2. ')) ?? '';
  for (const w of ['`release.sh` (MỌI lệnh con, kể cả `status`)', '`k8s-app.sh`', '`gh workflow run`', '`crane`', '`terraform`', '`docker push`', 'scripts/release-prod.sh ship', '`--allow-ref`', '`--first-ship`', '`--ack-expand-only`', '`CONFIRM_PHRASE`']) {
    assert.ok(rule2.includes(w), `AGENTS.md luật 2 thiếu ${w}`);
  }
  assert.match(read('GEMINI.md'), /AGENTS\.md/);
});

test('docs/DEPLOY.md mô tả prepare → ship → verify', () => {
  const d = read('docs/DEPLOY.md');
  for (const w of ['release-prod.sh', 'prepare', 'ship', 'verify', 'rollback', '~/.config/vigo/cloudflare.env']) {
    assert.ok(d.includes(w), `DEPLOY.md thiếu "${w}"`);
  }
});

test('skill vigo-deploy có mặt (tự kích hoạt khi nhắc deploy); aws-deploy đã gỡ', () => {
  assert.ok(!exists('.claude/skills/aws-deploy'), '.claude/skills/aws-deploy phải bị xoá (RETIRED)');
  const s = read('.claude/skills/vigo-deploy/SKILL.md');
  const fm = s.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(fm, 'thiếu frontmatter');
  assert.match(fm[1], /^name: vigo-deploy$/m);
  const desc = fm[1].match(/^description: (.+)$/m)?.[1] ?? '';
  assert.match(desc, /deploy/);
  assert.ok(desc.length <= 1000, `description ${desc.length} ký tự — giữ ngắn, từ khoá ở đầu`);
  assert.ok(fm[2].trim().split('\n').length <= 60, 'thân skill ≤ 60 dòng (chỉ là bản đồ định tuyến)');
});

test('package.json: build KHÔNG deploy; deploy:prod = ship; release:prepare = prepare', () => {
  const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
  for (const seg of scripts.build.split('&&').map((s) => s.trim())) {
    assert.ok(seg === 'next build' || seg.startsWith('echo '), `build có bước lạ: ${seg}`);
  }
  assert.doesNotMatch(scripts.build, /deploy-pages/);
  assert.equal(scripts['deploy:prod'], 'bash scripts/release-prod.sh ship');
  assert.equal(scripts['release:prepare'], 'bash scripts/release-prod.sh prepare');
  for (const f of ['release-lib.node.test.ts', 'release-prod.node.test.ts', 'deploy-guard.node.test.ts']) {
    assert.ok(scripts['test:pages'].includes(f), `test:pages thiếu ${f}`);
  }
});

test('deploy-pages.ts: không đọc .env (dotenv), không --commit-dirty, vẫn ghim wrangler@4.145.0', () => {
  const src = read('scripts/deploy-pages.ts');
  assert.doesNotMatch(src, /dotenv/);
  assert.doesNotMatch(src, /--commit-dirty/);
  assert.match(src, /'wrangler@4\.145\.0'/);
  assert.match(src, /checkBuildInfo/);
});

test('DEV (Dockerfile/Jenkinsfile/docker-compose) không gọi npm run build / deploy:prod / release-prod.sh', () => {
  for (const f of ['Dockerfile', 'Jenkinsfile', 'docker-compose.yml']) {
    const code = read(f)
      .split('\n')
      .filter((l) => !/^\s*(#|\/\/)/.test(l));
    for (const l of code) assert.doesNotMatch(l, /npm run build|deploy:prod|release-prod\.sh|deploy-pages/, `${f}: ${l}`);
  }
});

const settings = JSON.parse(read('.claude/settings.json'));
const perms = settings.permissions as { allow: string[]; deny: string[]; ask: string[]; additionalDirectories?: string[] };

test('settings.json: deny chứa bộ luật bắt buộc (cú pháp ở .claude/README.md)', () => {
  const required = [
    'Bash(*release.sh*)',
    'Bash(*k8s-app.sh*)',
    'Bash(*CONFIRM_PHRASE*)',
    'Bash(*gh workflow run*)',
    'Bash(*kubectl*apply*)',
    'Bash(*kubectl*delete*)',
    'Bash(terraform *)',
    'Bash(*aws ecs*)',
    'Bash(*aws ecr*)',
    'Bash(*docker push*)',
    'Bash(pwsh *)',
    'Bash(*crane*)',
    'Bash(*npm run deploy:prod*)',
    'Bash(*release-prod.sh*ship*)',
    'Bash(*--first-ship*)',
    'Bash(*--allow-ref*)',
    'Bash(*wrangler*)',
    'Bash(*deploy-pages.ts*)',
    'Skill(aws-deploy)',
    'Read(**/.env)',
    'Read(~/.kube/**)',
    'Read(~/.vigo-cutover/**)',
    'Read(~/.config/vigo/**)',
  ];
  for (const r of required) assert.ok(perms.deny.includes(r), `deny thiếu ${r}`);
});

test('settings.json: allow không mở đường cũ/đọc bí mật qua Bash; postgres MCP ở ask', () => {
  const bad = ['deploy.sh', 'docker push', 'docker tag', 'docker buildx', 'npm run *', 'aws logs', 'aws cloudwatch', 'aws ecs', 'Bash(cat:*)', 'ship', 'wrangler'];
  for (const a of perms.allow) for (const b of bad) assert.ok(!a.includes(b), `allow "${a}" chứa "${b}"`);
  assert.ok(!perms.allow.includes('mcp__postgres-readonly__query'));
  assert.ok(perms.ask.includes('mcp__postgres-readonly__query'));
  assert.ok(perms.allow.includes('Bash(./scripts/release-prod.sh prepare*)'));
  assert.ok(perms.allow.includes('Bash(./scripts/release-prod.sh verify*)'));
});

test('settings.json: tệp CHUNG — không đường dẫn máy riêng, không vigo-infra, không hooks, không bật sandbox', () => {
  const raw = read('.claude/settings.json');
  assert.doesNotMatch(raw, /\/Users\/|\/Volumes\/|\/private\/tmp\/claude-/);
  assert.ok(!(perms.additionalDirectories ?? []).some((d) => d.includes('vigo-infra')));
  assert.equal(settings.hooks, undefined);
  assert.notEqual(settings.sandbox?.enabled, true);
});
