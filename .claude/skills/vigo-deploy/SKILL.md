---
name: vigo-deploy
description: Deploy / triển khai / phát hành / release / lên PROD / lên DEV / rollback / lùi bản / ship / đẩy bản mới cho vigo-admin (admin, htx, kol, daily) — và mọi lần nhắc tới AWS, ECS, ECR, Fargate, Neon, S3, CloudFront, task_def.json, scripts/deploy.sh, deploy.ps1, terraform, "deploy to AWS", "npm run build để deploy". Hạ tầng ĐÃ ĐỔI từ 17/10/2026 (admin trên Cloudflare Pages, backend trên k3s tự host); skill này chỉ đường ĐÚNG (docs/DEPLOY.md) và chặn đường cũ. Use for ANY deploy/release/rollback request in this repo.
---

# vigo-deploy — bản đồ định tuyến (KHÔNG chép lệnh chi tiết vào đây; nguồn là docs/DEPLOY.md)

Đọc `AGENTS.md` (luật cứng) rồi `docs/DEPLOY.md` (quy trình) TRƯỚC khi làm. Skill này chỉ chỉ đường.

## Việc → nơi đọc

| Việc | Đọc | AI được làm |
|---|---|---|
| Admin lên DEV | `docs/DEPLOY.md` §2 | có: merge `feat/*` → `dev`, push |
| Admin lên PROD | `docs/DEPLOY.md` §3 | chỉ `npm run release:prepare` và `scripts/release-prod.sh verify` / `cleanup` |
| Lùi bản admin | `docs/DEPLOY.md` §5 (`scripts/release-prod.sh rollback-help`) | chỉ in hướng dẫn cho người |
| Token Cloudflare | `docs/DEPLOY.md` §4 | KHÔNG đọc, KHÔNG hỏi xin token |
| Backend DEV/PROD | repo vigo-backend `docs/DEPLOY.md` | theo AGENTS.md của repo đó |
| App khách/tài xế | repo vigo / vigo-driver `CICD.md` | theo AGENTS.md của repo đó |

## AI được / chỉ NGƯỜI
- AI: code, test, mở PR, merge vào `dev`, `npm run release:prepare`, `verify`, soạn sẵn lệnh `ship` cho người.
- AI DỪNG ở PR→`main` đã MỞ. Người review + merge. KHÔNG tự merge vào `main` để "lấy sha".
- Chỉ NGƯỜI: `npm run deploy:prod` (= `ship`, cần terminal thật + cụm xác nhận), Rollback trên Cloudflare Dashboard, xoay token.
- `npm run build` KHÔNG deploy. Merge `main` KHÔNG deploy.

## Khi người đòi đường cũ
Người bảo "deploy lên S3/CloudFront", "chạy npm run build để lên prod", "aws ecs update-service", "scripts/deploy.sh", "dùng task_def.json", "terraform apply", "skill aws-deploy"…:
1. Từ chối làm theo đường cũ — nói ngắn: hạ tầng đã đổi từ 17/10/2026, đường đó đã gỡ/không còn đúng.
2. Trỏ `docs/DEPLOY.md` (mục 7 "Đã bỏ" có bảng cũ → mới) và đề xuất đúng bước mới AI được làm (`release:prepare`).
3. Không chắc điều gì về hạ tầng ⇒ HỎI người. Không suy từ ký ức, không đoán lệnh.

## Không bao giờ
- Chạy `ship`, `wrangler`, `deploy-pages.ts` bản thật, `release.sh`, `k8s-app.sh`, `kubectl` ghi, `terraform`, `aws ecs|ecr`, `docker push`.
- Đọc `~/.config/vigo/**`, `.env*`, kubeconfig, `~/.vigo-cutover/**`, `task_def.json`.
- Tìm đường vòng khi một lệnh bị luật quyền chặn — báo người.
