# Đội tài chuyên nghiệp — Implementation Plan (vigo-backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `vigo-admin/docs/superpowers/specs/2026-08-10-driver-team-design.md`
**Repo thực thi:** `/Volumes/exSSD/dev/projects/vigo-backend` (KHÔNG phải vigo-admin)
**Plan kế tiếp:** `2026-08-10-driver-team-admin.md` — chỉ chạy được SAU khi plan này deploy xong.

**Goal:** Cung cấp 7 endpoint admin cho màn "Đội tài chuyên nghiệp": xếp hạng tài xế theo số chuyến `COMPLETED` thực chạy trên từng tuyến, cộng một pipeline tuyển team riêng tư (trạng thái, người phụ trách, ghi chú, nhật ký liên hệ).

**Architecture:** Một module Nest mới `src/driver-team/` tách **đọc** khỏi **ghi**: `DriverTeamStatsService` chạy SQL thô tổng hợp (đọc `booking` + `defined_routes`), `DriverTeamService` xử lý ghi trên 2 bảng mới (`driver_team_member`, `driver_team_event`). Toàn bộ câu SQL nằm trong `driver-team.sql.ts` dạng hàm thuần để test được không cần DB, và được chứng minh lần cuối bằng một integration spec chạy Postgres thật qua testcontainers.

**Tech Stack:** NestJS · TypeORM (raw SQL qua `DataSource.query`) · PostgreSQL · Jest · testcontainers.

## Global Constraints

- **Timezone:** mọi khoảng ngày là **VN (UTC+7)**. BẮT BUỘC dùng `src/common/vn-time.util.ts` — `vnRangeToUtc(from, to)` cho khoảng ngày, `vnTodayBoundsUtc(Date.now())` cho "hôm nay". **KHÔNG** tự viết `AT TIME ZONE`: viết một lần thay vì double conversion là sai **14 tiếng, âm thầm**.
- `booking.completedAt` / `booking.createdAt` là `timestamp without time zone` chứa **byte UTC** → so sánh **thẳng** với `startUtc` / `endUtc`, không convert.
- **Tên bảng/cột:** bảng `booking`, `driver`, `user` (số ít, không quote-nhầm), `defined_routes`, `transport_company`. Cột giữ **camelCase** và **phải bọc dấu nháy kép** trong SQL: `b."driverId"`. Ngoại lệ duy nhất: bảng M2M `driver_routes` dùng **snake_case** (`driver_id`, `route_id`).
- `defined_routes` có **soft delete** (`deletedAt`) → mọi truy vấn tuyến phải có `WHERE r."deletedAt" IS NULL`.
- **Guard chain admin (copy nguyên, mức class):** `@UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)` + `@Roles(UserRole.ADMIN)` + `@RequireFunction('driver-team')`. Mẫu: `src/driver-reputation/driver-reputation-admin.controller.ts`.
- **Shape phân trang:** `{ data, meta: { page, limit, total, totalPages } }` (convention thống trị, 12 chỗ dùng). KHÔNG dùng `PaginationUtil`.
- **Migration:** `src/database/migrations/<UnixMs>-<PascalCase>.ts`, class `<PascalCase><UnixMs>`, field `name` khớp tên class. Timestamp phải **lớn hơn `1792700000000`**.
- **Không interpolate input người dùng vào SQL.** Mọi giá trị đi qua `$n` params; `ORDER BY` chỉ được chọn từ whitelist.
- Lệnh kiểm: `npx tsc --noEmit` + `npx jest` (integration: `npm run test:integration`, cần Docker).

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/driver-team/driver-team.enums.ts` | `DriverTeamStage`, `DriverTeamEventType` |
| `src/driver-team/entities/driver-team-member.entity.ts` | 1 dòng / tài xế — trạng thái pipeline |
| `src/driver-team/entities/driver-team-event.entity.ts` | Nhật ký append-only |
| `src/driver-team/driver-team.sql.ts` | **Hàm thuần** dựng SQL + clamp tham số. Không import Nest |
| `src/driver-team/driver-team-stats.service.ts` | Đường ĐỌC — chạy SQL, map kiểu |
| `src/driver-team/driver-team.service.ts` | Đường GHI — upsert member, sinh event |
| `src/driver-team/driver-team-admin.controller.ts` | 7 route, guard chain, parse query |
| `src/driver-team/dto/driver-team.dto.ts` | DTO body cho PATCH / POST event |
| `src/driver-team/driver-team.module.ts` | Wiring |
| `src/database/migrations/1792800000000-CreateDriverTeamTables.ts` | 2 bảng + 2 enum type |
| `src/database/migrations/1792800100000-AddBookingCompletedRouteDriverIndex.ts` | Index `CONCURRENTLY` trên `booking` |

Sửa: `src/rbac/rbac.constants.ts`, `src/rbac/rbac.constants.spec.ts`, `src/app.module.ts`.

---

## Task 1: Nền tảng — function key, enum, entity, migration tạo bảng

**Files:**
- Modify: `src/rbac/rbac.constants.ts`
- Modify: `src/rbac/rbac.constants.spec.ts`
- Create: `src/driver-team/driver-team.enums.ts`
- Create: `src/driver-team/entities/driver-team-member.entity.ts`
- Create: `src/driver-team/entities/driver-team-event.entity.ts`
- Create: `src/database/migrations/1792800000000-CreateDriverTeamTables.ts`
- Create: `src/database/migrations/driver-team-migrations.spec.ts`

**Interfaces:**
- Consumes: không (task đầu tiên).
- Produces: `DriverTeamStage` (`'CONTACTED' | 'INVITED' | 'JOINED' | 'DECLINED' | 'DROPPED'`), `DriverTeamEventType` (`'STAGE_CHANGE' | 'CALL' | 'NOTE' | 'ASSIGN' | 'FOLLOW_UP'`), entity `DriverTeamMember`, `DriverTeamEvent`, bảng `driver_team_member` / `driver_team_event`.

- [ ] **Step 1: Viết test thất bại cho function key**

Thêm vào `src/rbac/rbac.constants.spec.ts`:

```ts
it('MENU_FUNCTIONS chứa driver-team (quyền RIÊNG, không gộp vào drivers)', () => {
  expect(MENU_FUNCTIONS).toContain('driver-team');
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx jest src/rbac/rbac.constants.spec.ts`
Expected: FAIL — `Expected value: "driver-team"` không có trong mảng.

- [ ] **Step 3: Thêm key**

Trong `src/rbac/rbac.constants.ts`, thêm vào cuối `MENU_FUNCTIONS` (giữ đúng convention comment 2 dòng như `'driver-reputation'`):

```ts
  // 2026-08-10: quyền RIÊNG cho màn "Đội tài chuyên nghiệp". KHÔNG gộp vào 'drivers' —
  // ghi chú tuyển team là dữ liệu nhạy cảm, ops/CSKH không được đọc.
  'driver-team',
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npx jest src/rbac/rbac.constants.spec.ts`
Expected: PASS (mọi test cũ vẫn xanh — `MENU_FUNCTIONS` không bị khoá số lượng, chỉ `SETTINGS_FUNCTIONS` khoá = 10).

- [ ] **Step 5: Tạo enum**

`src/driver-team/driver-team.enums.ts`:

```ts
/**
 * Bậc pipeline tuyển "đội tài chuyên nghiệp".
 * KHÔNG có 'POTENTIAL': tài chưa có row trong driver_team_member = tiềm năng.
 * Nhờ vậy không phải backfill vài nghìn dòng rỗng cho toàn bộ tài xế.
 */
export enum DriverTeamStage {
  CONTACTED = 'CONTACTED',
  INVITED = 'INVITED',
  JOINED = 'JOINED',
  /** HỌ từ chối mình — để dành gọi lại sau. */
  DECLINED = 'DECLINED',
  /** MÌNH loại họ — đóng hẳn. Tách khỏi DECLINED vì hành động tiếp theo khác nhau. */
  DROPPED = 'DROPPED',
}

export enum DriverTeamEventType {
  STAGE_CHANGE = 'STAGE_CHANGE',
  CALL = 'CALL',
  NOTE = 'NOTE',
  ASSIGN = 'ASSIGN',
  FOLLOW_UP = 'FOLLOW_UP',
}
```

- [ ] **Step 6: Tạo entity member**

`src/driver-team/entities/driver-team-member.entity.ts`:

```ts
import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { DriverTeamStage } from '../driver-team.enums';

/** Một tài xế trong pipeline tuyển team. Row chỉ tồn tại khi đã CHẠM tới tài đó. */
@Entity('driver_team_member')
export class DriverTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'enum', enum: DriverTeamStage, enumName: 'driver_team_stage_enum' })
  stage: DriverTeamStage;

  /**
   * Postgres integer[] THẬT (toán tử mảng dùng được), KHÔNG phải simple-array —
   * simple-array là một cột text nối bằng dấu phẩy, không query mảng được.
   * Cố ý KHÔNG có FK tới defined_routes: tuyến xoá mềm thì id ở đây vẫn giữ,
   * FE hiển thị "Tuyến đã xoá (#id)" thay vì biến mất im lặng.
   */
  @Column({ type: 'int', array: true, default: () => "'{}'" })
  assignedRouteIds: number[];

  @Column({ type: 'uuid', nullable: true })
  ownerAdminUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  nextFollowUpAt: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'timestamp', nullable: true })
  stageChangedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminUserId: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
```

- [ ] **Step 7: Tạo entity event**

`src/driver-team/entities/driver-team-event.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DriverTeamEventType, DriverTeamStage } from '../driver-team.enums';

/**
 * Nhật ký append-only của pipeline tuyển team. RIÊNG TƯ — nằm sau
 * @RequireFunction('driver-team'), KHÔNG dùng chung log customer-call của CSKH
 * (log đó chỉ gate bằng function 'drivers' nên cả ops đọc được).
 * driverId trỏ THẲNG driver (không qua member) để log sống sót nếu member bị xoá.
 */
@Entity('driver_team_event')
@Index(['driverId', 'createdAt'])
export class DriverTeamEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'enum', enum: DriverTeamEventType, enumName: 'driver_team_event_type_enum' })
  type: DriverTeamEventType;

  @Column({ type: 'enum', enum: DriverTeamStage, enumName: 'driver_team_stage_enum', nullable: true })
  fromStage: DriverTeamStage | null;

  @Column({ type: 'enum', enum: DriverTeamStage, enumName: 'driver_team_stage_enum', nullable: true })
  toStage: DriverTeamStage | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  byAdminUserId: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
