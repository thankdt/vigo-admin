# Bộ skill Claude Code

Skill stack-specific cho Flutter + Next.js + NestJS, kèm skill định tuyến deploy `vigo-deploy`. Các skill quy trình (debug, plan, review) nay dùng **plugin** thay vì skill local — xem mục dưới.

| Skill | Dùng khi |
|---|---|
| `flutter` (15 sub-skill) + `dart` (3 sub-skill) | Code Flutter/Dart: kiến trúc layer-based, Bloc+freezed, get_it/injectable, auto_route, Dio/Retrofit, easy_localization, testing, **CI/CD + build release** (xem `flutter/cicd`) |
| `nextjs-app` | Code Next.js + React (App Router, TS), test |
| `nestjs-api` | Code NestJS: module, TypeORM, JWT/Passport, test |
| `vigo-deploy` | Mọi yêu cầu deploy/release/rollback: chỉ đường tới `docs/DEPLOY.md` + `AGENTS.md`, chặn đường cũ. Bản RIÊNG từng repo — KHÔNG copy đè giữa các repo |

> `aws-deploy` đã **RETIRED** (17/10/2026 hạ tầng chuyển khỏi AWS ECS/S3+CloudFront). KHÔNG đồng bộ lại nó từ repo/máy khác hay `~/.claude/skills`; `.claude/settings.json` chặn `Skill(aws-deploy)`.

> `flutter` + `dart` là bộ chuẩn team commit từ đầu, khớp đúng stack thực tế của vigo/vigo-driver — **dùng bộ này**. (Skill `flutter-app` generic đã gỡ vì trùng lặp và đặt sai mặc định kiến trúc.)

## Skill quy trình → đã chuyển sang plugin

`debug-rca`, `plan-review`, `code-self-review` (skill local cũ) **đã gỡ**, thay bằng plugin:

- **`superpowers`** — `brainstorming`, `writing-plans`, `systematic-debugging`, `test-driven-development`, `requesting-code-review` / `receiving-code-review`, `verification-before-completion`…
- **`code-review`** — review PR (`/code-review`).

## Cài đặt

Skill trong Claude Code chỉ là thư mục chứa `SKILL.md`. Đặt vào một trong hai chỗ:

**Cho 1 project** (chia sẻ với cả team qua git):
```bash
mkdir -p <repo>/.claude/skills
cp -R flutter dart nextjs-app nestjs-api \
      <repo>/.claude/skills/
git add .claude/skills && git commit -m "chore: add Claude Code skills"
```

**Cho tất cả project của bạn** (cá nhân, không commit):
```bash
mkdir -p ~/.claude/skills
cp -R flutter dart nextjs-app nestjs-api \
      ~/.claude/skills/
```

Mở Claude Code trong project và chạy `/skills` (hoặc hỏi "what skills do you have") để xác nhận đã nhận.

## Thiết kế "tự dò" (detect-first)

`nextjs-app`, `nestjs-api` **tự đọc repo trước** (package.json / Dockerfile…) rồi mới chọn pattern phù hợp. Bộ `flutter` + `dart` thì ngược lại — là chuẩn đã chốt theo đúng stack vigo (Bloc, get_it/injectable, auto_route, Dio/Retrofit, easy_localization, layer-based), cứ theo đó mà làm.

## TEAM-CONFIG đã điền sẵn cho stack Vigo

Mỗi `SKILL.md` từng có comment `<!-- TEAM-CONFIG: ... -->` đánh dấu chỗ cần thay bằng convention thật. **Các chỗ này đã được điền** theo đúng codebase Vigo (xem mục "Vigo conventions" / "Vigo project specifics" trong từng skill): flavor dev/prod + dotenv của Flutter, TypeORM/JWT của NestJS, đường build/deploy của admin (Cloudflare Pages qua `scripts/release-prod.sh`)…

Bộ skill stack (flutter/dart/nextjs-app/nestjs-api) **đồng bộ y hệt nhau** ở cả 4 repo (vigo, vigo-driver, vigo-admin, vigo-backend). Khi đổi convention, sửa ở một repo rồi copy các thư mục đó sang repo còn lại — TRỪ `vigo-deploy` (mỗi repo một bản) và KHÔNG mang `aws-deploy` về. Nếu cần dò lại từ đầu: mở Claude Code và nhờ "đọc repo này rồi cập nhật .claude/skills/* cho khớp".

## Lưu ý phạm vi

Đây là best-practice + khung quy trình, **không thay thế** kiến thức gốc của Claude Code (vốn đã code được Flutter/Next.js/Nest). Skill giúp output nhất quán theo cách *team bạn* muốn, và nhắc các bước hay bị bỏ quên (test đường lỗi, regression test khi fix bug…).

## Phân quyền cho Claude Code (`.claude/README.md`)

Phân quyền **không** nằm trong skill mà ở `.claude/settings.json` (luật allow/ask/deny) + credential (chỉ người phát hành giữ token/kubeconfig). `.claude/README.md` giải thích cú pháp luật, giới hạn của luật deny, và cách tự kiểm. Log/DB PROD không còn trên AWS — do người hạ tầng xem (xem `AGENTS.md`).
