# DEPLOY — vigo-admin (admin / htx / kol / daily)

Một nơi duy nhất cho đường lên DEV và PROD của repo này. Luật cho AI: [AGENTS.md](../AGENTS.md). Backend: repo vigo-backend `docs/DEPLOY.md`.
Mọi sự thật dưới đây có nguồn `tệp:dòng` (mục 9) hoặc ghi `[CHƯA KIỂM]`.

## 0. Tóm tắt

| | |
|---|---|
| Hosting PROD | Cloudflare Pages từ 17/10/2026, 4 project cùng MỘT bản static export: `vigo-admin` → admin.vigogroup.vn, `vigo-htx` → htx., `vigo-kol` → kol., `vigo-daily` → daily. (chỉ khác trang gốc `/`) |
| Lên PROD | `npm run release:prepare` (AI được) → **NGƯỜI** `npm run deploy:prod -- --dir <worktree>` (= `ship`) → `verify` tự chạy → `cleanup` |
| `npm run build` | CHỈ `next build`. **KHÔNG còn deploy** (trước đây `build` = build + đẩy lên 4 project PROD) |
| Merge `main` | KHÔNG deploy gì |
| DEV | push `dev` → Jenkins → `admin.vigodev.online` |
| Nền tảng script | macOS/Linux, bash ≥ 3.2. Windows: chỉ qua WSL đầy đủ |

⚠ Lần ship ĐẦU theo đường này: PROD chưa có `/build-id.txt` nên rào "PROD có code chưa vào main" chưa tự kiểm được — NGƯỜI phải xác nhận `main` đã chứa mọi thứ đang chạy trên PROD (vd «Tìm nhanh» 4d360e4 — theo kế hoạch 26/10/2026 đang chạy trên PROD mà chưa vào main [CHƯA KIỂM]) rồi chạy với `--first-ship` ở CẢ prepare lẫn ship.

## 1. Ai làm gì

| Ai | Được làm |
|---|---|
| Dev / AI | code, test, mở PR, merge `feat/*` → `dev` (DEV tự deploy), `npm run release:prepare`, `scripts/release-prod.sh verify`, `cleanup`, `rollback-help` |
| AI KHÔNG | `npm run deploy:prod` / `release-prod.sh ship`, `wrangler`, `deploy-pages.ts` bản thật, merge PR vào `main`, đọc token |
| Người phát hành (giữ token Cloudflare Pages:Edit) | review + merge PR vào `main`; `ship` trên terminal thật; lùi bản trên Cloudflare Dashboard |

## 2. DEV

merge `feat/*` vào `dev` rồi push → Jenkins (webhook/poll `dev`) chạy `docker compose up -d --build admin` → image tự `npx next build` với `NEXT_PUBLIC_API_BASE_URL=https://api.vigodev.online` và phục vụ bằng nginx :9002 → https://admin.vigodev.online. DEV không gọi script nào trong `package.json`, nên việc tách build/deploy không đổi gì với DEV.

## 3. PROD

### 3.1 prepare — AI chạy được, KHÔNG cần token, không đẩy gì
```bash
npm run release:prepare                 # = bash scripts/release-prod.sh prepare  (đích mặc định origin/main)
```
Theo thứ tự, dừng ở rào đầu tiên không đạt (mã 1):
1. Cây làm việc hiện tại sạch (`git status --porcelain` rỗng — script và lib chạy từ chính cây này).
2. `git fetch origin main`; ref đích == `origin/main`. Muốn build ref khác: `--allow-ref <ref>` (cảnh báo đỏ, ghi `allowRef=true`; lần ship sau từ main sẽ bị rào chặn tới khi code đó vào main).
3. Rào PROD: đọc `https://admin.vigogroup.vn/build-id.txt` (công khai). Có sha ⇒ phải là TỔ TIÊN của bản đích (không thì DỪNG — ship sẽ xoá code đang chạy). Không có/không phải 40 hex (Pages trả index.html cho URL lạ) ⇒ đòi `--first-ship`.
4. `git worktree add --detach` vào thư mục `mktemp -d` (`$TMPDIR/vigo-admin-release.XXXXXX`) — KHÔNG dùng/symlink `node_modules` của checkout chính.
5. `npm ci`; marker `[vigo patch]` có ở CẢ hai tệp next mà `patches/next+*.patch` sửa (CJS + ESM); `npm ls --all` không có `invalid`.
6. `env -u NEXT_PUBLIC_API_BASE_URL npx next build`; bundle: `out/_next` chứa `api.vigogroup.vn`, không tệp nào trong `out/` chứa `vigodev.online`.
7. Cổng: `npm test`, `npm run test:pages`, `npm run typecheck` so với `scripts/typecheck-baseline.txt` (6 lỗi có sẵn ở `macro-rule-quick-edit-dialog.tsx`, so theo `tệp:mã TS`; lỗi MỚI ⇒ dừng).
8. Ghi `out/build-id.txt` (chỉ sha — công khai) và `<worktree>/.release/build-info.json` NGOÀI `out/` (sha, ref, allowRef, firstShip, sha PROD lúc prepare, builtAtUtc, node, sha256 package-lock, sha256 cây `out/`).
9. `npx tsx scripts/deploy-pages.ts --dry-run` (dựng `.pages-dist/<cổng>`), in đường dẫn worktree + lệnh ship.

