# DEPLOY — vigo-admin (admin / htx / kol / daily)

Một nơi duy nhất cho đường lên DEV và PROD của repo này. Luật cho AI: [AGENTS.md](../AGENTS.md). Backend: repo vigo-backend `docs/DEPLOY.md`.
Mọi sự thật dưới đây có nguồn `tệp:dòng` (mục 9) hoặc ghi `[CHƯA KIỂM]`.

**Thứ tự merge đợt 26/10/2026:** backend (b1 + b2 + b3 CÙNG một đợt) TRƯỚC, rồi admin (tệp này), rồi 2 app, rồi infra — tài liệu ở đây trỏ vigo-backend `docs/DEPLOY.md`, tệp đó chỉ có trên `main` của backend sau khi backend merge.

## 0. Tóm tắt

| | |
|---|---|
| Hosting PROD | Cloudflare Pages từ 17/10/2026, 4 project cùng MỘT bản static export: `vigo-admin` → admin.vigogroup.vn, `vigo-htx` → htx., `vigo-kol` → kol., `vigo-daily` → daily. (chỉ khác trang gốc `/`) |
| Lên PROD | `npm run release:prepare` (AI được; khuyến nghị NGƯỜI ship tự chạy) → **NGƯỜI** chạy lệnh ship mà prepare in ra: `bash <worktree>/scripts/release-prod.sh ship --dir <worktree>` → `verify` tự chạy → `cleanup` |
| `npm run build` | CHỈ `next build`. **KHÔNG còn deploy** (trước đây `build` = build + đẩy lên 4 project PROD) |
| Merge `main` | KHÔNG deploy gì |
| DEV | push `dev` → Jenkins → `admin.vigodev.online` |
| Nền tảng script | macOS/Linux, bash ≥ 3.2. Windows: chỉ qua WSL đầy đủ |

⚠ Lần ship ĐẦU theo đường này: PROD chưa có `/build-id.txt` nên rào "PROD có code chưa vào main" chưa tự kiểm được — NGƯỜI phải xác nhận `main` đã chứa mọi thứ đang chạy trên PROD (vd «Tìm nhanh» 4d360e4 — theo kế hoạch 26/10/2026 đang chạy trên PROD mà chưa vào main [CHƯA KIỂM]) rồi TỰ chạy với `--first-ship` ở CẢ prepare lẫn ship (AI bị deny cờ này ⇒ lần đầu người tự prepare).

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
2. `git fetch origin main`; ref đích == `origin/main`. Muốn build ref khác: `--allow-ref <ref>` — cờ của NGƯỜI, AI bị deny (cảnh báo đỏ, ghi `allowRef=true`; lần ship sau từ main sẽ bị rào chặn tới khi code đó vào main).
3. Rào PROD: đọc `https://admin.vigogroup.vn/build-id.txt` (công khai). Có sha ⇒ phải là TỔ TIÊN của bản đích; không thì DỪNG (ship có thể xoá code đang chạy) và in lối thoát duy nhất: NGƯỜI so tay `git diff <build-id> <đích> --stat` + `git log <đích>..<build-id>`, chắc chắn mọi thứ trên PROD đã có trong bản đích, rồi chạy lại với `--first-ship`. sha đó không có trong repo cục bộ ⇒ DỪNG kể cả có `--first-ship` (fetch trước). Không có/không phải 40 hex (Pages trả index.html cho URL lạ) ⇒ đòi `--first-ship`.
   **Merge vào `main` bằng MERGE COMMIT (đừng squash/rebase-merge)** — nhất là nhánh từng ship bằng `--allow-ref`: squash tạo sha mới, sha đang chạy trên PROD không bao giờ thành tổ tiên ⇒ mọi lần ship sau kẹt ở rào này.
4. `git worktree add --detach` vào thư mục `mktemp -d` (`$TMPDIR/vigo-admin-release.XXXXXX`) — KHÔNG dùng/symlink `node_modules` của checkout chính.
5. `npm ci`; marker `[vigo patch]` có ở CẢ hai tệp next mà `patches/next+*.patch` sửa (CJS + ESM); `npm ls --all` không có `invalid`.
6. `env -u NEXT_PUBLIC_API_BASE_URL npx next build`; bundle: `out/_next` chứa `api.vigogroup.vn`, không tệp nào trong `out/` chứa `vigodev.online`.
7. Cổng: `npm test`, `npm run test:pages`, `npm run typecheck` so với `scripts/typecheck-baseline.txt` (6 lỗi có sẵn ở `macro-rule-quick-edit-dialog.tsx`, so theo `tệp:mã TS`; lỗi MỚI ⇒ dừng). typecheck chạy SAU `next build` nên kiểm cả `.next/types`; baseline đo ở CẢ hai trạng thái ngày 26/10/2026 (worktree sạch: 6 lỗi trước build, đúng 6 lỗi đó sau build).
8. Ghi `out/build-id.txt` (chỉ sha — công khai; phải có trước dry-run vì dry-run chép `out/` sang `.pages-dist`).
9. `npx tsx scripts/deploy-pages.ts --dry-run` (dựng `.pages-dist/<cổng>`, không đẩy).
10. Bước CUỐI: ghi `<worktree>/.release/build-info.json` NGOÀI `out/` (sha, ref, allowRef, firstShip, sha PROD lúc prepare, builtAtUtc, node, sha256 package-lock, sha256 cây `out/`). Đây là "vé" để ship: prepare chết ở bất kỳ bước nào trước đó ⇒ không có vé ⇒ ship từ chối. In đường dẫn worktree + lệnh ship.

