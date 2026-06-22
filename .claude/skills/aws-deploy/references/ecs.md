# ECS / Fargate deploy detail

## Dockerfile (NestJS example, multi-stage)
```dockerfile
# build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

## Push to ECR
```bash
SHA=$(git rev-parse --short HEAD)
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker build -t "$REPO:$SHA" .
docker push "$REPO:$SHA"
```

## Task definition
- `cpu`/`memory` sized to the workload.
- `containerDefinitions[].image` = the SHA-tagged image.
- Plain env in `environment`; sensitive values in `secrets` as Secrets Manager / SSM ARNs (NOT plaintext).
- `logConfiguration` → `awslogs` driver to a CloudWatch log group.
- `healthCheck` defined so ECS knows when the container is ready.
- Separate **task role** (app's AWS permissions, least privilege) from **execution role** (pull image, read secrets, write logs).

## Deploy (rolling)
```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$FAMILY" --force-new-deployment
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
```
`services-stable` blocks until the rollout settles — use it as the success gate.

## Rollback
Re-point the service at the previous task-definition revision:
```bash
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$FAMILY:<previous-revision>"
```

## Verify
- `running == desired` count; target-group health checks healthy.
- Smoke-test the endpoint through the load balancer.
- Tail CloudWatch logs for the new tasks; confirm clean startup.