```

- [ ] **Step 8: Tạo migration**

`src/database/migrations/1792800000000-CreateDriverTeamTables.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverTeamTables1792800000000 implements MigrationInterface {
  name = 'CreateDriverTeamTables1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "driver_team_stage_enum" AS ENUM('CONTACTED','INVITED','JOINED','DECLINED','DROPPED')`,
    );
    await q.query(
      `CREATE TYPE "driver_team_event_type_enum" AS ENUM('STAGE_CHANGE','CALL','NOTE','ASSIGN','FOLLOW_UP')`,
    );

    await q.query(`CREATE TABLE "driver_team_member" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "driverId" uuid NOT NULL REFERENCES "driver"("id") ON DELETE CASCADE,
      "stage" "driver_team_stage_enum" NOT NULL,
      "assignedRouteIds" int[] NOT NULL DEFAULT '{}',
      "ownerAdminUserId" uuid,
      "nextFollowUpAt" timestamp,
      "note" text,
      "stageChangedAt" timestamp,
      "createdByAdminUserId" uuid,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_driver_team_member" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_dtm_driver" ON "driver_team_member" ("driverId")`,
    );
    // Nuôi thẻ số "Cần gọi lại hôm nay" — quét theo mốc hẹn, bỏ qua row không hẹn.
    await q.query(
      `CREATE INDEX "IDX_dtm_follow_up" ON "driver_team_member" ("nextFollowUpAt") WHERE "nextFollowUpAt" IS NOT NULL`,
    );

    await q.query(`CREATE TABLE "driver_team_event" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "driverId" uuid NOT NULL REFERENCES "driver"("id") ON DELETE CASCADE,
      "type" "driver_team_event_type_enum" NOT NULL,
      "fromStage" "driver_team_stage_enum",
      "toStage" "driver_team_stage_enum",
      "note" text,
      "byAdminUserId" uuid,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_driver_team_event" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE INDEX "IDX_dte_driver_created" ON "driver_team_event" ("driverId","createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_dte_driver_created"`);
    await q.query(`DROP TABLE IF EXISTS "driver_team_event"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_dtm_follow_up"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_dtm_driver"`);
    await q.query(`DROP TABLE IF EXISTS "driver_team_member"`);
    await q.query(`DROP TYPE IF EXISTS "driver_team_event_type_enum"`);
    await q.query(`DROP TYPE IF EXISTS "driver_team_stage_enum"`);
  }
}
```

- [ ] **Step 9: Viết test migration**

`src/database/migrations/driver-team-migrations.spec.ts`:

```ts
import { CreateDriverTeamTables1792800000000 } from './1792800000000-CreateDriverTeamTables';

describe('CreateDriverTeamTables1792800000000', () => {
  const m = new CreateDriverTeamTables1792800000000();

  it('name khớp tên class (TypeORM dùng field này để chống chạy trùng)', () => {
    expect(m.name).toBe('CreateDriverTeamTables1792800000000');
  });

  it('down() gỡ đủ mọi thứ up() tạo — không để lại enum type mồ côi', async () => {
    const sql: string[] = [];
    const q = { query: async (s: string) => void sql.push(s) } as any;
    await m.down(q);
    const all = sql.join('\n');
    expect(all).toContain('DROP TABLE IF EXISTS "driver_team_member"');
    expect(all).toContain('DROP TABLE IF EXISTS "driver_team_event"');
    expect(all).toContain('DROP TYPE IF EXISTS "driver_team_stage_enum"');
    expect(all).toContain('DROP TYPE IF EXISTS "driver_team_event_type_enum"');
  });

  it('member có UNIQUE trên driverId — 1 tài KHÔNG được có 2 trạng thái', async () => {
    const sql: string[] = [];
    const q = { query: async (s: string) => void sql.push(s) } as any;
    await m.up(q);
    expect(sql.join('\n')).toContain('CREATE UNIQUE INDEX "UQ_dtm_driver"');
  });
});
```

- [ ] **Step 10: Chạy test + kiểm tĩnh**

Run: `npx jest src/database/migrations/driver-team-migrations.spec.ts src/rbac/rbac.constants.spec.ts && npx tsc --noEmit`
Expected: PASS, tsc không lỗi.

- [ ] **Step 11: Chạy migration thật trên DB local**

Run: `npm run migration:run`
Expected: log `Migration CreateDriverTeamTables1792800000000 has been executed successfully`.
Kiểm ngược: `npm run migration:revert` rồi `npm run migration:run` lại — phải sạch cả hai chiều.

- [ ] **Step 12: Commit**

```bash
git add src/rbac/rbac.constants.ts src/rbac/rbac.constants.spec.ts src/driver-team src/database/migrations/1792800000000-CreateDriverTeamTables.ts src/database/migrations/driver-team-migrations.spec.ts
git commit -m "feat(driver-team): bảng pipeline tuyển team + function key riêng

Hai bảng mới driver_team_member / driver_team_event, tách hẳn khỏi log
customer-call của CSKH (log đó chỉ gate bằng function 'drivers' nên ops đọc
được hết ghi chú đàm phán).

'Tiềm năng' KHÔNG lưu row — tài chưa có row = tiềm năng, khỏi backfill vài
nghìn dòng rỗng. Đổi lại: lọc tiềm năng phải LEFT JOIN ... WHERE member IS NULL.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Index `CONCURRENTLY` trên bảng `booking`

Tách riêng vì đây là **phần rủi ro cao nhất** của cả tính năng — đụng bảng nóng nhất trên prod, và một reviewer có thể bác riêng task này mà vẫn duyệt các task khác.

**Files:**
- Create: `src/database/migrations/1792800100000-AddBookingCompletedRouteDriverIndex.ts`
- Modify: `src/database/migrations/driver-team-migrations.spec.ts`

**Interfaces:**
- Consumes: không.
- Produces: index `IDX_booking_completed_route_driver` — mọi truy vấn ở Task 4–6 dựa vào nó.

**Bối cảnh index đã có** (đã kiểm `rg 'ON "booking"' src/database/migrations/*.ts`): có `("routeId","createdAt" DESC)`, `("status","createdAt" DESC)`, `("driverId","status")`, `("driverId","createdAt")`. **Không cái nào chứa `completedAt`** → index mới không trùng lặp. Vế "cầu" (`demand` CTE, lọc `createdAt`) đã có `("routeId","createdAt")` phục vụ.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/database/migrations/driver-team-migrations.spec.ts`:

```ts
import { AddBookingCompletedRouteDriverIndex1792800100000 } from './1792800100000-AddBookingCompletedRouteDriverIndex';