Dừng giữa chừng ⇒ script in lệnh `cleanup` cho worktree tạm.

### 3.2 ship — CHỈ NGƯỜI, terminal thật
```bash
npm run deploy:prod -- --dir <worktree-in-ra-ở-prepare>   # = bash scripts/release-prod.sh ship --dir …
#   + --first-ship  nếu prepare cũng cần (lần đầu)   + --allow-ref  nếu prepare dùng --allow-ref
```
Không `--dir` mà chỉ có đúng 1 worktree phát hành ⇒ dùng nó. Rào:
- Từ chối khi có biến môi trường của tác tử AI (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ID`, `AI_AGENT`) — chạy từ `!` trong Claude Code cũng bị từ chối, đúng ý.
- Token: env `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, hoặc tệp `~/.config/vigo/cloudflare.env` (mục 4). Không `source`, không in token; chỉ tiến trình `deploy-pages.ts` nhận token.
- stdin/stdout phải là TTY; cụm xác nhận `DAY-ADMIN-PROD` đọc từ `/dev/tty`. KHÔNG có đường `CONFIRM_PHRASE` qua env.
- `--dir` phải nằm trong `git worktree list` và do prepare tạo; tệp đã track không bị sửa; build-info.sha == HEAD của worktree; băm cây `out/` khớp bản ghi; HEAD == `origin/main` vừa fetch (trừ `--allow-ref`); rào PROD (3.1 bước 3) chạy LẠI.
- `npx tsx scripts/deploy-pages.ts` (wrangler ghim `4.145.0`, thử lại 3 lần/cổng, tự kiểm `<project>.pages.dev` khớp băm index.html) → `verify --sha <sha>` → in cách lùi. Không tạo tag git.
- `deploy-pages.ts` bản thật cũng tự từ chối khi chạy trong môi trường tác tử AI, khi thiếu/lệch build-info, và không còn đọc `.env`.

### 3.3 verify — AI chạy được (chỉ GET công khai)
```bash
scripts/release-prod.sh verify --dir <worktree>    # hoặc --sha <sha40>; không tham số = chỉ kiểm 4 cổng sống + in build-id đang chạy
```
Mỗi cổng `admin|htx|kol|daily.vigogroup.vn`: `GET /` thành công; một chunk `/_next/static/…` lấy từ index.html tải được; riêng admin: `/build-id.txt` == sha. Thử lại 6 lần × 5 s. KHÔNG so băm index.html trên tên miền thật (tính năng zone Cloudflare có thể sửa HTML) — việc đó `deploy-pages.ts` đã làm trên `*.pages.dev`.

### 3.4 cleanup
```bash
scripts/release-prod.sh cleanup --dir <worktree>   # git worktree remove --force + prune; chỉ nhận worktree do prepare tạo
```

## 4. Token Cloudflare
- Tệp `~/.config/vigo/cloudflare.env`, mode **600** (ship từ chối nếu group/other có quyền), ngoài mọi repo. Mẫu: `cloudflare-config.template`.
- Token CHỈ quyền "Cloudflare Pages: Edit". Token cũ từng bị dán vào chat ⇒ **XOAY token** trước lần ship đầu, và đừng đặt token vào `.env` của repo (`deploy-pages.ts` không còn đọc `.env`; nhánh cũ thì vẫn đọc).
- AI không đọc tệp này (deny trong `.claude/settings.json`; đó chỉ là chống lỡ tay — rào thật là token chỉ nằm trên máy người phát hành).

## 5. Lùi bản (rollback)
`scripts/release-prod.sh rollback-help` in hướng dẫn: Cloudflare Dashboard → Workers & Pages → `vigo-admin` | `vigo-htx` | `vigo-kol` | `vigo-daily` → Deployments → chọn bản trước → Rollback (làm CẢ 4 — 4 project độc lập). Sau đó `verify` (không tham số) để xem build-id đang chạy. Lùi trên Cloudflare không đổi git: lần ship sau từ main vẫn đi qua rào PROD bình thường.

## 6. Bẫy đã gặp
- **node_modules cũ ⇒ bundle PROD hỏng**: build PROD từ checkout có `node_modules` cài theo lock cũ (vd radix 1.1.x trong khi `package.json` đòi `^1.3.1`) từng cho bundle lỗi ô tìm trong dialog [nguồn: ghi nhớ dự án 23/10/2026, CHƯA KIỂM lại]. Vì vậy prepare LUÔN build trong worktree `npm ci` sạch, không bao giờ từ checkout đang dùng.
- `NEXT_PUBLIC_API_BASE_URL` được nhúng lúc build; bản PROD phải KHÔNG đặt biến này (mặc định `https://api.vigogroup.vn`). prepare tự `env -u` và quét bundle.
- `next.config.ts` bật `ignoreBuildErrors` ⇒ `next build` không chặn lỗi type; cổng thật là `npm run typecheck` + baseline.
- `npm run build` không deploy nữa — đừng tưởng đã lên PROD sau khi build.
- Đừng chạy `npx tsx scripts/deploy-pages.ts` trực tiếp để lên PROD: nó đòi build-info của prepare và token; đi đường `ship`.

## 7. Đã bỏ — các cụm này chỉ còn là lịch sử

| Cũ | Bây giờ |
|---|---|
| S3 bucket `vigo-admin` + 4 CloudFront (+ `scripts/deploy-s3.ts`, git `cf5bec2`) | Cloudflare Pages ×4 qua `scripts/release-prod.sh` |
| `npm run build` = `next build && deploy:prod` | `build` chỉ build; `deploy:prod` = `ship` có rào |
| Token trong `.env` của repo (dotenv) | `~/.config/vigo/cloudflare.env` mode 600 hoặc env của người |
| `wrangler … --commit-dirty=true` | bỏ (worktree sạch) |
| Skill `aws-deploy` | skill `vigo-deploy` (chỉ định tuyến tới tệp này) |
| "merge = deploy/build production" | merge KHÔNG deploy |

## 8. AI được / không được
- ĐƯỢC: `npm run release:prepare`, `./scripts/release-prod.sh prepare|verify|cleanup|rollback-help`, đưa lệnh `ship` cho người.
- KHÔNG: `ship`/`npm run deploy:prod`, `wrangler`, `deploy-pages.ts` bản thật, đọc `~/.config/vigo/**`/`.env*`, merge vào `main`. Chi tiết luật quyền: `.claude/settings.json` + `.claude/README.md`.
- `--first-ship` là lời xác nhận của NGƯỜI ("main đã chứa mọi thứ đang chạy trên PROD"): AI KHÔNG tự thêm cờ này, kể cả qua `npm run release:prepare -- --first-ship` (deny `Bash(*--first-ship*)`; `Bash(*release-prod.sh*ship*)` cũng khớp). Lần đầu: người chạy prepare + ship.

## 9. Nguồn
- 4 project/host/trang gốc: `scripts/pages-lib.ts:36-41`; cách dựng từng cổng + SPA fallback: `scripts/pages-lib.ts:12-17,63-82`.
- wrangler ghim + thử lại + kiểm `*.pages.dev`: `scripts/deploy-pages.ts:25-29` (hằng), `:55` (`wranglerDeploy`), `:67-81` (`verify`), `:119` (vòng thử lại); rào bản thật: `scripts/deploy-pages.ts:93-109`.
- Rào prepare/ship/verify: `scripts/release-prod.sh` (`prod_gate`, `cmd_prepare`, `refuse_agent_env`, `load_token`, `require_tty`, `cmd_ship`, `cmd_verify`); hàm thuần: `scripts/release-lib.ts`; test: `scripts/release-prod.node.test.ts`, `scripts/release-lib.node.test.ts`.
- DEV: `Jenkinsfile:51` (`docker compose up -d --build admin`), `Dockerfile:15` (`npx next build`), `docker-compose.yml:8` (URL API DEV).
- API mặc định: `src/lib/api.ts:31-32`. Bản vá next: `patches/next+15.5.9.patch`.
