# TypeORM in NestJS

Use when `package.json` has `@nestjs/typeorm` + `typeorm`.

## Wiring
- Register `TypeOrmModule.forRootAsync` in a root/DB module, pulling config from `ConfigService`.
- Per-feature: `TypeOrmModule.forFeature([Entity])` in the feature module, inject `@InjectRepository(Entity)`.
- **`synchronize` MUST be `false`** outside local dev. Use migrations.

## Entities
```ts
@Entity('todos')
export class Todo {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() title: string;
  @Column({ default: false }) done: boolean;
  @CreateDateColumn() createdAt: Date;
}
```

## Migrations
- Configure a `DataSource` for the CLI (`data-source.ts`).
- Generate from entity changes: `typeorm migration:generate ./src/migrations/<Name> -d ./src/data-source.ts`
- Review the generated SQL before committing. Run: `typeorm migration:run -d ./src/data-source.ts`
- Never edit a migration that has already run in a shared environment — add a new one.

## Transactions
Use `dataSource.transaction(async (manager) => { ... })` or `QueryRunner` for multi-step writes.

## Testing
Mock the repository with a partial `Repository<T>` (jest mock of `find`, `findOne`, `save`, etc.) — do not hit a real DB in unit tests.
