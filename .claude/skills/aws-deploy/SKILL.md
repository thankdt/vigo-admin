---
name: aws-deploy
description: Deploy applications and services to AWS safely and repeatably. Use this whenever the task involves shipping to AWS — containerizing a backend, pushing to ECR, deploying to ECS/Fargate, configuring Lambda, setting up CI/CD pipelines for AWS, managing environment config/secrets, or troubleshooting a failed deploy. Trigger when the user says "deploy to AWS", "ship the backend", "set up the pipeline", "the deploy failed", or names AWS services like ECS, Fargate, ECR, Lambda, App Runner.
---

# AWS Deploy

Guidance for deploying this team's services to AWS. Primary target is **ECS/Fargate with containers**; alternatives are covered in reference files.

## Step 0 — Detect the deploy setup before changing anything

Inspect the repo and match what exists; do not invent a new deploy mechanism over an existing one:

- `Dockerfile` + ECS task definition / `appspec.yml` / references to clusters & services → **ECS/Fargate** (you're in the right place — read on, plus `references/ecs.md`).
- `serverless.yml`, `template.yaml` (SAM), or `serverless framework` deps → **Lambda/serverless** (read `references/lambda.md`).
- IaC: Terraform (`*.tf`), CDK (`cdk.json`), CloudFormation templates — make infra changes *through the IaC*, never by hand in the console (console drift breaks reproducibility).
- CI: `.github/workflows`, `buildspec.yml` (CodeBuild), GitLab CI — deploys should run through the pipeline with credentials from the CI vault / OIDC role, not local long-lived keys.

## Non-negotiables

- **Never deploy straight to production by hand** when a pipeline exists. Push through the same path every time so it's reproducible and auditable.
- **Secrets** come from AWS Secrets Manager or SSM Parameter Store, injected at runtime — never baked into images, committed, or printed in logs.
- **Least privilege**: task/execution roles get only the permissions they need. Don't attach broad admin policies for convenience.
- **Roll-forward + rollback plan**: know how to revert before you ship. Keep the previous task definition / image tag so rollback is "point back at the last good revision."
- **Immutable image tags**: tag images with the git SHA, not just `latest`, so a deploy maps to an exact commit.

## ECS/Fargate happy path

Full detail in `references/ecs.md`. The shape of it:

1. Build the image (multi-stage Dockerfile, small runtime base, non-root user).
2. Authenticate to ECR and push, tagged with the commit SHA.
3. Register a new task-definition revision pointing at the new image; keep env/secrets as Secrets Manager references.
4. Update the ECS service to the new revision; let it roll with health checks. Watch the deployment until it stabilizes.
5. Verify via the load balancer health check and a smoke test, then confirm CloudWatch logs are clean.

## Before declaring a deploy done

- The service reached a steady state (running count == desired count, health checks passing).
- A smoke test against the live endpoint succeeded.
- CloudWatch logs show no startup errors.
- The rollback path is known and the previous good revision still exists.

State explicitly which environment was deployed (dev/staging/prod) and the image tag/SHA shipped.

## Vigo conventions (filled-in TEAM-CONFIG)

- **Account / region**: AWS account `265178904234`. Primary region **`ap-southeast-1`**; `us-east-1` only for CloudFront/WAF/ACM (global edge certs).
- **IaC**: **Terraform** (AWS provider `~> 5.0`) in `vigo-backend/infrastructure/terraform/` (`main.tf`, `redis.tf`, `cloudfront.tf`, `waf.tf`, `scheduler*.tf`, …). Make infra changes through Terraform, never by hand in the console.
- **Container**: `vigo-backend/Dockerfile`, multi-stage on `node:22-alpine` (builder → development → production), exposes port `3000`. Production image bundles `ttf-dejavu` for Vietnamese PDF rendering.
- **ECR / ECS (Fargate)** — names are templated by `{environment}` (e.g. `prod`):
  - ECR repo: `vigo-backend` (`265178904234.dkr.ecr.ap-southeast-1.amazonaws.com/vigo-backend`)
  - Cluster: `vigo-cluster-{env}` · Service: `vigo-service-{env}` · Task family: `vigo-backend-{env}`
  - ALB: `vigo-alb-{env}` · Target group: `vigo-tg-{env}` · health check `GET /health`
  - CloudWatch log group: `/ecs/vigo-backend-{env}` (7-day retention, stream prefix `ecs`)
- **Image tags**: current prod deploy tags `latest` (not git SHA). The general "immutable SHA tag" guidance above is the target; flag it if you change the deploy.
- **Prod deploy = manual, script-driven** via `vigo-backend/scripts/deploy.ps1` (PowerShell): ECR login → `docker buildx` `linux/amd64` (no provenance) → push → run migrations as a one-off ECS task → force new ECS service deployment. **No pipeline gate / approval step** — running the script *is* the gate.
- **Dev CI**: Jenkins (`vigo-backend/Jenkinsfile`, runs via docker-compose) triggered by GitHub webhook on the `dev` branch; deploy-in-place hot-reload + Telegram notify. This is dev only, not the prod path.
- **Managed dependencies**: DB is **Neon PostgreSQL** (`DATABASE_URL`, not RDS); cache is **ElastiCache Redis 7** replication group `vigo-redis-{env}` on `cache.t4g.micro`. Push via SNS platform apps; cron via EventBridge Scheduler (`vigo-scheduler-role-{env}`). Secrets are injected as task-definition env at runtime.
- **vigo-admin** (Next.js): not containerized — deployed as a static/SPA build to S3 bucket `vigo-admin` (region `ap-southeast-1`) behind CloudFront. Flutter apps (vigo, vigo-driver) are not deployed to AWS.