describe('AddBookingCompletedRouteDriverIndex1792800100000', () => {
  const m = new AddBookingCompletedRouteDriverIndex1792800100000();
  const collect = async (fn: (q: any) => Promise<void>) => {
    const sql: string[] = [];
    await fn({ query: async (s: string) => void sql.push(s) } as any);
    return sql.join('\n');
  };

  it('PHẢI tắt transaction — CREATE INDEX CONCURRENTLY không chạy trong transaction', () => {
    expect(m.transaction).toBe(false);
  });

  it('up() dùng CONCURRENTLY (không khoá ghi bảng booking prod)', async () => {
    const sql = await collect((q) => m.up(q));
    expect(sql).toContain('CREATE INDEX CONCURRENTLY');
    expect(sql).toContain('IF NOT EXISTS');
  });

  it('down() cũng phải CONCURRENTLY — DROP thường cũng khoá bảng', async () => {
    const sql = await collect((q) => m.down(q));
    expect(sql).toContain('DROP INDEX CONCURRENTLY IF EXISTS');
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx jest src/database/migrations/driver-team-migrations.spec.ts`
Expected: FAIL — không import được module chưa tồn tại.

- [ ] **Step 3: Viết migration**

`src/database/migrations/1792800100000-AddBookingCompletedRouteDriverIndex.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho truy vấn tổng hợp của màn "Đội tài chuyên nghiệp":
 *   WHERE status='COMPLETED' AND completedAt BETWEEN ... GROUP BY routeId, driverId
 * Bảng booking KHÔNG có index nào chứa completedAt (các index sẵn có đều theo
 * createdAt) → không trùng lặp.
 *
 * CREATE INDEX CONCURRENTLY không chạy được trong transaction — TypeORM mặc định
 * bọc up() bằng BEGIN/COMMIT, phải tắt để mỗi câu là một transaction ngầm riêng.
 * Mẫu: 1791600000000-AddCskhActivityIndexes.ts.
 */
export class AddBookingCompletedRouteDriverIndex1792800100000 implements MigrationInterface {
  name = 'AddBookingCompletedRouteDriverIndex1792800100000';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_booking_completed_route_driver"
         ON "booking" ("status", "completedAt", "routeId", "driverId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_booking_completed_route_driver"`,
    );
  }
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx jest src/database/migrations/driver-team-migrations.spec.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Chạy thật + đo**

Run: `npm run migration:run`
Sau đó trên psql, xác nhận index tồn tại và **hợp lệ**:

```sql
SELECT indexrelid::regclass AS idx, indisvalid
  FROM pg_index
 WHERE indexrelid::regclass::text = 'IDX_booking_completed_route_driver';
```

Expected: `indisvalid = true`. **Nếu `false`** → lần build concurrent bị lỗi giữa chừng, phải `DROP INDEX CONCURRENTLY` rồi chạy lại; **đừng để index invalid nằm lại**, Postgres vẫn phải bảo trì nó khi ghi mà không dùng được để đọc.

- [ ] **Step 6: Commit**

```bash
git add src/database/migrations/1792800100000-AddBookingCompletedRouteDriverIndex.ts src/database/migrations/driver-team-migrations.spec.ts
git commit -m "perf(booking): index (status, completedAt, routeId, driverId) cho tổng hợp đội tài

Bảng booking chưa có index nào chứa completedAt — các index sẵn có đều theo
createdAt. CONCURRENTLY + transaction=false để không khoá ghi trên prod.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Hàm thuần dựng SQL (`driver-team.sql.ts`)

Tách SQL ra file thuần để test được **không cần DB**, và để các invariant thiết kế (join từ đâu, DISTINCT ở đâu, clamp ở đâu) có test giữ.

**Files:**
- Create: `src/driver-team/driver-team.sql.ts`
- Create: `src/driver-team/driver-team.sql.spec.ts`

**Interfaces:**
- Consumes: không.
- Produces:
  - `clampLimit(raw: unknown, def?: number, max?: number): number`
  - `clampPage(raw: unknown): number`
  - `routeOrderBy(sort: unknown, order: unknown): string`
  - `buildRouteStatsSql(sort: unknown, order: unknown): string` — params `$1 startUtc`, `$2 endUtc`
  - `UNASSIGNED_STATS_SQL: string` — params `$1 startUtc`, `$2 endUtc`
  - `SUMMARY_SQL: string` — params `$1 startUtc`, `$2 endUtc`, `$3 todayEndUtc`
  - `buildRouteDriversSql(f: RouteDriversFilter): { sql: string; countSql: string; params: unknown[] }`
  - type `RouteDriversFilter = { startUtc: Date; endUtc: Date; routeId: number | 'none'; stage?: string; ownerAdminUserId?: string; minTrips?: number; q?: string; sort: string; order: string; limit: number; offset: number }`

- [ ] **Step 1: Viết test thất bại**

`src/driver-team/driver-team.sql.spec.ts`:

```ts
import {
  buildRouteStatsSql, buildRouteDriversSql, clampLimit, clampPage, routeOrderBy,
  SUMMARY_SQL, UNASSIGNED_STATS_SQL,
} from './driver-team.sql';

describe('clampLimit / clampPage', () => {
  it('kẹp limit về trần 200 — không tin client', () => {
    expect(clampLimit('5000')).toBe(200);
  });
  it('rác hoặc thiếu → mặc định', () => {
    expect(clampLimit(undefined)).toBe(10);
    expect(clampLimit('abc')).toBe(10);
    expect(clampLimit('0')).toBe(10);
    expect(clampLimit('-3')).toBe(10);
  });
  it('page tối thiểu là 1', () => {
    expect(clampPage('0')).toBe(1);
    expect(clampPage('-9')).toBe(1);
    expect(clampPage('3')).toBe(3);
  });
});

describe('routeOrderBy', () => {
  it('chỉ nhận giá trị trong whitelist', () => {
    expect(routeOrderBy('trips', 'asc')).toBe('"completedTrips" ASC, r.name ASC');
    expect(routeOrderBy('name', 'desc')).toBe('r.name DESC');
  });
  it('giá trị lạ → rơi về mặc định, KHÔNG nhét vào SQL', () => {
    const out = routeOrderBy('name; DROP TABLE booking', 'desc');
    expect(out).toBe('"driverCount" DESC, "completedTrips" DESC, r.name ASC');
    expect(out).not.toContain('DROP');
  });
});

describe('buildRouteStatsSql', () => {
  const sql = buildRouteStatsSql('drivers', 'desc');

  it('join TỪ defined_routes — tuyến 0 chuyến PHẢI còn trong kết quả', () => {
    expect(sql).toMatch(/FROM\s+"defined_routes"\s+r/);
    expect(sql).toMatch(/LEFT JOIN\s+done/);
    expect(sql).toMatch(/LEFT JOIN\s+demand/);
  });

  it('bỏ tuyến đã xoá mềm', () => {
    expect(sql).toContain('r."deletedAt" IS NULL');
  });

  it('đếm tài theo DISTINCT — 1 tài chạy 5 chuyến vẫn là 1 tài', () => {
    expect(sql).toContain('COUNT(DISTINCT b."driverId")');
  });

  it('done lọc theo completedAt, demand lọc theo createdAt — hai mốc KHÁC nhau', () => {
    const done = sql.slice(sql.indexOf('done AS'), sql.indexOf('demand AS'));
    const demand = sql.slice(sql.indexOf('demand AS'), sql.indexOf('team AS'));
    expect(done).toContain('b."completedAt" >= $1');
    expect(done).not.toContain('b."createdAt"');
    expect(demand).toContain('b."createdAt" >= $1');
    expect(demand).not.toContain('b."completedAt"');
  });
});

describe('SUMMARY_SQL', () => {
  it('mọi con số đếm DISTINCT/1-row-1-tài — tài chạy 3 tuyến chỉ tính 1 lần', () => {
    expect(SUMMARY_SQL).toContain('COUNT(DISTINCT b."driverId")');
  });
  it('followUpDueToday dùng tham số riêng $3 (mốc hết ngày VN), không dính $1/$2', () => {
    expect(SUMMARY_SQL).toContain('"nextFollowUpAt" <= $3');
  });
});

describe('UNASSIGNED_STATS_SQL', () => {
  it('chỉ lấy booking không gắn tuyến', () => {
    expect(UNASSIGNED_STATS_SQL).toContain('b."routeId" IS NULL');
  });
});

describe('buildRouteDriversSql', () => {
  const base = {
    startUtc: new Date('2026-08-01T00:00:00Z'),
    endUtc: new Date('2026-08-31T00:00:00Z'),
    routeId: 12 as const | number,
    sort: 'trips', order: 'desc', limit: 10, offset: 0,
  };

  it('routeId số → so khớp bằng tham số, KHÔNG nội suy chuỗi', () => {
    const { sql, params } = buildRouteDriversSql({ ...base, routeId: 12 });
    expect(sql).toContain('b."routeId" = $3');
    expect(params).toContain(12);
  });

  it("routeId 'none' → IS NULL và KHÔNG đẩy thêm param", () => {
    const { sql, params } = buildRouteDriversSql({ ...base, routeId: 'none' });
    expect(sql).toContain('b."routeId" IS NULL');
    expect(params).toEqual([base.startUtc, base.endUtc, 10, 0]);
  });

  it('chỉ giữ tài có chuyến TRÊN tuyến đang xem (HAVING)', () => {
    const { sql } = buildRouteDriversSql(base);
    expect(sql).toContain('HAVING');
  });

  it('bỏ booking không có tài xế', () => {
    expect(buildRouteDriversSql(base).sql).toContain('b."driverId" IS NOT NULL');
  });

  it('q tìm cả tên lẫn SĐT, dùng param không nội suy', () => {
    const { sql, params } = buildRouteDriversSql({ ...base, q: "a' OR 1=1--" });
    expect(sql).not.toContain('OR 1=1');
    expect(params).toContain("%a' OR 1=1--%");
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx jest src/driver-team/driver-team.sql.spec.ts`
Expected: FAIL — `Cannot find module './driver-team.sql'`.

- [ ] **Step 3: Viết `driver-team.sql.ts`**

```ts
/**
 * SQL thô cho màn "Đội tài chuyên nghiệp". Hàm THUẦN, không import Nest/TypeORM —
 * để test được không cần DB. Câu SQL chạy thật được phủ bằng
 * driver-team.sql.integration.spec.ts (Postgres thật qua testcontainers).
 *
 * Quy ước: bảng booking/driver/user số ít; cột camelCase PHẢI bọc nháy kép.
 * Không bao giờ nội suy input người dùng — mọi giá trị đi qua $n.
 */

export function clampLimit(raw: unknown, def = 10, max = 200): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}

export function clampPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

const ROUTE_SORTS: Record<string, string> = {
  drivers: '"driverCount"',
  trips: '"completedTrips"',
  name: 'r.name',
};

export function routeOrderBy(sort: unknown, order: unknown): string {
  const dir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const col = ROUTE_SORTS[String(sort)];
  if (!col) return '"driverCount" DESC, "completedTrips" DESC, r.name ASC';
  if (col === 'r.name') return `r.name ${dir}`;
  return `${col} ${dir}, r.name ASC`;
}

/**
 * Cấp 1 — mọi tuyến còn sống, KỂ CẢ tuyến 0 chuyến.
 * Phải join TỪ defined_routes: `GROUP BY routeId` trên booking sẽ làm tuyến rỗng
 * biến mất khỏi kết quả, đúng cái người dùng cần thấy nhất.
 *
 * done  = vế CUNG, lọc theo completedAt.
 * demand= vế CẦU, lọc theo createdAt.
 * Hai mốc thời gian KHÁC nhau (cố ý) → hai tập khác nhau, UI phải hiện 2 cột riêng,
 * KHÔNG viết thành phân số.
 */
export function buildRouteStatsSql(sort: unknown, order: unknown): string {
  return `
WITH done AS (
  SELECT b."routeId" AS "routeId",
         COUNT(*)::int AS "completedTrips",
         COUNT(DISTINCT b."driverId")::int AS "driverCount",
         MAX(b."completedAt") AS "lastCompletedAt"
    FROM "booking" b
   WHERE b.status = 'COMPLETED'
     AND b."driverId" IS NOT NULL
     AND b."completedAt" >= $1 AND b."completedAt" <= $2
   GROUP BY b."routeId"
), demand AS (
  SELECT b."routeId" AS "routeId", COUNT(*)::int AS "totalBookings"
    FROM "booking" b
   WHERE b."createdAt" >= $1 AND b."createdAt" <= $2
   GROUP BY b."routeId"
), team AS (
  SELECT b."routeId" AS "routeId",
         COUNT(DISTINCT m."driverId")::int AS "contactedCount",
         COUNT(DISTINCT m."driverId") FILTER (WHERE m.stage = 'JOINED')::int AS "joinedCount"
    FROM "booking" b
    JOIN "driver_team_member" m ON m."driverId" = b."driverId"
   WHERE b.status = 'COMPLETED'
     AND b."completedAt" >= $1 AND b."completedAt" <= $2
   GROUP BY b."routeId"
)
SELECT r.id AS "routeId",
       r.name AS "routeName",
       COALESCE(done."driverCount", 0) AS "driverCount",
       COALESCE(done."completedTrips", 0) AS "completedTrips",
       COALESCE(demand."totalBookings", 0) AS "totalBookings",
       done."lastCompletedAt" AS "lastCompletedAt",
       COALESCE(team."contactedCount", 0) AS "contactedCount",
       COALESCE(team."joinedCount", 0) AS "joinedCount"
  FROM "defined_routes" r
  LEFT JOIN done   ON done."routeId"   = r.id
  LEFT JOIN demand ON demand."routeId" = r.id
  LEFT JOIN team   ON team."routeId"   = r.id
 WHERE r."deletedAt" IS NULL
 ORDER BY ${routeOrderBy(sort, order)}`;
}

/** Hàng "Không gắn tuyến" — booking legacy / routing-miss. */
export const UNASSIGNED_STATS_SQL = `
SELECT
  (SELECT COUNT(DISTINCT b."driverId")::int FROM "booking" b
    WHERE b.status = 'COMPLETED' AND b."routeId" IS NULL AND b."driverId" IS NOT NULL
      AND b."completedAt" >= $1 AND b."completedAt" <= $2) AS "driverCount",
  (SELECT COUNT(*)::int FROM "booking" b
    WHERE b.status = 'COMPLETED' AND b."routeId" IS NULL
      AND b."completedAt" >= $1 AND b."completedAt" <= $2) AS "completedTrips",
  (SELECT COUNT(*)::int FROM "booking" b
    WHERE b."routeId" IS NULL AND b."createdAt" >= $1 AND b."createdAt" <= $2) AS "totalBookings",
  (SELECT MAX(b."completedAt") FROM "booking" b
    WHERE b.status = 'COMPLETED' AND b."routeId" IS NULL
      AND b."completedAt" >= $1 AND b."completedAt" <= $2) AS "lastCompletedAt"`;

/**
 * 4 thẻ số. PHẢI đếm DISTINCT — cộng dồn driverCount của từng tuyến sẽ đếm trùng
 * tài chạy nhiều tuyến.
 * $3 = hết ngày HÔM NAY giờ VN (vnTodayBoundsUtc().endUtc) — "việc phải gọi hôm nay"
 * không phụ thuộc khoảng ngày đang xem, nên tách hẳn khỏi $1/$2.
 */
export const SUMMARY_SQL = `
SELECT
  (SELECT COUNT(DISTINCT b."driverId")::int FROM "booking" b
    WHERE b.status = 'COMPLETED' AND b."driverId" IS NOT NULL
      AND b."completedAt" >= $1 AND b."completedAt" <= $2) AS "driversWithCompletedTrips",
  (SELECT COUNT(*)::int FROM "driver_team_member") AS "contactedDrivers",
  (SELECT COUNT(*)::int FROM "driver_team_member" WHERE stage = 'JOINED') AS "joinedDrivers",
  (SELECT COUNT(*)::int FROM "driver_team_member"
    WHERE "nextFollowUpAt" IS NOT NULL AND "nextFollowUpAt" <= $3) AS "followUpDueToday"`;

export type RouteDriversFilter = {
  startUtc: Date;
  endUtc: Date;
  routeId: number | 'none';
  stage?: string;
  ownerAdminUserId?: string;
  minTrips?: number;
  q?: string;
  sort: string;
  order: string;
  limit: number;
  offset: number;
};

const DRIVER_SORTS: Record<string, string> = {
  trips: '"tripsOnRoute"',
  last: '"lastCompletedAt"',
  name: 'u."fullName"',
};

/**
 * Cấp 2 — tài xế trên MỘT tuyến. Dòng là cặp (tài × tuyến): `tripsOnRoute` là số
 * chuyến TRÊN tuyến đang xem, `tripsAllRoutes` là tổng mọi tuyến trong cùng kỳ.
 */
export function buildRouteDriversSql(f: RouteDriversFilter): {
  sql: string;
  countSql: string;
  params: unknown[];
} {
  const params: unknown[] = [f.startUtc, f.endUtc];
  let routeMatch: string;
  if (f.routeId === 'none') {
    routeMatch = 'b."routeId" IS NULL';
  } else {
    params.push(f.routeId);
    routeMatch = `b."routeId" = $${params.length}`;
  }

  const where: string[] = [];
  if (f.stage) {
    params.push(f.stage);
    where.push(`m.stage = $${params.length}`);
  }
  if (f.ownerAdminUserId) {
    params.push(f.ownerAdminUserId);
    where.push(`m."ownerAdminUserId" = $${params.length}`);
  }
  if (f.minTrips && f.minTrips > 0) {
    params.push(f.minTrips);
    where.push(`done."tripsOnRoute" >= $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(u."fullName" ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const cte = `
WITH done AS (
  SELECT b."driverId" AS "driverId",
         COUNT(*) FILTER (WHERE ${routeMatch})::int AS "tripsOnRoute",
         COUNT(*)::int AS "tripsAllRoutes",
         MAX(b."completedAt") FILTER (WHERE ${routeMatch}) AS "lastCompletedAt",
         MIN(b."completedAt") FILTER (WHERE ${routeMatch}) AS "firstCompletedAt"
    FROM "booking" b
   WHERE b.status = 'COMPLETED'
     AND b."driverId" IS NOT NULL
     AND b."completedAt" >= $1 AND b."completedAt" <= $2
   GROUP BY b."driverId"
  HAVING COUNT(*) FILTER (WHERE ${routeMatch}) > 0
)`;

  const from = `
  FROM done
  JOIN "driver" d ON d.id = done."driverId"
  LEFT JOIN "user" u ON u.id = d."userId"
  LEFT JOIN "transport_company" tc ON tc.id = d."transportCompanyId"
  LEFT JOIN "driver_team_member" m ON m."driverId" = d.id
  LEFT JOIN "user" oa ON oa.id = m."ownerAdminUserId"
  ${whereSql}`;

  const dirRaw = String(f.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortCol = DRIVER_SORTS[String(f.sort)] ?? '"tripsOnRoute"';
  const orderBy = `${sortCol} ${dirRaw} NULLS LAST, d.id ASC`;

  params.push(f.limit, f.offset);
  const limitSql = `LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const sql = `${cte}
SELECT d.id AS "driverId",
       u."fullName" AS "fullName",
       u.phone AS "phone",
       COALESCE(tc.name, d."customTransportCompanyName") AS "transportCompanyName",
       done."tripsOnRoute", done."tripsAllRoutes",
       done."lastCompletedAt", done."firstCompletedAt",
       d."isApproved", d."isBanned", d."suspendedUntil",
       m.stage, m."assignedRouteIds", m."ownerAdminUserId",
       oa."fullName" AS "ownerAdminName",
       m."nextFollowUpAt", m.note, m."stageChangedAt"
${from}
 ORDER BY ${orderBy}
 ${limitSql}`;

  const countSql = `${cte}
SELECT COUNT(*)::int AS total
${from}`;

  return { sql, countSql, params };
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx jest src/driver-team/driver-team.sql.spec.ts && npx tsc --noEmit`
Expected: PASS toàn bộ.

> **Lưu ý cho người thực thi:** `countSql` dùng chung mảng `params` với `sql`, mà `params` có **thêm 2 phần tử cuối** là `limit`/`offset` mà `countSql` không tham chiếu. Postgres cho phép truyền dư param **chỉ khi** chúng không bị dùng — nhưng `node-postgres` gửi đủ và Postgres sẽ báo lỗi *"bind message supplies N parameters, but prepared statement requires M"*. **Task 5 phải cắt mảng** khi gọi count: `params.slice(0, -2)`. Test của Task 5 khoá điều này.

- [ ] **Step 5: Commit**

```bash
git add src/driver-team/driver-team.sql.ts src/driver-team/driver-team.sql.spec.ts
git commit -m "feat(driver-team): hàm thuần dựng SQL tổng hợp + test invariant

Tách SQL ra file thuần để test không cần DB. Test khoá đúng các quyết định dễ
vỡ nhất: join TỪ defined_routes (group từ booking sẽ làm tuyến 0 chuyến biến
mất), đếm DISTINCT tài, done/demand dùng hai mốc thời gian khác nhau, và
ORDER BY chỉ nhận whitelist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `DriverTeamStatsService` — `listRoutes` + `getSummary`

**Files:**
- Create: `src/driver-team/driver-team-stats.service.ts`
- Create: `src/driver-team/driver-team-stats.service.spec.ts`

**Interfaces:**
- Consumes: `buildRouteStatsSql`, `UNASSIGNED_STATS_SQL`, `SUMMARY_SQL` (Task 3); `vnRangeToUtc`, `vnTodayBoundsUtc` (`src/common/vn-time.util.ts`).
- Produces:
  - `listRoutes(q: { from: string; to: string; sort?: string; order?: string }): Promise<{ data: RouteStatsRow[]; unassigned: RouteStatsRow; meta: { range: { from: string; to: string } } }>`
  - `getSummary(q: { from: string; to: string }): Promise<TeamSummary>`
  - type `RouteStatsRow = { routeId: number | null; routeName: string; driverCount: number; completedTrips: number; totalBookings: number; lastCompletedAt: Date | null; contactedCount: number; joinedCount: number }`
  - type `TeamSummary = { driversWithCompletedTrips: number; contactedDrivers: number; joinedDrivers: number; followUpDueToday: number }`

- [ ] **Step 1: Viết test thất bại**

`src/driver-team/driver-team-stats.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DriverTeamStatsService } from './driver-team-stats.service';

describe('DriverTeamStatsService — listRoutes / getSummary', () => {
  let service: DriverTeamStatsService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const m = await Test.createTestingModule({
      providers: [
        DriverTeamStatsService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = m.get(DriverTeamStatsService);
  });

  it('đổi from/to VN sang mốc UTC: 2026-08-01 VN bắt đầu lúc 2026-07-31T17:00Z', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { driverCount: 0, completedTrips: 0, totalBookings: 0, lastCompletedAt: null },
    ]);

    await service.listRoutes({ from: '2026-08-01', to: '2026-08-01' });

    const params = query.mock.calls[0][1] as Date[];
    expect(params[0].toISOString()).toBe('2026-07-31T17:00:00.000Z');
    expect(params[1].toISOString()).toBe('2026-08-01T16:59:59.999Z');
  });

  it('chuyến hoàn thành 23:30 giờ VN ngày 1/8 nằm TRONG ngày 1/8, không rơi sang 31/7', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { driverCount: 0, completedTrips: 0, totalBookings: 0, lastCompletedAt: null },
    ]);
    await service.listRoutes({ from: '2026-08-01', to: '2026-08-01' });
    const [start, end] = query.mock.calls[0][1] as Date[];

    const trip2330Vn = new Date('2026-08-01T16:30:00.000Z'); // 23:30 VN
    expect(trip2330Vn >= start && trip2330Vn <= end).toBe(true);
  });

  it('luôn trả hàng "Không gắn tuyến" kể cả khi rỗng', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { driverCount: 0, completedTrips: 0, totalBookings: 0, lastCompletedAt: null },
    ]);
    const out = await service.listRoutes({ from: '2026-08-01', to: '2026-08-02' });
    expect(out.unassigned.routeId).toBeNull();
    expect(out.unassigned.routeName).toBe('Không gắn tuyến');
    expect(out.unassigned.driverCount).toBe(0);
  });

  it('from/to đảo ngược → BadRequest (do vnRangeToUtc chặn)', async () => {
    await expect(
      service.listRoutes({ from: '2026-08-10', to: '2026-08-01' }),
    ).rejects.toThrow('Khoảng thời gian không hợp lệ');
  });

  it('getSummary truyền mốc hết ngày VN làm $3, độc lập khoảng ngày đang xem', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-10T03:00:00.000Z'));
    query.mockResolvedValueOnce([
      { driversWithCompletedTrips: 5, contactedDrivers: 2, joinedDrivers: 1, followUpDueToday: 3 },
    ]);

    const out = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

    const params = query.mock.calls[0][1] as Date[];
    expect(params[2].toISOString()).toBe('2026-08-10T16:59:59.999Z'); // hết 10/8 giờ VN
    expect(out.followUpDueToday).toBe(3);
    jest.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx jest src/driver-team/driver-team-stats.service.spec.ts`
Expected: FAIL — `Cannot find module './driver-team-stats.service'`.

- [ ] **Step 3: Viết service**

`src/driver-team/driver-team-stats.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { vnRangeToUtc, vnTodayBoundsUtc } from '../common/vn-time.util';
import { buildRouteStatsSql, SUMMARY_SQL, UNASSIGNED_STATS_SQL } from './driver-team.sql';

export type RouteStatsRow = {
  routeId: number | null;
  routeName: string;
  driverCount: number;
  completedTrips: number;
  totalBookings: number;
  lastCompletedAt: Date | null;
  contactedCount: number;
  joinedCount: number;
};

export type TeamSummary = {
  driversWithCompletedTrips: number;
  contactedDrivers: number;
  joinedDrivers: number;
  followUpDueToday: number;
};

@Injectable()
export class DriverTeamStatsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Cấp 1 — mọi tuyến còn sống + hàng "Không gắn tuyến". */
  async listRoutes(q: { from: string; to: string; sort?: string; order?: string }) {
    const { startUtc, endUtc } = vnRangeToUtc(q.from, q.to);

    const [rows, unassignedRows] = await Promise.all([
      this.dataSource.query(buildRouteStatsSql(q.sort, q.order), [startUtc, endUtc]),
      this.dataSource.query(UNASSIGNED_STATS_SQL, [startUtc, endUtc]),
    ]);

    const u = unassignedRows[0] ?? {};
    const unassigned: RouteStatsRow = {
      routeId: null,
      routeName: 'Không gắn tuyến',
      driverCount: u.driverCount ?? 0,
      completedTrips: u.completedTrips ?? 0,
      totalBookings: u.totalBookings ?? 0,
      lastCompletedAt: u.lastCompletedAt ?? null,
      // Pipeline không gắn theo tuyến ảo này — cố ý để 0, đừng suy diễn.
      contactedCount: 0,
      joinedCount: 0,
    };

    return { data: rows as RouteStatsRow[], unassigned, meta: { range: { from: q.from, to: q.to } } };
  }

  /** 4 thẻ số. followUpDueToday KHÔNG dính khoảng ngày đang xem. */
  async getSummary(q: { from: string; to: string }): Promise<TeamSummary> {
    const { startUtc, endUtc } = vnRangeToUtc(q.from, q.to);
    const { endUtc: todayEndUtc } = vnTodayBoundsUtc(Date.now());
    const rows = await this.dataSource.query(SUMMARY_SQL, [startUtc, endUtc, todayEndUtc]);
    return rows[0] as TeamSummary;
  }
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx jest src/driver-team/driver-team-stats.service.spec.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/driver-team/driver-team-stats.service.ts src/driver-team/driver-team-stats.service.spec.ts
git commit -m "feat(driver-team): service tổng hợp cấp 1 (tuyến) + 4 thẻ số

Dùng lại vnRangeToUtc/vnTodayBoundsUtc, không hand-roll AT TIME ZONE. Test
khoá ca ranh giới VN: chuyến xong 23:30 ngày 1/8 giờ VN phải nằm trong ngày
1/8. Hàng 'Không gắn tuyến' luôn trả kể cả rỗng.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `DriverTeamStatsService.listRouteDrivers` — cấp 2

**Files:**
- Modify: `src/driver-team/driver-team-stats.service.ts`
- Modify: `src/driver-team/driver-team-stats.service.spec.ts`

**Interfaces:**
- Consumes: `buildRouteDriversSql`, `clampLimit`, `clampPage` (Task 3).
- Produces: `listRouteDrivers(routeId: number | 'none', q: RouteDriversQuery): Promise<{ data: TeamDriverRow[]; meta: { page; limit; total; totalPages } }>`
  - `RouteDriversQuery = { from: string; to: string; stage?: string; ownerAdminUserId?: string; minTrips?: string; q?: string; sort?: string; order?: string; page?: string; limit?: string }`
  - `TeamDriverRow` gồm `shareOfRoute: number` — tính ở BE, FE chỉ hiển thị.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `driver-team-stats.service.spec.ts`:

```ts
describe('DriverTeamStatsService — listRouteDrivers', () => {
  let service: DriverTeamStatsService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const m = await Test.createTestingModule({
      providers: [DriverTeamStatsService, { provide: DataSource, useValue: { query } }],
    }).compile();
    service = m.get(DriverTeamStatsService);
  });

  const rowsOnce = (rows: any[], total = rows.length) => {
    query.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ total }]);
  };

  it('câu COUNT không được nhận limit/offset — dư param là Postgres báo lỗi bind', async () => {
    rowsOnce([]);
    await service.listRouteDrivers(12, { from: '2026-08-01', to: '2026-08-31' });

    const listParams = query.mock.calls[0][1] as unknown[];
    const countParams = query.mock.calls[1][1] as unknown[];
    expect(countParams.length).toBe(listParams.length - 2);
  });

  it('shareOfRoute = chuyến của tài / tổng chuyến tuyến', async () => {
    rowsOnce([{ driverId: 'd1', tripsOnRoute: 40, tripsAllRoutes: 63 }]);
    query.mockResolvedValueOnce([{ completedTrips: 60 }]); // tổng chuyến tuyến

    const out = await service.listRouteDrivers(12, { from: '2026-08-01', to: '2026-08-31' });
    expect(out.data[0].shareOfRoute).toBeCloseTo(40 / 60, 5);
  });

  it('tổng chuyến tuyến = 0 → shareOfRoute = 0, KHÔNG chia cho 0', async () => {
    rowsOnce([{ driverId: 'd1', tripsOnRoute: 0, tripsAllRoutes: 0 }]);
    query.mockResolvedValueOnce([{ completedTrips: 0 }]);

    const out = await service.listRouteDrivers(12, { from: '2026-08-01', to: '2026-08-31' });
    expect(out.data[0].shareOfRoute).toBe(0);
    expect(Number.isFinite(out.data[0].shareOfRoute)).toBe(true);
  });

  it('limit client gửi 5000 bị kẹp về 200', async () => {
    rowsOnce([]);
    query.mockResolvedValueOnce([{ completedTrips: 0 }]);
    const out = await service.listRouteDrivers(12, {
      from: '2026-08-01', to: '2026-08-31', limit: '5000',
    });
    expect(out.meta.limit).toBe(200);
  });

  it("routeId 'none' vẫn chạy được (nhóm Không gắn tuyến)", async () => {
    rowsOnce([]);
    query.mockResolvedValueOnce([{ completedTrips: 0 }]);
    await expect(
      service.listRouteDrivers('none', { from: '2026-08-01', to: '2026-08-31' }),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx jest src/driver-team/driver-team-stats.service.spec.ts -t listRouteDrivers`
Expected: FAIL — `service.listRouteDrivers is not a function`.

- [ ] **Step 3: Bổ sung service**

Thêm vào `driver-team-stats.service.ts` (import thêm `buildRouteDriversSql, clampLimit, clampPage`):

```ts
export type TeamDriverRow = {
  driverId: string;
  fullName: string | null;
  phone: string | null;
  transportCompanyName: string | null;
  tripsOnRoute: number;
  tripsAllRoutes: number;
  /** Tính ở BE để FE không phải chia — và để chỗ chia-cho-0 chỉ tồn tại một nơi. */
  shareOfRoute: number;
  lastCompletedAt: Date | null;
  firstCompletedAt: Date | null;
  isApproved: boolean;
  isBanned: boolean;
  suspendedUntil: Date | null;
  team: {
    stage: string;
    assignedRouteIds: number[];
    ownerAdminUserId: string | null;
    ownerAdminName: string | null;
    nextFollowUpAt: Date | null;
    note: string | null;
    stageChangedAt: Date | null;
  } | null;
};

export type RouteDriversQuery = {
  from: string; to: string;
  stage?: string; ownerAdminUserId?: string; minTrips?: string; q?: string;
  sort?: string; order?: string; page?: string; limit?: string;
};
```

```ts
  async listRouteDrivers(routeId: number | 'none', q: RouteDriversQuery) {
    const { startUtc, endUtc } = vnRangeToUtc(q.from, q.to);
    const limit = clampLimit(q.limit);
    const page = clampPage(q.page);

    const { sql, countSql, params } = buildRouteDriversSql({
      startUtc, endUtc, routeId,
      stage: q.stage, ownerAdminUserId: q.ownerAdminUserId,
      minTrips: q.minTrips ? Number(q.minTrips) : undefined,
      q: q.q,
      sort: q.sort ?? 'trips',
      order: q.order ?? 'desc',
      limit,
      offset: (page - 1) * limit,
    });

    // params kết thúc bằng [limit, offset] mà countSql KHÔNG tham chiếu.
    // Gửi dư param → Postgres: "bind message supplies N parameters, but
    // prepared statement requires M". Phải cắt.
    const countParams = params.slice(0, -2);

    const [rows, countRows, routeTotalRows] = await Promise.all([
      this.dataSource.query(sql, params),
      this.dataSource.query(countSql, countParams),
      this.dataSource.query(
        routeId === 'none'
          ? `SELECT COUNT(*)::int AS "completedTrips" FROM "booking" b
              WHERE b.status = 'COMPLETED' AND b."routeId" IS NULL
                AND b."completedAt" >= $1 AND b."completedAt" <= $2`
          : `SELECT COUNT(*)::int AS "completedTrips" FROM "booking" b
              WHERE b.status = 'COMPLETED' AND b."routeId" = $3
                AND b."completedAt" >= $1 AND b."completedAt" <= $2`,
        routeId === 'none' ? [startUtc, endUtc] : [startUtc, endUtc, routeId],
      ),
    ]);

    const routeTotal = routeTotalRows[0]?.completedTrips ?? 0;
    const total = countRows[0]?.total ?? 0;

    const data: TeamDriverRow[] = (rows as any[]).map((r) => ({
      driverId: r.driverId,
      fullName: r.fullName ?? null,
      phone: r.phone ?? null,
      transportCompanyName: r.transportCompanyName ?? null,
      tripsOnRoute: r.tripsOnRoute ?? 0,
      tripsAllRoutes: r.tripsAllRoutes ?? 0,
      shareOfRoute: routeTotal > 0 ? (r.tripsOnRoute ?? 0) / routeTotal : 0,
      lastCompletedAt: r.lastCompletedAt ?? null,
      firstCompletedAt: r.firstCompletedAt ?? null,
      isApproved: !!r.isApproved,
      isBanned: !!r.isBanned,
      suspendedUntil: r.suspendedUntil ?? null,
      team: r.stage
        ? {
            stage: r.stage,
            assignedRouteIds: r.assignedRouteIds ?? [],
            ownerAdminUserId: r.ownerAdminUserId ?? null,
            ownerAdminName: r.ownerAdminName ?? null,
            nextFollowUpAt: r.nextFollowUpAt ?? null,
            note: r.note ?? null,
            stageChangedAt: r.stageChangedAt ?? null,
          }
        : null,
    }));

    return {
      data,
      meta: { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 },
    };
  }
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx jest src/driver-team/driver-team-stats.service.spec.ts && npx tsc --noEmit`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/driver-team/driver-team-stats.service.ts src/driver-team/driver-team-stats.service.spec.ts
git commit -m "feat(driver-team): danh sách tài xế theo tuyến + tỉ trọng chuyến

shareOfRoute tính ở BE để chỗ chia-cho-0 chỉ tồn tại một nơi. Test khoá việc
câu COUNT phải cắt bỏ limit/offset khỏi mảng param — gửi dư là Postgres báo
lỗi bind, mà mock không bắt được.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Integration spec — chạy SQL thật trên Postgres thật

Ba câu SQL ở Task 3 **chưa từng chạy thật**. Mock chỉ chứng minh chuỗi SQL đúng hình dạng, không chứng minh nó chạy được: sai tên cột, sai nhãn enum, `COUNT(*) FILTER (...)::int` sai cú pháp, JOIN sai khoá — `tsc` và jest mock đều không thấy. Repo có tiền lệ đúng cho việc này: `src/driver-reputation/driver-reputation.sql.integration.spec.ts`.

**Files:**
- Create: `src/driver-team/driver-team.sql.integration.spec.ts`

**Interfaces:**
- Consumes: `DriverTeamStatsService` (Task 4, 5), entity Task 1.
- Produces: không (chỉ bằng chứng).

- [ ] **Step 1: Viết integration spec**

`src/driver-team/driver-team.sql.integration.spec.ts`:

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { Booking } from '../booking/entities/booking.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { User } from '../users/user.entity';
import { DefinedRoute } from '../common/entities/defined-route.entity';
import { DriverTeamMember } from './entities/driver-team-member.entity';
import { DriverTeamEvent } from './entities/driver-team-event.entity';
import { DriverTeamStatsService } from './driver-team-stats.service';

/**
 * SQL thô của DriverTeamStatsService chạy trên Postgres THẬT.
 * Bị loại khỏi `npm test`; chạy: `npm run test:integration` (cần Docker).
 * Kỳ vọng viết theo HÀNH VI PHẢI CÓ, không theo code hiện tại.
 */
jest.setTimeout(300000);

describe('DriverTeamStatsService — SQL thật trên Postgres thật', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let service: DriverTeamStatsService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:15-3.3').start();
    ds = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: ['src/**/*.entity.ts'],
      synchronize: true,
    });
    await ds.initialize();
    service = new DriverTeamStatsService(ds);
  });

  afterAll(async () => {
    await ds?.destroy();
    await container?.stop();
  });

  it('tuyến KHÔNG có chuyến nào vẫn xuất hiện với mọi số = 0', async () => {
    const route = await ds.getRepository(DefinedRoute).save({ name: 'Tuyến rỗng' } as any);

    const out = await service.listRoutes({ from: '2026-08-01', to: '2026-08-31' });

    const row = out.data.find((r) => r.routeId === route.id);
    expect(row).toBeDefined();
    expect(row!.driverCount).toBe(0);
    expect(row!.completedTrips).toBe(0);
  });

  it('tuyến đã xoá mềm KHÔNG xuất hiện', async () => {
    const repo = ds.getRepository(DefinedRoute);
    const route = await repo.save({ name: 'Tuyến đã xoá' } as any);
    await repo.softDelete(route.id);

    const out = await service.listRoutes({ from: '2026-08-01', to: '2026-08-31' });

    expect(out.data.find((r) => r.routeId === route.id)).toBeUndefined();
  });

  it('một tài chạy 5 chuyến trên cùng tuyến = 1 tài, 5 chuyến', async () => {
    const { route, driver } = await seedDriverOnRoute(ds, 'Tuyến A');
    for (let i = 0; i < 5; i++) {
      await seedCompleted(ds, driver.id, route.id, '2026-08-05T03:00:00.000Z');
    }

    const out = await service.listRoutes({ from: '2026-08-01', to: '2026-08-31' });
    const row = out.data.find((r) => r.routeId === route.id)!;

    expect(row.driverCount).toBe(1);
    expect(row.completedTrips).toBe(5);
  });

  it('RANH GIỚI VN: chuyến xong 23:30 ngày 1/8 giờ VN thuộc ngày 1/8, không thuộc 31/7', async () => {
    const { route, driver } = await seedDriverOnRoute(ds, 'Tuyến B');
    // 2026-08-01 23:30 VN === 2026-08-01T16:30Z
    await seedCompleted(ds, driver.id, route.id, '2026-08-01T16:30:00.000Z');

    const aug1 = await service.listRoutes({ from: '2026-08-01', to: '2026-08-01' });
    const jul31 = await service.listRoutes({ from: '2026-07-31', to: '2026-07-31' });

    expect(aug1.data.find((r) => r.routeId === route.id)!.completedTrips).toBe(1);
    expect(jul31.data.find((r) => r.routeId === route.id)!.completedTrips).toBe(0);
  });

  it('booking không gắn tuyến rơi vào hàng "Không gắn tuyến"', async () => {
    const { driver } = await seedDriverOnRoute(ds, 'Tuyến C');
    await seedCompleted(ds, driver.id, null, '2026-08-05T03:00:00.000Z');

    const out = await service.listRoutes({ from: '2026-08-01', to: '2026-08-31' });

    expect(out.unassigned.completedTrips).toBeGreaterThanOrEqual(1);
    expect(out.unassigned.routeId).toBeNull();
  });

  it('listRouteDrivers chạy được và trả tỉ trọng đúng', async () => {
    const { route, driver } = await seedDriverOnRoute(ds, 'Tuyến D');
    for (let i = 0; i < 3; i++) {
      await seedCompleted(ds, driver.id, route.id, '2026-08-06T03:00:00.000Z');
    }

    const out = await service.listRouteDrivers(route.id, { from: '2026-08-01', to: '2026-08-31' });

    expect(out.data).toHaveLength(1);
    expect(out.data[0].tripsOnRoute).toBe(3);
    expect(out.data[0].shareOfRoute).toBeCloseTo(1, 5);
    expect(out.meta.total).toBe(1);
  });

  it('getSummary đếm DISTINCT: tài chạy 2 tuyến chỉ tính 1 lần', async () => {
    const { route: r1, driver } = await seedDriverOnRoute(ds, 'Tuyến E1');
    const r2 = await ds.getRepository(DefinedRoute).save({ name: 'Tuyến E2' } as any);
    await seedCompleted(ds, driver.id, r1.id, '2026-09-05T03:00:00.000Z');
    await seedCompleted(ds, driver.id, r2.id, '2026-09-05T04:00:00.000Z');

    const out = await service.getSummary({ from: '2026-09-01', to: '2026-09-30' });

    expect(out.driversWithCompletedTrips).toBe(1);
  });
});
```

- [ ] **Step 2: Viết helper seed ngay trong file spec**

Đặt ở cuối file (không export ra ngoài — chỉ phục vụ spec này):

```ts
let seq = 0;