Dừng giữa chừng ⇒ script in lệnh `cleanup` cho worktree tạm.

Lệnh ship in ra có dạng `bash <worktree>/scripts/release-prod.sh ship --dir <worktree>` (đường dẫn tuyệt đối, trích dẫn bằng `printf %q`): nó chạy bản script NẰM TRONG worktree vừa prepare, nên vẫn đúng khi checkout chính đã chuyển sang nhánh cũ (nhánh cũ: `build` = deploy, `deploy:prod` bỏ qua `--dir`). Lệnh in ra KHÔNG BAO GIỜ tự kèm `--allow-ref`/`--first-ship` — prepare chỉ nhắc; người tự gõ thêm sau khi tự kiểm.

### 3.2 ship — CHỈ NGƯỜI, terminal thật
```bash
bash <worktree>/scripts/release-prod.sh ship --dir <worktree>            # đúng dòng prepare in ra
#   + --first-ship  nếu NGƯỜI đã tự kiểm (lần đầu / rào tổ tiên ở 3.1 bước 3)
#   + --allow-ref   nếu prepare dùng --allow-ref (ship sẽ đòi cụm KHÁC: DAY-ADMIN-NGOAI-MAIN)
bash <worktree>/scripts/release-prod.sh ship --preflight --dir <worktree>   # chỉ chạy các kiểm, không token/TTY, không đẩy
```
(`npm run deploy:prod -- --dir <worktree>` cũng gọi ship, nhưng chạy bản script của checkout đang dùng — chỉ dùng khi chắc checkout đó ở nhánh có script này.)

**Khuyến nghị:** người ship TỰ chạy prepare trên máy mình (không cần token) rồi ship worktree của chính mình, thay vì ship worktree do AI chuẩn bị. Worktree AI tạo nằm ở nơi AI ghi được: `ship` dùng `node_modules` của nó, và ai ghi được worktree thì băm lại được `out/` — các kiểm build-info/băm chỉ chống lỡ tay.

