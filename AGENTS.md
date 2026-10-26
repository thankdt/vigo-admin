# AGENTS.md — luật cho mọi AI/agent làm việc trong repo này

> Đọc TRƯỚC khi làm bất cứ việc deploy / vận hành / đọc DB / gỡ lỗi PROD. Claude Code nạp tệp này qua CLAUDE.md; Cursor, Antigravity, Copilot… đọc trực tiếp; `GEMINI.md` trỏ về đây [CHƯA KIỂM tài liệu Antigravity có đọc GEMINI.md/AGENTS.md].

## ⛔ HẠ TẦNG ĐÃ ĐỔI TỪ 17/10/2026 — BỎ MỌI KÝ ỨC CŨ

Nếu bạn "nhớ", hoặc thấy ở đâu đó (ghi nhớ cá nhân, skill, tài liệu, lịch sử chat) điều gì về **AWS ECS/Fargate, ECR, ALB, ElastiCache, Neon, deploy admin bằng S3+CloudFront, `scripts/deploy.sh` / `deploy.ps1`, `task_def.json`, Terraform AWS, skill `aws-deploy`** → tất cả ĐÃ HẾT HIỆU LỰC. Tệp này thắng mọi ký ức. Không chắc thì HỎI người, đừng suy ra từ ký ức.

| Việc | Cũ — ĐỪNG làm | Bây giờ |
|---|---|---|
| Deploy admin lên DEV | — | merge `feat/*` vào `dev` rồi push → Jenkins tự build + chạy (`docker compose up -d --build admin`) → `admin.vigodev.online` |
| Deploy admin lên PROD | S3 + CloudFront; `npm run build` (từng = build + deploy); token trong `.env` | Cloudflare Pages (4 project: `vigo-admin`, `vigo-htx`, `vigo-kol`, `vigo-daily`). `npm run release:prepare` (AI được, KHÔNG kèm cờ của người; khuyến nghị người ship tự chạy prepare) → NGƯỜI chạy lệnh `ship` mà prepare in ra (`bash <worktree>/scripts/release-prod.sh ship --dir <worktree>`, gõ cụm xác nhận trên terminal thật) → `verify`. `npm run build` KHÔNG còn deploy. Chi tiết: [docs/DEPLOY.md](docs/DEPLOY.md) |
| Deploy backend lên PROD | build+push ECR, `aws ecs update-service`, `scripts/deploy.*` | xem repo vigo-backend `docs/DEPLOY.md` (merge `main` → CI đẩy ảnh GHCR → NGƯỜI được phép chạy `release.sh` của repo vigo-infra) |
| DB PROD | Neon, `DATABASE_URL` trong `task_def.json` | PostgreSQL 17 trên VM `pg-prod-1` (k3s tự host). Neon chỉ là bản đóng băng, KHÔNG dùng. AI KHÔNG có đường mặc định đọc DB PROD |
| Log PROD | CloudWatch `/ecs/vigo-backend-prod` | do người hạ tầng xem; hỏi người |

### Luật cứng cho AI
1. Merge vào `main` KHÔNG tự deploy. AI KHÔNG tự merge PR vào `main` (review của người là cổng cuối); AI dừng ở PR đã mở.
2. AI KHÔNG chạy: `release.sh` (MỌI lệnh con, kể cả `status`), `k8s-app.sh`, `kubectl` lệnh ghi, `gh workflow run`, `crane`, `terraform`, `aws ecs|ecr`, `docker push`; riêng repo này: `scripts/release-prod.sh ship` / `npm run deploy:prod`, `wrangler`, `scripts/deploy-pages.ts` (trừ bản `--dry-run` mà `prepare` tự gọi). Cờ/biến là lời xác nhận của NGƯỜI — AI KHÔNG dùng: `--allow-ref`, `--first-ship`, `--ack-expand-only`, `CONFIRM_PHRASE`. Các kiểm "chỉ người" của script (TTY, cụm xác nhận, biến môi trường tác tử) chỉ CHỐNG LỠ TAY — AI không lách (PTY/`script`, `env -u`…). Khi người nhờ "deploy": chuẩn bị (PR, kiểm tra, `scripts/release-prod.sh prepare|verify`) rồi ĐƯA LỆNH cho người chạy.
3. KHÔNG đọc/ghi bí mật: kubeconfig, `~/.vigo-cutover/`, token Cloudflare (`~/.config/vigo/cloudflare.env`), token GHCR, `.env*`, `task_def.json`.
4. Migration phải TƯƠNG THÍCH NGƯỢC với ảnh trước (expand/contract). AI không ký `--ack-expand-only`.
5. Còn dùng AWS (chỉ chủ đổi): CloudFront + WAF trước api/trip, S3 (ảnh), SNS topic scheduler, EventBridge Scheduler — còn sống TỚI KHI chuỗi PR `aws-exit` xong [CHƯA KIỂM bản mới nhất]. Terraform AWS cũ: KHÔNG dùng, bị gỡ khỏi `main`; mã lưu ở tag `archive/aws-terraform-final-20261026` (KHÔNG apply).