async function seedDriverOnRoute(ds: DataSource, routeName: string) {
  seq += 1;
  const route = await ds.getRepository(DefinedRoute).save({ name: routeName } as any);
  const user = await ds.getRepository(User).save({
    phone: `090000${String(seq).padStart(4, '0')}`,
    fullName: `Tài ${seq}`,
  } as any);
  const driver = await ds.getRepository(Driver).save({ userId: user.id } as any);
  return { route, driver, user };
}

async function seedCompleted(
  ds: DataSource,
  driverId: string,
  routeId: number | null,
  completedAtIso: string,
) {
  return ds.getRepository(Booking).save({
    driverId,
    routeId,
    status: 'COMPLETED',
    completedAt: new Date(completedAtIso),
    createdAt: new Date(completedAtIso),
  } as any);
}
```

> Nếu `Booking` có cột NOT NULL khác chưa được seed, spec sẽ báo lỗi rõ tên cột — bổ sung đúng cột đó vào `seedCompleted`, **đừng** đổi cột thành nullable trong entity để test chạy.

- [ ] **Step 3: Chạy integration**

Run: `npm run test:integration -- src/driver-team/driver-team.sql.integration.spec.ts`
Expected: PASS toàn bộ 7 case. Lần đầu mất vài phút vì phải kéo image Postgres.

**Nếu FAIL:** đây chính là mục đích của task này — sửa SQL ở `driver-team.sql.ts` (và unit test tương ứng ở Task 3), **không** sửa kỳ vọng của integration spec để nó xanh.

- [ ] **Step 4: Commit**

```bash
git add src/driver-team/driver-team.sql.integration.spec.ts
git commit -m "test(driver-team): chạy SQL tổng hợp trên Postgres thật