Không `--dir` mà chỉ có đúng 1 worktree phát hành ⇒ dùng nó. Thứ tự kiểm:
- Từ chối khi có biến môi trường của tác tử AI (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ID`, `AI_AGENT`) — chạy từ `!` trong Claude Code cũng bị từ chối, đúng ý. Chỉ nhận diện được Claude Code: Cursor/Antigravity… không đặt các biến này [CHƯA KIỂM biến của chúng].
- Token (mục 4): env → tệp `~/.config/vigo/cloudflare.env` mode 600 → không có cả hai thì hỏi NHẬP TAY sau các kiểm. Không `source`, không in token; chỉ tiến trình `deploy-pages.ts` nhận token.
- stdin/stdout phải là TTY; cụm xác nhận đọc từ `/dev/tty`: `DAY-ADMIN-PROD`, hoặc `DAY-ADMIN-NGOAI-MAIN` khi bản đích KHÁC `origin/main` (`--allow-ref`; lời nhắc in rõ ref, sha và chữ "NGOÀI main"). KHÔNG có đường `CONFIRM_PHRASE` qua env.
- `--dir` phải nằm trong `git worktree list` và do prepare tạo; tệp đã track trong worktree không bị sửa (`git status --porcelain`); có build-info (prepare chạy TRỌN); build-info.sha == HEAD của worktree; băm cây `out/` khớp bản ghi; HEAD == `origin/main` vừa fetch (trừ `--allow-ref` khớp `allowRef=true`); rào PROD (3.1 bước 3) chạy LẠI. `--preflight` chạy đúng các kiểm này rồi thoát.
- ⚠ TTY, cụm xác nhận và biến môi trường đều là CHỐNG LỠ TAY: một tác tử cùng uid lách được bằng PTY (`script`), `env -u …`, gõ cụm qua PTY — `scripts/release-prod.node.test.ts` chứng minh bằng chính `script`. Rào thật ở mục 4.
- `npx tsx scripts/deploy-pages.ts` (wrangler ghim `4.145.0`, thử lại 3 lần/cổng, tự kiểm `<project>.pages.dev` khớp băm index.html) → `verify --sha <sha>` → in cách lùi. Không tạo tag git.
- `deploy-pages.ts` bản thật cũng tự từ chối khi chạy trong môi trường tác tử AI, khi thiếu/lệch build-info, và không còn đọc `.env`.

### 3.3 verify — AI chạy được (chỉ GET công khai)
```bash
scripts/release-prod.sh verify --dir <worktree>    # hoặc --sha <sha40>; không tham số = chỉ kiểm 4 cổng sống + in build-id đang chạy
```
Mỗi cổng `admin|htx|kol|daily.vigogroup.vn`: `GET /` thành công; một chunk `/_next/static/…` lấy từ index.html tải được; `/build-id.txt` == sha ở CẢ 4 cổng (`out/` được chép nguyên vào mọi cổng — `scripts/pages-lib.ts` `preparePortalDir` — nên cổng nào cũng có tệp này; bắt được deploy dở / lùi lệch một cổng). Không `--sha`/`--dir`: lấy build-id của admin làm chuẩn, 3 cổng kia phải trùng. Thử lại 6 lần × 5 s. KHÔNG so băm index.html trên tên miền thật (tính năng zone Cloudflare có thể sửa HTML) — việc đó `deploy-pages.ts` đã làm trên `*.pages.dev`.

### 3.4 cleanup
```bash
scripts/release-prod.sh cleanup --dir <worktree>   # git worktree remove --force + prune; chỉ nhận worktree do prepare tạo
```

## 4. Token Cloudflare
- **Rào thật** (duy nhất): token chỉ nằm ở máy NGƯỜI phát hành; người đó không để AI chạy không người trông trên máy ấy; xoay token khi nghi ngờ. Mọi thứ khác (TTY, cụm xác nhận, biến môi trường, mode 600, deny `Read`) chỉ CHỐNG LỠ TAY.
- Nguồn token của `ship`, theo thứ tự: (1) env `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`; (2) tệp `~/.config/vigo/cloudflare.env` mode **600** (ship từ chối nếu group/other có quyền; mẫu: `cloudflare-config.template`); (3) không có cả hai ⇒ ship hỏi nhập tay từ `/dev/tty` (tắt echo trước lời nhắc, không hiện, không lưu).
- **Máy có chạy AI (Claude Code, Cursor, Antigravity…): dùng (3)** — không để tệp token, không đặt biến. AI chạy cùng uid đọc được tệp (`Bash(grep:*)` còn ở allow), và Bash của tác tử nạp profile shell.
- CẤM `export CLOUDFLARE_*` trong profile (`~/.zshrc`, `~/.bashrc`, `~/.profile`…) hay trong shell dùng để mở agent.
- Lúc đẩy, token nằm trong env của tiến trình `deploy-pages.ts` (cùng uid đọc được, vd `ps eww`) — đừng để AI chạy song song lúc ship.
- Token CHỈ quyền "Cloudflare Pages: Edit". Token cũ từng bị dán vào chat ⇒ **XOAY token NGAY khi PR này merge** (đừng đợi lần ship đầu), và xoá `CLOUDFLARE_*` khỏi MỌI `.env` ở mọi checkout/worktree: nhánh cũ (`origin/dev`, nhánh cắt từ main cũ) vẫn có `build` = build + deploy đọc `.env` bằng dotenv.
- AI không đọc tệp này (deny trong `.claude/settings.json` — chỉ chống lỡ tay).

## 5. Lùi bản (rollback)
`scripts/release-prod.sh rollback-help` in hướng dẫn: Cloudflare Dashboard → Workers & Pages → `vigo-admin` | `vigo-htx` | `vigo-kol` | `vigo-daily` → Deployments → chọn bản trước → Rollback (làm CẢ 4 — 4 project độc lập). Sau đó `verify --sha <sha bản cũ>` (hoặc không tham số: lấy build-id của admin làm chuẩn, 3 cổng kia phải trùng) — bắt được cổng nào chưa lùi. Lùi trên Cloudflare không đổi git: lần ship sau từ main vẫn đi qua rào PROD bình thường.

## 6. Bẫy đã gặp
- **node_modules cũ ⇒ bundle PROD hỏng**: build PROD từ checkout có `node_modules` cài theo lock cũ (vd radix 1.1.x trong khi `package.json` đòi `^1.3.1`) từng cho bundle lỗi ô tìm trong dialog [nguồn: ghi nhớ dự án 23/10/2026, CHƯA KIỂM lại]. Vì vậy prepare LUÔN build trong worktree `npm ci` sạch, không bao giờ từ checkout đang dùng.
- `NEXT_PUBLIC_API_BASE_URL` được nhúng lúc build; bản PROD phải KHÔNG đặt biến này (mặc định `https://api.vigogroup.vn`). prepare tự `env -u` và quét bundle.
- `next.config.ts` bật `ignoreBuildErrors` ⇒ `next build` không chặn lỗi type; cổng thật là `npm run typecheck` + baseline.
- `npm run build` không deploy nữa — đừng tưởng đã lên PROD sau khi build.
- Đừng chạy `npx tsx scripts/deploy-pages.ts` trực tiếp để lên PROD. Có token + worktree đã prepare thì nó VẪN đẩy được, nhưng bỏ qua TTY, cụm xác nhận, so lại `origin/main` và rào PROD lần 2 của `ship`. Luôn đi đường `ship`.
- Nhánh cũ (`origin/dev` tới khi resync, nhánh cắt từ main cũ) vẫn có `"build": "next build && npm run deploy:prod"` (dotenv): `npm run build` trên nhánh đó + `.env` có token = đẩy PROD. Xoá token khỏi `.env` (mục 4).
- Squash/rebase-merge nhánh đã ship ⇒ rào tổ tiên kẹt (3.1 bước 3). Dùng merge commit.

## 7. Đã bỏ — các cụm này chỉ còn là lịch sử

| Cũ | Bây giờ |
|---|---|
| S3 bucket `vigo-admin` + 4 CloudFront (+ `scripts/deploy-s3.ts`, git `cf5bec2`) | Cloudflare Pages ×4 qua `scripts/release-prod.sh` |
| `npm run build` = `next build && deploy:prod` | `build` chỉ build; `deploy:prod` = `ship` có rào |
| Token trong `.env` của repo (dotenv) | nhập tay lúc ship, hoặc `~/.config/vigo/cloudflare.env` mode 600 / env của người (mục 4) |
| `wrangler … --commit-dirty=true` | bỏ (worktree sạch) |
| Skill `aws-deploy` | skill `vigo-deploy` (chỉ định tuyến tới tệp này) |
| "merge = deploy/build production" | merge KHÔNG deploy |

## 8. AI được / không được
- ĐƯỢC: `npm run release:prepare`, `./scripts/release-prod.sh prepare|verify|cleanup|rollback-help` (không cờ của người), đưa lệnh `ship` cho người.
- KHÔNG: `ship`/`npm run deploy:prod` (kể cả `--preflight`), `wrangler`, `deploy-pages.ts` bản thật, đọc `~/.config/vigo/**`/`.env*`, merge vào `main`; lách kiểm "chỉ người" (PTY/`script`, `env -u`). Chi tiết luật quyền: `.claude/settings.json` + `.claude/README.md`.
- `--first-ship` ("main đã chứa mọi thứ đang chạy trên PROD") và `--allow-ref` ("cố ý build/ship bản NGOÀI main") là lời của NGƯỜI: AI KHÔNG dùng, kể cả qua `npm run release:prepare -- …` (deny `Bash(*--first-ship*)`, `Bash(*--allow-ref*)`; `Bash(*release-prod.sh*ship*)` chặn ship). Lần đầu: người chạy prepare + ship.

## 9. Nguồn
- 4 project/host/trang gốc: `scripts/pages-lib.ts:36-41`; cách dựng từng cổng + SPA fallback: `scripts/pages-lib.ts:12-17,63-82` (`out/` chép NGUYÊN vào mọi cổng, kể cả `build-id.txt`: `:78`).
- wrangler ghim + thử lại + kiểm `*.pages.dev`: `scripts/deploy-pages.ts:26-30` (hằng), `:56` (`wranglerDeploy`), `:68-81` (`verify`), `:120` (vòng thử lại); rào bản thật: `scripts/deploy-pages.ts:94-109`.
- Rào prepare/ship/verify: `scripts/release-prod.sh` (`prod_gate`, `cmd_prepare`, `refuse_agent_env`, `load_token`, `read_secret_tty`, `require_tty`, `ship_checks`, `cmd_ship`, `check_host`, `cmd_verify`); hàm thuần: `scripts/release-lib.ts`; test: `scripts/release-prod.node.test.ts`, `scripts/release-lib.node.test.ts`.
- DEV: `Jenkinsfile:51` (`docker compose up -d --build admin`), `Dockerfile:15` (`npx next build`), `docker-compose.yml:8` (URL API DEV).
- API mặc định: `src/lib/api.ts:31-32`. Bản vá next: `patches/next+15.5.9.patch`.
