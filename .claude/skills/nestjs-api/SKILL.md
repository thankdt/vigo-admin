---
name: nestjs-api
description: Build, structure, test, and maintain NestJS backend APIs. Use this whenever working in a NestJS codebase — adding modules, controllers, services, DTOs, guards, or interceptors; wiring up the database/ORM; designing REST or GraphQL endpoints; handling validation and errors; or writing unit and e2e tests. Trigger even when the user just says "add an endpoint", "create a service", or "add a migration" inside a Nest project, not only when they say the word "NestJS".
---

# NestJS API

Guidance for this team's NestJS backend: module boundaries, the data layer, validation, error handling, and testing.

## Step 0 — Detect the conventions before writing code

Read these and match what exists:

1. `package.json` → determine the **data layer**:
   - `@nestjs/typeorm` + `typeorm` → **TypeORM** (read `references/db-typeorm.md`)
   - `prisma` + `@prisma/client` → **Prisma** (read `references/db-prisma.md`)
   - `@nestjs/mongoose` + `mongoose` → **Mongoose**
   - `drizzle-orm` → **Drizzle**
   - Default for new projects: **TypeORM** (this team's primary), and tell the user.
2. REST vs GraphQL → check for `@nestjs/graphql`. Match the existing transport.
3. Existing module layout, the validation setup (`class-validator` + global `ValidationPipe`), and config approach (`@nestjs/config`).

## Module structure

One feature = one module. Keep the dependency graph clean: controllers depend on services, services depend on repositories/data layer. Never let a controller touch the ORM directly.

```
src/
├── main.ts                 # bootstrap, global pipes/filters/interceptors
├── app.module.ts
├── config/                 # ConfigModule, validation schema for env
├── common/                 # guards, interceptors, filters, decorators, dto bases
└── <feature>/
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts
    ├── dto/                 # create/update DTOs with class-validator decorators
    ├── entities/           # entities/schemas
    └── <feature>.service.spec.ts
```

## Core conventions

- **DTOs + validation**: every request body/query is a DTO class with `class-validator` decorators. Enable a global `ValidationPipe({ whitelist: true, transform: true })` in `main.ts`.
- **Dependency injection**: inject via constructor; depend on interfaces/tokens where it aids testing. Don't `new` services inside other services.
- **Error handling**: throw Nest's `HttpException` subclasses (`NotFoundException`, etc.) from services; add a global exception filter to normalize error responses. Never leak raw DB/driver errors to clients.
- **Config & secrets**: read from `ConfigService` with a validated env schema. Never hardcode secrets or connection strings; never log them.
- **Async**: services return typed Promises; let exceptions propagate to the filter rather than swallowing them.

## Database

Read the ORM-specific reference (`references/db-typeorm.md` or `references/db-prisma.md`). Key cross-ORM rules:
- Use **migrations** for schema changes — never auto-sync against a real database. Generate, review, and commit migrations.
- Keep query logic in repositories/services, not controllers.
- Use transactions for multi-step writes that must succeed or fail together.

## Testing

- **Unit tests** (`*.spec.ts`) for services: build a testing module with `Test.createTestingModule`, mock the repository/data layer and other dependencies, assert on behavior including error branches.
- **e2e tests** (`test/*.e2e-spec.ts`) for controllers/routes: use `supertest` against the Nest app, hitting a test database or mocked layer; assert status codes, response shape, and validation rejections.
- Run `npm test` (unit) and the e2e command before finishing. Add tests in the same change; cover validation failures and not-found/error paths, not just the happy path.

## Definition of done

Lint + `tsc` clean, unit and relevant e2e tests green, DTO validation in place, errors mapped to proper HTTP responses, migrations generated/committed for any schema change, no secrets in code or logs.

## Vigo conventions (filled-in TEAM-CONFIG)

The `vigo-backend` service (NestJS 11):

- **Transport**: **REST** (`@Controller` + method decorators). No GraphQL.
- **Data layer**: **TypeORM** + **PostgreSQL with PostGIS** (geospatial). Read `references/db-typeorm.md`. Connection is via `DATABASE_URL` (Neon serverless Postgres) with host/port/user/password fallback; pool size from `DB_POOL_SIZE`.
- **Module structure**: modules-based, one folder per domain (`auth/`, `users/`, `drivers/`, `booking/`, `wallet/`, `dispatch/`, `notification/`, `scheduler/`, `finance/`, `pricing/`, `promotions/`, …). Entities are `*.entity.ts`; cross-cutting code lives in `common/` (filters, guards, interceptors, vitals middleware), env validation in `config/`, migrations in `database/migrations/`.
- **Auth**: **JWT + Passport**. Guards: `JwtAuthGuard`, `OptionalJwtAuthGuard`, `RolesGuard`, `DriverApprovedGuard`. Strategies: `JwtStrategy`, plus social `GoogleStrategy` / `AppleStrategy`. Role gating via `@Roles()` + `UserRole` enum; token revocation via a `tokenVersion` field on User.
- **Validation**: global `ValidationPipe({ transform: true, whitelist: true, transformOptions: { enableImplicitConversion: true } })` in `main.ts`; DTOs use `class-validator`.
- **Config/secrets**: `@nestjs/config` + `class-validator` env schema in `src/config/env.validation.ts`. Env files are `.env.{NODE_ENV}` (`.env.development`, `.env.production`, …) — validation is soft in dev, hard (throws) in prod.
- **Commands** (npm scripts):
  - Lint: `npm run lint` · Build: `npm run build` (`nest build`)
  - Unit tests: `npm test` (Jest) · e2e: `npm run test:e2e` · integration: `npm run test:integration` · coverage: `npm run test:cov`
  - Migrations: `npm run migration:generate -- src/database/migrations/<Name>`, `npm run migration:run`, `npm run migration:revert`; **prod** runs `npm run migration:run:prod` (`node dist/database/run-migration.js`).
- **Deploy note**: `main.ts` refuses to boot with pending migrations (override `SKIP_MIGRATION_CHECK=true`). WebSocket scaling uses a Redis socket.io adapter; background jobs use BullMQ. See the `aws-deploy` skill for shipping.