Chứng minh 3 điều mock không chứng minh được: tuyến 0 chuyến vẫn ra kết quả,
tuyến xoá mềm bị loại, và ranh giới ngày VN đúng (chuyến 23:30 ngày 1/8 giờ VN
không rơi sang 31/7).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `DriverTeamService` — đường ghi (detail / patch / event)

**Files:**
- Create: `src/driver-team/driver-team.service.ts`
- Create: `src/driver-team/driver-team.service.spec.ts`
- Create: `src/driver-team/dto/driver-team.dto.ts`

**Interfaces:**
- Consumes: `DriverTeamMember`, `DriverTeamEvent`, `DriverTeamStage`, `DriverTeamEventType` (Task 1); `vnRangeToUtc`.
- Produces:
  - `getDetail(driverId: string, q: { from: string; to: string }): Promise<{ team: DriverTeamMember | null; events: DriverTeamEvent[]; routesRun: { routeId: number | null; name: string | null; trips: number }[]; registeredRouteIds: number[] }>`
  - `patchMember(driverId: string, body: UpdateMemberDto, adminUserId: string): Promise<DriverTeamMember>`
  - `addEvent(driverId: string, body: CreateEventDto, adminUserId: string): Promise<DriverTeamEvent>`
  - `listOwners(): Promise<{ id: string; fullName: string | null; phone: string | null }[]>`

