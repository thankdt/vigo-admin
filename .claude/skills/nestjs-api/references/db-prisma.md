# Prisma in NestJS

Use when `package.json` has `prisma` + `@prisma/client`.

## Wiring
- Create an injectable `PrismaService extends PrismaClient` that connects `onModuleInit` and disconnects `onModuleDestroy`; export it from a `PrismaModule`.
- Inject `PrismaService` into feature services; keep all queries in services.

## Schema & migrations
- The source of truth is `prisma/schema.prisma`.
- Dev: `prisma migrate dev --name <change>` (creates + applies migration, regenerates client).
- Prod/CI: `prisma migrate deploy` (applies committed migrations only).
- Regenerate the client after schema edits: `prisma generate`.
- Review the SQL in `prisma/migrations/**/migration.sql` before committing.

## Queries
```ts
const todo = await this.prisma.todo.create({ data: { title } });
```
Use `this.prisma.$transaction([...])` or the interactive transaction callback for multi-step writes.

## Testing
Mock `PrismaService` (jest-mock-extended `mockDeep<PrismaClient>()` is convenient) so unit tests don't hit a real DB.
