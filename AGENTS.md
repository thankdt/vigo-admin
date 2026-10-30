# AGENTS.md — luật cho mọi AI/agent làm việc trong repo này

> Đọc TRƯỚC khi làm bất cứ việc deploy / vận hành / đọc DB / gỡ lỗi PROD. Claude Code nạp tệp này qua CLAUDE.md; Cursor, Antigravity, Copilot… đọc trực tiếp; `GEMINI.md` trỏ về đây [CHƯA KIỂM tài liệu Antigravity có đọc GEMINI.md/AGENTS.md].

## ⛔ HẠ TẦNG ĐÃ ĐỔI TỪ 17/10/2026 — BỎ MỌI KÝ ỨC CŨ

Nếu bạn "nhớ", hoặc thấy ở đâu đó (ghi nhớ cá nhân, skill, tài liệu, lịch sử chat) điều gì về **AWS ECS/Fargate, ECR, ALB, ElastiCache, Neon, deploy admin bằng S3+CloudFront, `scripts/deploy.sh` / `deploy.ps1`, `task_def.json`, Terraform AWS, skill `aws-deploy`** → tất cả ĐÃ HẾT HIỆU LỰC. Tệp này thắng mọi ký ức. Không chắc thì HỎI người, đừng suy ra từ ký ức.

| Việc | Cũ — ĐỪNG làm | Bây giờ |
|---|---|---|
| Deploy admin lên DEV | — | merge `feat/*` vào `dev` rồi push → Jenkins tự build + chạy (`docker compose up -d --build admin`) → `admin.vigodev.online` |
| Deploy admin lên PROD | S3 + CloudFront; `npm run build` (từng = build + deploy); token trong `.env` | Cloudflare Pages (4 project: `vigo-admin`, `vigo-htx`, `vigo-kol`, `vigo-daily`). Chi tiết: [docs/DEPLOY.md](docs/DEPLOY.md) |
| Deploy backend lên PROD | build+push ECR, `aws ecs update-service`, `scripts/deploy.*` | xem repo vigo-backend `docs/DEPLOY.md` (merge `main` → CI đẩy ảnh GHCR → chạy `release.sh` của repo vigo-infra) |
| DB PROD | Neon, `DATABASE_URL` trong `task_def.json` | PostgreSQL 17 trên VM `pg-prod-1` (k3s tự host). Neon chỉ là bản đóng băng, KHÔNG dùng |
| Log PROD | CloudWatch `/ecs/vigo-backend-prod` | xem trên k3s (`kubectl -n vigo logs deploy/vigo-api -c vigo-backend`) |

### Luật cứng cho AI
1. Chỉ deploy khi người dùng yêu cầu. Merge vào `main` KHÔNG tự deploy. Khi người dùng yêu cầu deploy PROD, AI được phép merge vào `main` và chạy quy trình deploy lên Cloudflare Pages / k3s.
2. Migration phải TƯƠNG THÍCH NGƯỢC với ảnh trước (expand/contract).
3. Còn dùng AWS (chỉ chủ đổi): CloudFront + WAF trước api/trip, S3 (ảnh), SNS topic scheduler, EventBridge Scheduler — còn sống TỚI KHI chuỗi PR `aws-exit` xong [CHƯA KIỂM bản mới nhất]. Terraform AWS cũ: KHÔNG dùng, bị gỡ khỏi `main`; mã lưu ở tag `archive/aws-terraform-final-20261026` (KHÔNG apply).