- [ ] **Step 1: Viết DTO**

`src/driver-team/dto/driver-team.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, ValidateIf,
} from 'class-validator';
import { DriverTeamEventType, DriverTeamStage } from '../driver-team.enums';

export class UpdateMemberDto {
  @IsOptional() @IsEnum(DriverTeamStage)
  stage?: DriverTeamStage;

  @IsOptional() @IsArray() @IsInt({ each: true }) @Type(() => Number)
  assignedRouteIds?: number[];

  /** null = gỡ người phụ trách. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID()
  ownerAdminUserId?: string | null;

  /** ISO string, hoặc null để xoá hẹn. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString()
  nextFollowUpAt?: string | null;

  /** Chuỗi rỗng = XOÁ ghi chú (đồng nhất với updateDriverCsStatus). */
  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}

export class CreateEventDto {
  @IsEnum(DriverTeamEventType)
  type: DriverTeamEventType;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}
```

- [ ] **Step 2: Viết test thất bại**

`src/driver-team/driver-team.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DriverTeamService } from './driver-team.service';
import { DriverTeamMember } from './entities/driver-team-member.entity';
import { DriverTeamEvent } from './entities/driver-team-event.entity';
import { DriverTeamEventType, DriverTeamStage } from './driver-team.enums';

const ADMIN = 'admin-uuid';
const DRIVER = 'driver-uuid';

describe('DriverTeamService', () => {
  let service: DriverTeamService;
  let memberRepo: any;
  let eventRepo: any;

  beforeEach(async () => {
    memberRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 'm1', ...x })),
    };
    eventRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 'e1', ...x })),
    };
    const m = await Test.createTestingModule({
      providers: [
        DriverTeamService,
        { provide: getRepositoryToken(DriverTeamMember), useValue: memberRepo },
        { provide: getRepositoryToken(DriverTeamEvent), useValue: eventRepo },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();
    service = m.get(DriverTeamService);
  });

  it('tài chưa có row → PATCH tạo row mới (upsert), ghi người tạo', async () => {
    await service.patchMember(DRIVER, { stage: DriverTeamStage.CONTACTED }, ADMIN);

    expect(memberRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: DRIVER, createdByAdminUserId: ADMIN }),
    );
  });

  it('đổi stage sinh event STAGE_CHANGE có from/to', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.CONTACTED, assignedRouteIds: [],
    });

    await service.patchMember(DRIVER, { stage: DriverTeamStage.INVITED }, ADMIN);

    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DriverTeamEventType.STAGE_CHANGE,
        fromStage: DriverTeamStage.CONTACTED,
        toStage: DriverTeamStage.INVITED,
      }),
    );
  });

  it('gửi lại ĐÚNG stage cũ → KHÔNG sinh event rác', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.INVITED, assignedRouteIds: [],
    });

    await service.patchMember(DRIVER, { stage: DriverTeamStage.INVITED }, ADMIN);

    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('note chuỗi rỗng = XOÁ ghi chú (lưu null)', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.CONTACTED, note: 'cũ', assignedRouteIds: [],
    });

    await service.patchMember(DRIVER, { note: '' }, ADMIN);

    expect(memberRepo.save).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });

  it('field không gửi thì KHÔNG bị ghi đè thành null', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.JOINED,
      note: 'giữ nguyên', ownerAdminUserId: 'owner-1', assignedRouteIds: [7],
    });

    await service.patchMember(DRIVER, { nextFollowUpAt: '2026-08-20T02:00:00.000Z' }, ADMIN);

    expect(memberRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'giữ nguyên', ownerAdminUserId: 'owner-1', assignedRouteIds: [7] }),
    );
  });

  it('đổi người phụ trách sinh event ASSIGN', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.CONTACTED,
      ownerAdminUserId: null, assignedRouteIds: [],
    });

    await service.patchMember(DRIVER, { ownerAdminUserId: 'owner-2' }, ADMIN);

    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: DriverTeamEventType.ASSIGN }),
    );
  });

  it('PATCH trả kèm ownerAdminName — thiếu là cột "Người phụ trách" trống ngay sau khi gán', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.CONTACTED,
      ownerAdminUserId: null, assignedRouteIds: [],
    });
    memberRepo.save.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.CONTACTED,
      ownerAdminUserId: 'owner-2', assignedRouteIds: [],
    });

    const out: any = await service.patchMember(DRIVER, { ownerAdminUserId: 'owner-2' }, ADMIN);

    expect(out).toHaveProperty('ownerAdminName');
  });

  it('listOwners lọc đúng role ADMIN — dropdown người phụ trách không được lộ user thường', async () => {
    const ds = { query: jest.fn().mockResolvedValue([]) };
    const m2 = await Test.createTestingModule({
      providers: [
        DriverTeamService,
        { provide: getRepositoryToken(DriverTeamMember), useValue: memberRepo },
        { provide: getRepositoryToken(DriverTeamEvent), useValue: eventRepo },
        { provide: DataSource, useValue: ds },
      ],
    }).compile();

    await m2.get(DriverTeamService).listOwners();

    expect(ds.query.mock.calls[0][0]).toContain("u.role = 'ADMIN'");
  });

  it('ghi nhận cuộc gọi KHÔNG tự đổi stage', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'm1', driverId: DRIVER, stage: DriverTeamStage.CONTACTED, assignedRouteIds: [],
    });

    await service.addEvent(DRIVER, { type: DriverTeamEventType.CALL, note: 'gọi rồi' }, ADMIN);

    expect(memberRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: DriverTeamEventType.CALL, byAdminUserId: ADMIN }),
    );
  });
});
```

