# Phân quyền Claude Code trong repo này (`.claude/settings.json`)

`settings.json` là tệp CHUNG cả team (commit vào git): chỉ đường dẫn tương đối (`./…`) và `~/…` — KHÔNG `/Users/<tên>`, `/Volumes/…`, UUID phiên. Quyền riêng từng máy để ở `.claude/settings.local.json` (đã gitignore). Luật hạ tầng/deploy: `AGENTS.md`; quy trình deploy: `docs/DEPLOY.md`.

## Ba tầng — đừng nhầm

| | Cơ chế | Ở đâu |
|---|---|---|
| Chỉ dẫn mềm (AI nên làm gì) | `AGENTS.md`, `CLAUDE.md`, skill `vigo-deploy` | ngữ cảnh — AI có thể làm sai |
| Luật quyền (công cụ của Claude được gọi gì) | `permissions.allow/ask/deny` | `settings.json` |
| Chống lỡ tay (KHÔNG phải rào) | `ship` đòi terminal thật + cụm xác nhận + từ chối biến môi trường tác tử; tệp token mode 600 — tác tử cùng uid lách được (PTY/`script`, `env -u`, đọc tệp) | script |
| Rào thật | token chỉ nằm ở máy NGƯỜI phát hành; người đó không để AI chạy không người trông trên máy ấy; xoay token khi nghi ngờ | ngoài Claude |

## Cú pháp (đã đối chiếu tài liệu Claude Code, 26/10/2026)
- Thứ tự: `deny` > `ask` > `allow` (trong một tầng); deny ở BẤT KỲ tầng nào (kể cả `settings.local.json`) không bị tầng khác allow lại; `bypassPermissions` vẫn bị deny chặn.
- `Bash(x *)` ≡ `Bash(x:*)` (khớp `x` và `x <args>`); `*` đặt được đầu/giữa/cuối. Khớp theo VĂN BẢN lệnh, nên luật deny dùng dạng `*x*` để không lách được bằng đảo thứ tự tham số, gán biến đứng đầu (`FOO=1 x`) hay `env x`. Hệ quả có chủ đích: lệnh chỉ nhắc tới các chữ đó (vd `grep wrangler …` trong Bash) cũng bị chặn — dùng công cụ Grep/Read thay.
- Lệnh ghép (`&& || ; |`, `$(…)`): deny/ask khớp nếu BẤT KỲ lệnh con nào khớp; allow thì MỌI lệnh con phải khớp.
- `Read(**/.env)` chặn mọi độ sâu; `Read(./.env)` chỉ thư mục hiện tại. Không dùng mẫu phủ định `!`.
- `Bash(*release.sh*)` KHÔNG khớp `release-prod.sh` (chuỗi khác) — `prepare`/`verify` của repo này vẫn chạy được; `ship` bị chặn riêng bằng `Bash(*release-prod.sh*ship*)`; `Bash(*--first-ship*)` chặn AI tự ký xác nhận "main đã chứa mọi thứ đang chạy trên PROD" (lời của NGƯỜI); `Bash(*--allow-ref*)` chặn AI build/ship bản NGOÀI main.

## Giới hạn — đọc kỹ
- **deny `Read(...)` chỉ chống LỠ TAY**, không phải rào bảo mật: nó áp cho công cụ Read/Edit/Grep/Glob và vài lệnh tệp nhận diện được trong Bash, KHÔNG áp cho script Node/Python tự mở tệp hay mọi biến thể `grep`. Vì vậy `Bash(cat:*)` đã bị bỏ khỏi allow, và rào thật là: token Cloudflare / kubeconfig PROD KHÔNG nằm ở máy hay runner nơi AI chạy (trên máy có AI: nhập token tay lúc `ship`, `docs/DEPLOY.md` §4). `Bash(grep:*)` VẪN ở allow (gỡ là đổi hành vi cả team — chờ chủ quyết) ⇒ AI grep được mọi tệp đọc được mà không hỏi, kể cả tệp token nếu có.
- **Sandbox KHÔNG bật** (quyết định của chủ dự án 26/10/2026: bật làm đổi hành vi cả team — docker, git qua SSH…). Khối `sandbox.filesystem.denyRead` chỉ có tác dụng với ai tự bật `sandbox.enabled`.
- Dev có thể tự bỏ qua tệp project (`--setting-sources user`). Muốn ép cứng cả team: managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json` trên macOS, `allowManagedPermissionRulesOnly: true`) — đề xuất cho chủ, chưa làm.
- `Skill(aws-deploy)` bị deny; chưa chắc luật này áp cho bản cá nhân trùng tên ở `~/.claude/skills/aws-deploy` — xoá bản cá nhân đó nếu có.
- Dev Windows (PowerShell tool) cần nhân đôi các mẫu Bash sang `PowerShell(...)` — chưa làm.

## DB / cache
`psql`, `mysql`, `redis-cli`, `aws`, `ssh`, `kubectl` (đọc), `gh pr merge` và MCP `mcp__postgres-readonly__query` nằm ở `ask` (hỏi từng lần). Luật `ask` không giữ an toàn DB: nếu cần cho AI đọc DB thì dùng user CHỈ-ĐỌC ở chính DB (vd role `vigo_ro` của PROD do người hạ tầng cấp) — AI không có đường mặc định đọc DB PROD (`AGENTS.md`).

## Tự kiểm (NGƯỜI làm, ghi kết quả vào PR khi đổi luật)
1. `claude doctor` (luật hỏng bị bỏ qua, chỉ cảnh báo) và `/permissions` (xem nguồn từng luật).
2. Nhờ Claude thử — phải bị chặn: `npm run deploy:prod`, `bash scripts/release-prod.sh ship`, `./scripts/release-prod.sh prepare --allow-ref x`, `FOO=1 ./scripts/release-prod.sh ship`, `env bash scripts/release-prod.sh ship`, `npx wrangler pages deploy out`, `npx tsx scripts/deploy-pages.ts`, `kubectl -n x apply -f y`, `terraform plan`, `cat ~/.config/vigo/cloudflare.env` (Read), `Skill(aws-deploy)`.
3. Phải chạy được (không hỏi): `npm run typecheck`, `npm run test:pages`, `./scripts/release-prod.sh verify`.