- [ ] **Step 3: Chạy để xác nhận FAIL**

Run: `npx jest src/driver-team/driver-team.service.spec.ts`
Expected: FAIL — `Cannot find module './driver-team.service'`.

- [ ] **Step 4: Viết service**

`src/driver-team/driver-team.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { vnRangeToUtc } from '../common/vn-time.util';
import { CreateEventDto, UpdateMemberDto } from './dto/driver-team.dto';
import { DriverTeamEventType } from './driver-team.enums';
import { DriverTeamEvent } from './entities/driver-team-event.entity';
import { DriverTeamMember } from './entities/driver-team-member.entity';

@Injectable()
export class DriverTeamService {
  constructor(
    @InjectRepository(DriverTeamMember)
    private readonly members: Repository<DriverTeamMember>,
    @InjectRepository(DriverTeamEvent)
    private readonly events: Repository<DriverTeamEvent>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getDetail(driverId: string, q: { from: string; to: string }) {
    const { startUtc, endUtc } = vnRangeToUtc(q.from, q.to);

    const [team, events, routesRun, registered] = await Promise.all([
      this.members.findOne({ where: { driverId } }),
      this.events.find({ where: { driverId }, order: { createdAt: 'DESC' } }),
      this.dataSource.query(
        `SELECT b."routeId" AS "routeId", r.name AS name, COUNT(*)::int AS trips
           FROM "booking" b
           LEFT JOIN "defined_routes" r ON r.id = b."routeId"
          WHERE b.status = 'COMPLETED' AND b."driverId" = $3
            AND b."completedAt" >= $1 AND b."completedAt" <= $2
          GROUP BY b."routeId", r.name
          ORDER BY trips DESC`,
        [startUtc, endUtc, driverId],
      ),
      // M2M driver_routes dùng snake_case — KHÁC quy ước camelCase của bảng khác.
      this.dataSource.query(
        `SELECT route_id AS "routeId" FROM "driver_routes" WHERE driver_id = $1`,
        [driverId],
      ),
    ]);

    return {
      team: await this.withOwnerName(team),
      events,
      routesRun,
      registeredRouteIds: (registered as { routeId: number }[]).map((r) => r.routeId),
    };
  }

  /**
   * Upsert + tự sinh event. Chỉ đụng field CÓ MẶT trong body — field không gửi
   * giữ nguyên, không bị ghi đè null.
   */
  async patchMember(driverId: string, body: UpdateMemberDto, adminUserId: string) {
    const existing = await this.members.findOne({ where: { driverId } });
    const now = new Date();

    const member =
      existing ??
      this.members.create({
        driverId,
        stage: body.stage ?? undefined,
        assignedRouteIds: [],
        createdByAdminUserId: adminUserId,
      });

    const pending: Partial<DriverTeamEvent>[] = [];

    if (body.stage !== undefined && body.stage !== member.stage) {
      pending.push({
        type: DriverTeamEventType.STAGE_CHANGE,
        fromStage: existing ? member.stage : null,
        toStage: body.stage,
      });
      member.stage = body.stage;
      member.stageChangedAt = now;
    }

    if (body.assignedRouteIds !== undefined || body.ownerAdminUserId !== undefined) {
      const routesChanged =
        body.assignedRouteIds !== undefined &&
        JSON.stringify([...body.assignedRouteIds].sort()) !==
          JSON.stringify([...(member.assignedRouteIds ?? [])].sort());
      const ownerChanged =
        body.ownerAdminUserId !== undefined &&
        body.ownerAdminUserId !== (member.ownerAdminUserId ?? null);

      if (routesChanged || ownerChanged) {
        pending.push({ type: DriverTeamEventType.ASSIGN });
      }
      if (body.assignedRouteIds !== undefined) member.assignedRouteIds = body.assignedRouteIds;
      if (body.ownerAdminUserId !== undefined) member.ownerAdminUserId = body.ownerAdminUserId;
    }

    if (body.nextFollowUpAt !== undefined) {
      const next = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
      if ((next?.getTime() ?? null) !== (member.nextFollowUpAt?.getTime() ?? null)) {
        pending.push({ type: DriverTeamEventType.FOLLOW_UP });
      }
      member.nextFollowUpAt = next;
    }

    if (body.note !== undefined) {
      const note = body.note.trim() === '' ? null : body.note;
      if (note !== (member.note ?? null)) {
        pending.push({ type: DriverTeamEventType.NOTE, note });
      }
      member.note = note;
    }

    const saved = await this.members.save(member);

    for (const e of pending) {
      await this.events.save(
        this.events.create({ ...e, driverId, byAdminUserId: adminUserId }),
      );
    }

    return this.withOwnerName(saved);
  }

  /**
   * Bổ sung ownerAdminName. BẮT BUỘC ở mọi đường trả `team` ra ngoài: §5.2 lấy tên
   * qua JOIN, nên nếu PATCH/detail trả entity trần thì FE nhận `team` THIẾU
   * ownerAdminName và cột "Người phụ trách" sẽ trống ngay sau khi vừa gán người —
   * đúng lúc người dùng chờ thấy kết quả.
   */
  private async withOwnerName(member: DriverTeamMember | null) {
    if (!member) return null;
    if (!member.ownerAdminUserId) return { ...member, ownerAdminName: null };
    const rows = await this.dataSource.query(
      `SELECT u."fullName" FROM "user" u WHERE u.id = $1`,
      [member.ownerAdminUserId],
    );
    return { ...member, ownerAdminName: rows[0]?.fullName ?? null };
  }

  /**
   * Admin cho dropdown "người phụ trách". Truy vấn thẳng bảng user thay vì gọi
   * RbacService.listAdminUsers — endpoint kia là SuperOnly, ta cần dữ liệu này
   * hiển thị được cho người chỉ có function 'driver-team'.
   */
  async listOwners(): Promise<{ id: string; fullName: string | null; phone: string | null }[]> {
    return this.dataSource.query(
      `SELECT u.id, u."fullName", u.phone
         FROM "user" u
        WHERE u.role = 'ADMIN'
        ORDER BY u."fullName" ASC NULLS LAST`,
    );
  }

  /** Ghi nhận cuộc gọi / ghi chú thủ công. CỐ Ý không đụng stage. */
  async addEvent(driverId: string, body: CreateEventDto, adminUserId: string) {
    return this.events.save(
      this.events.create({
        driverId,
        type: body.type,
        note: body.note ?? null,
        byAdminUserId: adminUserId,
      }),
    );
  }
}
```

- [ ] **Step 5: Chạy test — PASS**

Run: `npx jest src/driver-team/driver-team.service.spec.ts && npx tsc --noEmit`
Expected: PASS toàn bộ 8 case.

- [ ] **Step 6: Commit**

```bash
git add src/driver-team/driver-team.service.ts src/driver-team/driver-team.service.spec.ts src/driver-team/dto/driver-team.dto.ts
git commit -m "feat(driver-team): đường ghi pipeline — upsert member + tự sinh event

PATCH chỉ đụng field CÓ MẶT trong body: field không gửi giữ nguyên, không bị
ghi đè null. Gửi lại đúng giá trị cũ không sinh event rác. Ghi nhận cuộc gọi
cố ý KHÔNG tự đổi trạng thái — đổi stage là hành động có chủ đích.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Controller + module + wiring

**Files:**
- Create: `src/driver-team/driver-team-admin.controller.ts`
- Create: `src/driver-team/driver-team-admin.controller.spec.ts`
- Create: `src/driver-team/driver-team.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `DriverTeamStatsService` (Task 4, 5), `DriverTeamService` (Task 7), DTO (Task 7).
- Produces: 7 route dưới `admin/driver-team`.

- [ ] **Step 1: Viết test thất bại**

`src/driver-team/driver-team-admin.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DriverTeamAdminController } from './driver-team-admin.controller';
import { DriverTeamService } from './driver-team.service';
import { DriverTeamStatsService } from './driver-team-stats.service';
import { RbacService } from '../rbac/rbac.service';

describe('DriverTeamAdminController', () => {
  let ctrl: DriverTeamAdminController;
  let stats: any;
  let write: any;

  beforeEach(async () => {
    stats = {
      listRoutes: jest.fn().mockResolvedValue({ data: [], unassigned: {}, meta: {} }),
      listRouteDrivers: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      getSummary: jest.fn().mockResolvedValue({}),
    };
    write = {
      getDetail: jest.fn().mockResolvedValue({}),
      patchMember: jest.fn().mockResolvedValue({}),
      addEvent: jest.fn().mockResolvedValue({}),
    };
    const m = await Test.createTestingModule({
      controllers: [DriverTeamAdminController],
      providers: [
        { provide: DriverTeamStatsService, useValue: stats },
        { provide: DriverTeamService, useValue: write },
        // FunctionAccessGuard gắn ở class-level → Nest vẫn khởi tạo guard khi build
        // testing module dù không gọi HTTP, nên RbacService phải resolve được.
        {
          provide: RbacService,
          useValue: {
            isSuperAdmin: jest.fn().mockResolvedValue(true),
            getEffectiveFunctions: jest.fn().mockResolvedValue(new Set()),
          },
        },
      ],
    }).compile();
    ctrl = m.get(DriverTeamAdminController);
  });

  it("param 'none' được giữ nguyên là chuỗi, KHÔNG ép thành NaN", async () => {
    await ctrl.routeDrivers('none', { from: '2026-08-01', to: '2026-08-31' } as any);
    expect(stats.listRouteDrivers).toHaveBeenCalledWith('none', expect.anything());
  });

  it('routeId số được ép sang number', async () => {
    await ctrl.routeDrivers('12', { from: '2026-08-01', to: '2026-08-31' } as any);
    expect(stats.listRouteDrivers).toHaveBeenCalledWith(12, expect.anything());
  });

  it('PATCH lấy adminUserId từ req.user, KHÔNG tin body', async () => {
    await ctrl.patch('driver-1', { stage: 'JOINED' } as any, { user: { id: 'admin-9' } } as any);
    expect(write.patchMember).toHaveBeenCalledWith('driver-1', { stage: 'JOINED' }, 'admin-9');
  });

  it('POST event lấy adminUserId từ req.user', async () => {
    await ctrl.event('driver-1', { type: 'CALL' } as any, { user: { id: 'admin-9' } } as any);
    expect(write.addEvent).toHaveBeenCalledWith('driver-1', { type: 'CALL' }, 'admin-9');
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx jest src/driver-team/driver-team-admin.controller.spec.ts`
Expected: FAIL — `Cannot find module './driver-team-admin.controller'`.

- [ ] **Step 3: Viết controller**

`src/driver-team/driver-team-admin.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FunctionAccessGuard } from '../rbac/function-access.guard';
import { RequireFunction } from '../rbac/require-function.decorator';
import { UserRole } from '../users/user.entity';
import { CreateEventDto, UpdateMemberDto } from './dto/driver-team.dto';
import { DriverTeamService } from './driver-team.service';
import { DriverTeamStatsService, RouteDriversQuery } from './driver-team-stats.service';

@Controller('admin/driver-team')
@UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)
@Roles(UserRole.ADMIN)
@RequireFunction('driver-team')
export class DriverTeamAdminController {
  constructor(
    private readonly stats: DriverTeamStatsService,
    private readonly team: DriverTeamService,
  ) {}

  @Get('summary')
  summary(@Query() q: { from: string; to: string }) {
    return this.stats.getSummary(q);
  }

  @Get('routes')
  routes(@Query() q: { from: string; to: string; sort?: string; order?: string }) {
    return this.stats.listRoutes(q);
  }

  /**
   * Danh sách admin cho dropdown "người phụ trách".
   * KHÔNG để FE gọi GET /admin/users — route đó gắn SuperOnlyGuard
   * (rbac-admin.controller.ts:101), nên tài khoản chỉ có function 'driver-team'
   * sẽ nhận 403 và dropdown hỏng đúng với người được giao chăm team.
   */
  @Get('owners')
  owners() {
    return this.team.listOwners();
  }

  @Get('routes/:routeId/drivers')
  routeDrivers(@Param('routeId') routeId: string, @Query() q: RouteDriversQuery) {
    // 'none' = nhóm booking không gắn tuyến. Giữ NGUYÊN chuỗi — Number('none') là NaN
    // và sẽ âm thầm khớp 0 tuyến thay vì khớp nhóm không-tuyến.
    const id = routeId === 'none' ? 'none' : Number(routeId);
    return this.stats.listRouteDrivers(id, q);
  }

  @Get(':driverId')
  detail(@Param('driverId') driverId: string, @Query() q: { from: string; to: string }) {
    return this.team.getDetail(driverId, q);
  }

  @Patch(':driverId')
  patch(@Param('driverId') driverId: string, @Body() body: UpdateMemberDto, @Req() req: any) {
    return this.team.patchMember(driverId, body, req.user.id);
  }

  @Post(':driverId/events')
  event(@Param('driverId') driverId: string, @Body() body: CreateEventDto, @Req() req: any) {
    return this.team.addEvent(driverId, body, req.user.id);
  }
}
```

> **Thứ tự route quan trọng:** `@Get('summary')`, `@Get('routes')`, `@Get('owners')` phải khai **TRƯỚC** `@Get(':driverId')`, nếu không Nest sẽ khớp `/summary` vào `:driverId` và trả rác thay vì báo lỗi.

- [ ] **Step 4: Viết module**

`src/driver-team/driver-team.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { DriverTeamAdminController } from './driver-team-admin.controller';
import { DriverTeamService } from './driver-team.service';
import { DriverTeamStatsService } from './driver-team-stats.service';
import { DriverTeamEvent } from './entities/driver-team-event.entity';
import { DriverTeamMember } from './entities/driver-team-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DriverTeamMember, DriverTeamEvent]), RbacModule],
  controllers: [DriverTeamAdminController],
  providers: [DriverTeamService, DriverTeamStatsService],
})
export class DriverTeamModule {}
```

- [ ] **Step 5: Đăng ký vào `app.module.ts`**

Thêm import `import { DriverTeamModule } from './driver-team/driver-team.module';` và thêm `DriverTeamModule` vào mảng `imports` của `AppModule` (đặt cạnh `DriverReputationModule` cho dễ tìm).

- [ ] **Step 6: Chạy test + lưới an toàn RBAC**

Run: `npx jest src/driver-team src/rbac && npx tsc --noEmit`
Expected: PASS — đặc biệt `src/rbac/route-coverage.spec.ts` phải xanh. Spec này quét tĩnh mọi controller; nếu nó fail thì controller đang thiếu `@RequireFunction` hoặc thiếu `FunctionAccessGuard` trong guard chain.

- [ ] **Step 7: Chạy toàn bộ test + smoke thật**

Run: `npx jest && npx tsc --noEmit`
Expected: toàn bộ xanh.

Smoke bằng tay (server local đang chạy, token admin có function `driver-team`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/admin/driver-team/routes?from=2026-08-01&to=2026-08-10" | head -40
```

Expected: JSON có `data` (mảng tuyến, **gồm cả tuyến 0 chuyến**) và `unassigned`.

Kiểm quyền: dùng token admin **không** có function `driver-team` → phải trả lỗi `AUTH_003`.

- [ ] **Step 8: Commit**

```bash
git add src/driver-team/driver-team-admin.controller.ts src/driver-team/driver-team-admin.controller.spec.ts src/driver-team/driver-team.module.ts src/app.module.ts
git commit -m "feat(driver-team): 7 endpoint admin + guard chain riêng

Guard chain copy nguyên driver-reputation-admin.controller.ts, RequireFunction
('driver-team') ở mức class → route-coverage.spec.ts tự phủ. routeId 'none'
giữ nguyên chuỗi: Number('none') là NaN và sẽ âm thầm khớp 0 tuyến thay vì
khớp nhóm không-gắn-tuyến.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Sau khi xong 8 task

1. **Cấp quyền thủ công:** vào `/roles` trên admin, tạo (hoặc sửa) role cho CEO + người được giao chăm team, tick function **"Đội tài chuyên nghiệp"**. **KHÔNG** gán vào role Vận hành / CSKH — cấp rộng là phá đúng mục tiêu riêng tư của quyết định D4 trong spec.
2. **Deploy prod BE trước FE** (runbook: memory `vigo-backend-deploy-runbook`). Migration index `CONCURRENTLY` chạy trên bảng `booking` prod — theo dõi log, và kiểm `indisvalid = true` sau khi xong (Task 2 Step 5).
3. Chỉ khi BE prod đã xanh mới bắt đầu `2026-08-10-driver-team-admin.md`.
