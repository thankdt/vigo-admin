# Driver Note Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi chú tài xế (`driver.csNote`) chuyển sang chọn từ danh mục có sẵn; người có quyền `driver-note-presets` mới thêm/đổi tên/xoá mục.

**Architecture:** Backend thêm bảng `driver_note_preset` + `DriverNotePresetService` (list/create/rename/delete + `resolveCsNote` chặn chuỗi lạ), 4 endpoint mới, và gắn `resolveCsNote` vào `PATCH cs-status` ở controller (KHÔNG đổi constructor `DriversService`). Admin thêm client API, component `DriverNoteSelect` + dialog quản lý, thay ô nhập ở danh sách và dialog chi tiết `/drivers`.

**Tech Stack:** NestJS + TypeORM + Postgres (jest), Next.js 15/React 19 + vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-driver-note-presets-design.md` (vigo-admin).

**Repos / nhánh (merge 1 thể, backend deploy TRƯỚC):**
- backend `/Volumes/exSSD/dev/projects/vigo-backend` nhánh `feat/booking-driver-cs-note`
- admin `/Volumes/exSSD/dev/projects/vigo-admin` nhánh `fix/driver-cs-note-ui`

## Global Constraints

- Máy dev 8GB RAM: KHÔNG chạy `npm test` / full jest / `next build`. Chỉ `npx tsc --noEmit` + từng file spec (`TZ=UTC npx jest <file> --runInBand`; admin `npx vitest run <file>`). Test đầy đủ do Jenkins DEV chạy.
- Backend jest bắt buộc `TZ=UTC`.
- `csNote` giữ là chuỗi (varchar/text) = nhãn mục đã chọn; KHÔNG đổi cột `driver`; `PATCH /drivers/admin/:id/cs-status` giữ nguyên hợp đồng request/response.
- Nhãn mục: trim, 1–100 ký tự, duy nhất KHÔNG phân biệt hoa thường.
- Không đụng bảng `driver_customer_call_event` / nút "Ghi nhận" / `driver-detail-dialog.tsx`.
- Chuỗi hiển thị bằng tiếng Việt; commit message kết bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Quyền chặn ở BACKEND (service/controller), UI chỉ ẩn nút. Mã lỗi dùng sẵn: `AUTH_003` (không quyền), `VAL_001` (nhãn sai), `RES_001` (không thấy), `RES_004` (xung đột), message ghi đè qua tham số thứ 2 của `AppException`.
- Admin: `useAuth().can(key)` từ `@/lib/auth-context`; key phải có ở cả BE `MENU_FUNCTIONS` và FE `SPECIAL_FUNCTIONS`.

## Review Focus

- Người KHÔNG quyền gửi `csNote` lạ (kể cả khác hoa/thường một mục có sẵn, hoặc có khoảng trắng đầu/cuối) → 403; khác hoa/thường mục có sẵn thì được và lưu đúng nhãn chuẩn của mục.
- Người không quyền sửa tài xế đang mang ghi chú cũ ngoài danh mục (vd `jjj`) và gửi lại chính giá trị đó (hoặc chỉ đổi `csCalled`, không gửi `csNote`) → KHÔNG bị chặn.
- Xoá mục đang có tài xế dùng → 409 và KHÔNG xoá; đổi tên mục thành nhãn trùng mục khác (khác hoa/thường) → 409; đổi tên cập nhật cả `driver.csNote` đang dùng nhãn cũ.
- Hai người cùng "thêm mới" một nhãn → chỉ một hàng (idempotent, trả mục có sẵn); nhãn rỗng/toàn khoảng trắng/>100 ký tự → 400.
- Dropdown ở danh sách nhiều hàng chỉ tải danh mục 1 lần (cache), không N request; ghi chú hiện tại ngoài danh mục hiện "(tự nhập) …" chứ không biến mất.

## File Structure

Backend (`vigo-backend`):
- Create `src/drivers/entities/driver-note-preset.entity.ts` — entity bảng `driver_note_preset`.
- Create `src/database/migrations/1797400000000-CreateDriverNotePreset.ts` — bảng + unique index + seed 3 mục.
- Create `src/drivers/driver-note-preset.service.ts` — logic danh mục + `resolveCsNote`.
- Create `src/drivers/driver-note-preset.service.spec.ts`.
- Create `src/drivers/dto/driver-note-preset.dto.ts` — `DriverNotePresetLabelDto`.
- Modify `src/rbac/rbac.constants.ts`, `src/rbac/rbac.constants.spec.ts` — thêm key `driver-note-presets`.
- Modify `src/drivers/drivers.module.ts` — đăng ký entity + service.
- Modify `src/drivers/drivers.controller.ts` — 4 endpoint + gắn `resolveCsNote`.
- Create `src/drivers/drivers.controller.note-presets.spec.ts`.

Admin (`vigo-admin`):
- Modify `src/lib/rbac.ts` (+ `src/lib/function-catalog.test.ts` nếu đếm số) — `SPECIAL_FUNCTIONS`.
- Modify `src/lib/api.ts` — 4 client; Create `src/lib/api-driver-note-presets.test.ts`.
- Create `src/app/(app)/drivers/components/driver-note-select.tsx` — hook cache + `buildNoteOptions` + `DriverNoteSelect`.
- Create `src/app/(app)/drivers/components/driver-note-manage-dialog.tsx`.
- Create `src/app/(app)/drivers/components/driver-note-select.test.tsx`, `driver-note-manage-dialog.test.tsx`.
- Modify `src/app/(app)/drivers/components/drivers-table.tsx` — dùng `DriverNoteSelect`, bỏ inline edit + `DriverCsNoteEditor`.
- Delete `src/app/(app)/drivers/components/driver-cs-note-editor.test.tsx`.

---

## Phần A — Backend

### Task A1: Quyền `driver-note-presets` (BE)

**Files:**
- Modify: `vigo-backend/src/rbac/rbac.constants.ts` (mảng `MENU_FUNCTIONS`, sau `'loyalty-adjust'`)
- Test: `vigo-backend/src/rbac/rbac.constants.spec.ts`

**Interfaces:** Produces: key chuỗi `'driver-note-presets'` trong `MENU_FUNCTIONS`/`ALL_FUNCTION_KEYS`.

- [ ] **Step 1: Failing test** — thêm vào `describe` hiện có trong `rbac.constants.spec.ts`:

```ts
  it('có function driver-note-presets (quản lý danh mục ghi chú tài xế)', () => {
    expect(MENU_FUNCTIONS).toContain('driver-note-presets');
    expect(ALL_FUNCTION_KEYS).toContain('driver-note-presets');
  });
```

- [ ] **Step 2: Run** `cd /Volumes/exSSD/dev/projects/vigo-backend && TZ=UTC npx jest src/rbac/rbac.constants.spec.ts --runInBand` → FAIL.

- [ ] **Step 3: Implement** — trong `rbac.constants.ts`, ngay trước `] as const;` của `MENU_FUNCTIONS` (sau `'loyalty-adjust',`):

```ts
  // 2026-10-12: thêm/đổi tên/xoá mục trong danh mục "ghi chú tài xế" (driver.csNote). Quyền
  // RIÊNG, không gộp 'drivers': ai xem/sửa tài xế chỉ được CHỌN mục có sẵn. Không cấp mặc định
  // cho role nào.
  'driver-note-presets',
```

- [ ] **Step 4: Run** lại spec rbac.constants + `TZ=UTC npx jest src/rbac/route-coverage.spec.ts --runInBand` → PASS. Nếu spec nào đếm cứng số function (grep `toHaveLength` trong `src/rbac/*.spec.ts`) thì tăng +1.

- [ ] **Step 5: Commit** `git add src/rbac && git commit -m "feat(rbac): thêm function driver-note-presets"`.

### Task A2: Entity + migration + seed

**Files:**
- Create: `src/drivers/entities/driver-note-preset.entity.ts`
- Create: `src/database/migrations/1797400000000-CreateDriverNotePreset.ts` (trước đó `ls src/database/migrations | tail -3`; nếu đã có timestamp lớn hơn thì dùng số kế tiếp, đổi cả tên class/`name`)
- Test: `src/database/migrations/__tests__/` — xem mẫu spec migration có sẵn; nếu không có mẫu cho migration kiểu này thì chỉ kiểm bằng tsc.

**Interfaces:** Produces: `DriverNotePreset { id: string; label: string; sortOrder: number; createdAt: Date; createdByUserId: string | null }`.

- [ ] **Step 1: Entity**

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Danh mục "ghi chú tài xế" (spec 2026-10-12). `driver.csNote` lưu CHUỖI = `label` của mục đã
 * chọn (không FK) nên đổi tên mục phải cập nhật cả `driver.csNote` (xem DriverNotePresetService).
 * Unique không phân biệt hoa thường do index `UQ_driver_note_preset_label_lower` (migration).
 */
@Entity('driver_note_preset')
export class DriverNotePreset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;
}
```

- [ ] **Step 2: Migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverNotePreset1797400000000 implements MigrationInterface {
  name = 'CreateDriverNotePreset1797400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_note_preset" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "label" character varying(100) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdByUserId" uuid,
        CONSTRAINT "PK_driver_note_preset" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_driver_note_preset_label_lower"
      ON "driver_note_preset" (lower("label"))
    `);
    await queryRunner.query(`
      INSERT INTO "driver_note_preset" ("label", "sortOrder") VALUES
        ('Chuyên chạy ghép', 10),
        ('Chưa chạy ghép bao giờ', 20),
        ('Bắt đầu tìm hiểu và đã chạy ghép', 30)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_driver_note_preset_label_lower"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "driver_note_preset"`);
  }
}
```

Kiểm tra: `grep -rn "uuid_generate_v4\|gen_random_uuid" src/database/migrations | head -3` và dùng đúng hàm mà các migration gần đây dùng (đổi trong SQL trên nếu khác).

- [ ] **Step 3:** `npx tsc --noEmit` → sạch.
- [ ] **Step 4: Commit** `git add src/drivers/entities/driver-note-preset.entity.ts src/database/migrations/1797400000000-CreateDriverNotePreset.ts && git commit -m "feat(drivers): bảng driver_note_preset + seed 3 mục"`.

### Task A3: `DriverNotePresetService`

**Files:**
- Create: `src/drivers/driver-note-preset.service.ts`
- Create: `src/drivers/dto/driver-note-preset.dto.ts`
- Test: `src/drivers/driver-note-preset.service.spec.ts`

**Interfaces:**
- Consumes: `DriverNotePreset` (A2), `RbacService.isSuperAdmin(userId): Promise<boolean>`, `RbacService.getEffectiveFunctions(userId): Promise<Set<string>>`, `AppException(code, message?, details?)`.
- Produces:
  - `class DriverNotePresetService { constructor(repo: Repository<DriverNotePreset>, dataSource: DataSource, rbac: RbacService) }`
  - `list(): Promise<DriverNotePreset[]>`
  - `create(label: string, userId: string): Promise<DriverNotePreset>` (idempotent theo nhãn không phân biệt hoa thường)
  - `rename(id: string, label: string): Promise<DriverNotePreset>`
  - `remove(id: string): Promise<{ deleted: true }>`
  - `canManage(userId: string): Promise<boolean>`
  - `resolveCsNote(driverId: string, userId: string, raw: string | undefined): Promise<string | undefined>` — `undefined` = không đụng; `''` = xoá; còn lại = chuỗi đã chuẩn hoá để ghi.
  - helper export `normalizePresetLabel(raw: string): string` (trim + gộp khoảng trắng liên tiếp; ném `AppException('VAL_001')` nếu rỗng hoặc >100).

DTO:

```ts
import { IsString, MaxLength } from 'class-validator';

export class DriverNotePresetLabelDto {
  @IsString()
  @MaxLength(100)
  label: string;
}
```

- [ ] **Step 1: Failing tests** (`driver-note-preset.service.spec.ts`). Dùng fake in-memory: `repo` có `find`, `findOne`, `create`, `save`, `createQueryBuilder`; `dataSource.transaction(cb)` gọi `cb(manager)`; `manager` có `findOne`, `save`, `query`, `delete`. Test bắt buộc (mỗi cái 1 `it`):

```ts
describe('normalizePresetLabel', () => {
  it('trim + gộp khoảng trắng', () => expect(normalizePresetLabel('  Chạy   ghép ')).toBe('Chạy ghép'));
  it('rỗng → VAL_001', () => expect(() => normalizePresetLabel('   ')).toThrow());
  it('>100 ký tự → VAL_001', () => expect(() => normalizePresetLabel('a'.repeat(101))).toThrow());
});

describe('DriverNotePresetService.resolveCsNote', () => {
  // build({ presets:[{id,label}], current:'jjj'|null, manage:true|false })
  it('undefined → undefined (không đụng csNote)');
  it("'   ' → '' (xoá, luôn cho kể cả không quyền)");
  it('bằng giá trị hiện tại (ngoài danh mục) → trả về giá trị đó, không quyền vẫn qua');
  it('khớp mục có sẵn khác hoa/thường → trả nhãn chuẩn của mục');
  it('chuỗi lạ + không quyền → throw AUTH_003');
  it('chuỗi lạ + có quyền → tạo mục mới và trả nhãn');
});

describe('DriverNotePresetService.create', () => {
  it('trùng nhãn (khác hoa/thường) → trả mục có sẵn, không insert');
  it('gặp unique violation (23505) khi insert → đọc lại và trả mục đã có');
});

describe('DriverNotePresetService.rename', () => {
  it('đổi tên → UPDATE driver SET csNote mới WHERE csNote cũ, trong transaction');
  it('trùng mục khác → throw RES_004, không UPDATE');
  it('không thấy id → throw RES_001');
  it('nhãn không đổi → no-op, không UPDATE');
});

describe('DriverNotePresetService.remove', () => {
  it('có tài xế dùng → throw RES_004 kèm số tài xế trong message, không delete');
  it('không ai dùng → delete và trả { deleted: true }');
});
```

Viết đầy đủ thân test với fake như mô tả (không để `it` rỗng); tham khảo cấu trúc fake trong `drivers.service.cs-status.spec.ts`.

- [ ] **Step 2: Run** `TZ=UTC npx jest src/drivers/driver-note-preset.service.spec.ts --runInBand` → FAIL (module chưa có).

- [ ] **Step 3: Implement** `driver-note-preset.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DriverNotePreset } from './entities/driver-note-preset.entity';
import { RbacService } from '../rbac/rbac.service';
import { AppException } from '../common/exceptions/app.exception';

export const DRIVER_NOTE_PRESETS_FUNCTION = 'driver-note-presets';
const MAX_LABEL = 100;

export function normalizePresetLabel(raw: string): string {
  const label = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (label.length === 0) throw new AppException('VAL_001', 'Nội dung ghi chú không được để trống.');
  if (label.length > MAX_LABEL)
    throw new AppException('VAL_001', `Ghi chú tối đa ${MAX_LABEL} ký tự.`);
  return label;
}

@Injectable()
export class DriverNotePresetService {
  constructor(
    @InjectRepository(DriverNotePreset)
    private readonly repo: Repository<DriverNotePreset>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rbac: RbacService,
  ) {}

  list(): Promise<DriverNotePreset[]> {
    return this.repo.find({ order: { sortOrder: 'ASC', label: 'ASC' } });
  }

  async canManage(userId: string): Promise<boolean> {
    if (await this.rbac.isSuperAdmin(userId)) return true;
    const fns = await this.rbac.getEffectiveFunctions(userId);
    return fns.has(DRIVER_NOTE_PRESETS_FUNCTION);
  }

  private findByLabel(label: string): Promise<DriverNotePreset | null> {
    return this.repo
      .createQueryBuilder('p')
      .where('lower(p.label) = lower(:label)', { label })
      .getOne();
  }

  async create(rawLabel: string, userId: string): Promise<DriverNotePreset> {
    const label = normalizePresetLabel(rawLabel);
    const existing = await this.findByLabel(label);
    if (existing) return existing;
    try {
      return await this.repo.save(
        this.repo.create({ label, sortOrder: 100, createdByUserId: userId }),
      );
    } catch (err: any) {
      // Hai người thêm cùng nhãn một lúc: index unique chặn bản thứ hai → trả bản đã có.
      if (err?.code === '23505') {
        const again = await this.findByLabel(label);
        if (again) return again;
      }
      throw err;
    }
  }

  async rename(id: string, rawLabel: string): Promise<DriverNotePreset> {
    const label = normalizePresetLabel(rawLabel);
    return this.dataSource.transaction(async (manager) => {
      const preset = await manager.findOne(DriverNotePreset, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!preset) throw new AppException('RES_001', 'Không tìm thấy ghi chú.');
      if (preset.label === label) return preset;
      const clash: Array<{ id: string }> = await manager.query(
        `SELECT "id" FROM "driver_note_preset" WHERE lower("label") = lower($1) AND "id" <> $2 LIMIT 1`,
        [label, id],
      );
      if (clash.length > 0) throw new AppException('RES_004', 'Đã có ghi chú trùng tên này.');
      const old = preset.label;
      // csNote lưu chuỗi (không FK) → đổi tên phải kéo theo tài xế đang dùng nhãn cũ.
      await manager.query(`UPDATE "driver" SET "csNote" = $1 WHERE "csNote" = $2`, [label, old]);
      preset.label = label;
      return manager.save(preset);
    });
  }

  async remove(id: string): Promise<{ deleted: true }> {
    return this.dataSource.transaction(async (manager) => {
      const preset = await manager.findOne(DriverNotePreset, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!preset) throw new AppException('RES_001', 'Không tìm thấy ghi chú.');
      const rows: Array<{ n: number }> = await manager.query(
        `SELECT COUNT(*)::int AS n FROM "driver" WHERE "csNote" = $1`,
        [preset.label],
      );
      const used = Number(rows[0]?.n ?? 0);
      if (used > 0) {
        throw new AppException(
          'RES_004',
          `Đang có ${used} tài xế dùng ghi chú này nên không xoá được. Hãy đổi tên thay vì xoá.`,
          { usedBy: used },
        );
      }
      await manager.delete(DriverNotePreset, { id });
      return { deleted: true as const };
    });
  }

  /**
   * Chuẩn hoá `csNote` client gửi lên PATCH cs-status. undefined = không đụng; '' = xoá.
   * Người KHÔNG có quyền chỉ được: xoá, giữ nguyên giá trị hiện tại (kể cả ghi chú cũ ngoài
   * danh mục), hoặc chọn mục có sẵn. Người có quyền gõ chuỗi mới → tự thêm vào danh mục.
   */
  async resolveCsNote(
    driverId: string,
    userId: string,
    raw: string | undefined,
  ): Promise<string | undefined> {
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return '';

    const rows: Array<{ csNote: string | null }> = await this.dataSource.query(
      `SELECT "csNote" FROM "driver" WHERE "id" = $1`,
      [driverId],
    );
    const current = rows[0]?.csNote?.trim();
    if (current && current === trimmed) return current;

    const label = normalizePresetLabel(trimmed);
    const hit = await this.findByLabel(label);
    if (hit) return hit.label;

    if (!(await this.canManage(userId))) {
      throw new AppException('AUTH_003', 'Bạn chỉ được chọn ghi chú có sẵn trong danh sách.');
    }
    return (await this.create(label, userId)).label;
  }
}
```

Lưu ý: spec fake phải khớp các lời gọi trên (`createQueryBuilder().where().getOne()`, `dataSource.query`, `manager.query`, `manager.findOne`, `manager.save`, `manager.delete`). Nếu đổi cách gọi thì sửa test cùng lúc, đừng nới lỏng assertion.

- [ ] **Step 4: Run** spec → PASS; `npx tsc --noEmit` → sạch.
- [ ] **Step 5: Commit** `git add src/drivers/driver-note-preset.service.ts src/drivers/driver-note-preset.service.spec.ts src/drivers/dto/driver-note-preset.dto.ts && git commit -m "feat(drivers): DriverNotePresetService (danh mục + chặn ghi chú lạ)"`.

### Task A4: Module + controller

**Files:**
- Modify: `src/drivers/drivers.module.ts` (thêm `DriverNotePreset` vào `TypeOrmModule.forFeature([...])`, thêm `DriverNotePresetService` vào `providers`)
- Modify: `src/drivers/drivers.controller.ts`
- Test: `src/drivers/drivers.controller.note-presets.spec.ts`

**Interfaces:**
- Consumes: `DriverNotePresetService` (A3).
- Produces: HTTP — `GET /drivers/admin/note-presets` → `DriverNotePreset[]`; `POST` body `{label}` → `DriverNotePreset`; `PATCH /drivers/admin/note-presets/:id` body `{label}` → `DriverNotePreset`; `DELETE /drivers/admin/note-presets/:id` → `{ deleted: true }`. `PATCH admin/:id/cs-status` gọi `resolveCsNote` trước `adminUpdateCsStatus`.

- [ ] **Step 1: Failing test** — dựng controller trực tiếp `new DriversController(driversService as any, {} as any, {} as any, notePresets as any)` và kiểm:
  - `adminUpdateDriverCsStatus` gọi `notePresets.resolveCsNote(id, req.user.id, body.csNote)` rồi `driversService.adminUpdateCsStatus(id, userId, { ...body, csNote: <đã resolve> })`; khi `resolveCsNote` trả `undefined` thì body truyền xuống KHÔNG có key `csNote` (`'csNote' in arg` là false) — để không ghi đè.
  - `resolveCsNote` ném → `adminUpdateCsStatus` KHÔNG được gọi.
  - 4 handler preset gọi đúng method service (`list`, `create(label, req.user.id)`, `rename(id,label)`, `remove(id)`).
  - Metadata: `Reflect.getMetadata(REQUIRE_FUNCTION_KEY, DriversController.prototype.listNotePresets)` = `['drivers']`; của create/rename/remove = `['driver-note-presets']`.

- [ ] **Step 2: Run** `TZ=UTC npx jest src/drivers/drivers.controller.note-presets.spec.ts --runInBand` → FAIL.

- [ ] **Step 3: Implement.**
Constructor controller thêm tham số CUỐI:

```ts
    private readonly notePresets: DriverNotePresetService,
```

(và `import { DriverNotePresetService } from './driver-note-preset.service'; import { DriverNotePresetLabelDto } from './dto/driver-note-preset.dto';` + `Delete` trong import `@nestjs/common` nếu chưa có.)

Thay handler cs-status:

```ts
  adminUpdateDriverCsStatus(...) -> async adminUpdateDriverCsStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: UpdateDriverCsStatusDto,
  ) {
    // csNote chỉ được là mục có sẵn / giữ nguyên / xoá, trừ người có quyền driver-note-presets.
    const csNote = await this.notePresets.resolveCsNote(id, req.user.id, body.csNote);
    const { csNote: _omit, ...rest } = body;
    return this.driversService.adminUpdateCsStatus(
      id,
      req.user.id,
      csNote === undefined ? rest : { ...rest, csNote },
    );
  }
```

Thêm 4 route, đặt NGAY TRƯỚC handler cs-status (route literal `admin/note-presets` không đụng `admin/:id/...`):

```ts
  @UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)
  @Roles(UserRole.ADMIN)
  @RequireFunction('drivers')
  @Get('admin/note-presets')
  listNotePresets() {
    return this.notePresets.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)
  @Roles(UserRole.ADMIN)
  @RequireFunction('driver-note-presets')
  @Post('admin/note-presets')
  createNotePreset(@Request() req, @Body() body: DriverNotePresetLabelDto) {
    return this.notePresets.create(body.label, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)
  @Roles(UserRole.ADMIN)
  @RequireFunction('driver-note-presets')
  @Patch('admin/note-presets/:id')
  renameNotePreset(@Param('id') id: string, @Body() body: DriverNotePresetLabelDto) {
    return this.notePresets.rename(id, body.label);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)
  @Roles(UserRole.ADMIN)
  @RequireFunction('driver-note-presets')
  @Delete('admin/note-presets/:id')
  deleteNotePreset(@Param('id') id: string) {
    return this.notePresets.remove(id);
  }
```

Kiểm tra: `grep -n "ParseUUIDPipe" src/drivers/drivers.controller.ts` — nếu các route `:id` khác dùng pipe này thì dùng cho `:id` ở đây để id rác trả 400 thay vì lỗi DB.

- [ ] **Step 4: Run** controller spec + `TZ=UTC npx jest src/rbac/route-coverage.spec.ts src/drivers/drivers.service.cs-status.spec.ts --runInBand` → PASS; `npx tsc --noEmit` sạch. Nếu spec khác dựng `new DriversController(...)` hay `Test.createTestingModule({controllers:[DriversController]})` bị vỡ vì tham số mới: `grep -rn "DriversController" src --include=*.spec.ts` và bổ sung provider/đối số.
- [ ] **Step 5: Commit** `git add src/drivers && git commit -m "feat(drivers): endpoint danh mục ghi chú tài xế + chặn csNote lạ ở cs-status"`.

---

## Phần B — Admin

### Task B1: Quyền ở FE + client API

**Files:**
- Modify: `src/lib/rbac.ts` (`SPECIAL_FUNCTIONS`)
- Modify: `src/lib/api.ts` (thêm cuối khối driver/cs, cạnh `updateDriverCsStatus` ~dòng 433)
- Test: `src/lib/api-driver-note-presets.test.ts`; kiểm `src/lib/function-catalog.test.ts`, `src/lib/rbac*.test.ts`

**Interfaces — Produces:**

```ts
export type DriverNotePreset = { id: string; label: string; sortOrder: number };
export async function getDriverNotePresets(): Promise<DriverNotePreset[]>;
export async function createDriverNotePreset(label: string): Promise<DriverNotePreset>;
export async function renameDriverNotePreset(id: string, label: string): Promise<DriverNotePreset>;
export async function deleteDriverNotePreset(id: string): Promise<void>;
```

- [ ] **Step 1: Failing test** — theo mẫu `src/lib/api-driver-reputation-list.test.ts` (mock `fetch`/`fetchWithAuth` giống file đó): kiểm đúng URL `${API_BASE_URL}/drivers/admin/note-presets`, method (`POST`/`PATCH`/`DELETE`), body `{label}`, và gỡ envelope `result.data || result`.
- [ ] **Step 2: Run** `npx vitest run src/lib/api-driver-note-presets.test.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
// ── Danh mục ghi chú tài xế (spec 2026-10-12). Đọc: quyền `drivers`; thêm/đổi tên/xoá: quyền
// RIÊNG `driver-note-presets`. Xoá mục đang có tài xế dùng → 409 (message tiếng Việt từ BE).
export type DriverNotePreset = { id: string; label: string; sortOrder: number };

export async function getDriverNotePresets(): Promise<DriverNotePreset[]> {
  const response = await fetchWithAuth('/drivers/admin/note-presets');
  const result = await response.json();
  return result.data || result;
}

export async function createDriverNotePreset(label: string): Promise<DriverNotePreset> {
  const response = await fetchWithAuth('/drivers/admin/note-presets', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
  const result = await response.json();
  return result.data || result;
}

export async function renameDriverNotePreset(id: string, label: string): Promise<DriverNotePreset> {
  const response = await fetchWithAuth(`/drivers/admin/note-presets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ label }),
  });
  const result = await response.json();
  return result.data || result;
}

export async function deleteDriverNotePreset(id: string): Promise<void> {
  await fetchWithAuth(`/drivers/admin/note-presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
```

`src/lib/rbac.ts` — thêm vào `SPECIAL_FUNCTIONS`:

```ts
  {
    key: 'driver-note-presets',
    label: 'Quản lý danh sách ghi chú tài xế (thêm / đổi tên / xoá mục)',
  },
```

- [ ] **Step 4: Run** test mới + `npx vitest run src/lib/function-catalog.test.ts src/lib/api-rbac.test.ts` → PASS (nếu test đếm cứng số special function thì +1; nếu có test đối chiếu BE thì cập nhật cùng). `npm run typecheck` sạch.
- [ ] **Step 5: Commit** `git add src/lib && git commit -m "feat(drivers): client API danh mục ghi chú + khai báo quyền driver-note-presets"`.

### Task B2: `DriverNoteSelect` + dialog quản lý

**Files:**
- Create: `src/app/(app)/drivers/components/driver-note-select.tsx`
- Create: `src/app/(app)/drivers/components/driver-note-manage-dialog.tsx`
- Test: `driver-note-select.test.tsx`, `driver-note-manage-dialog.test.tsx` (cùng thư mục)

**Interfaces:**
- Consumes: B1 (`getDriverNotePresets`, `createDriverNotePreset`, `renameDriverNotePreset`, `deleteDriverNotePreset`, `DriverNotePreset`), `useAuth().can`.
- Produces:
  - `buildNoteOptions(presets: DriverNotePreset[], value: string | null): { label: string; value: string; legacy: boolean }[]` — các mục có sẵn theo thứ tự; nếu `value` khác rỗng và KHÔNG thuộc `presets` (so khớp chính xác) thì thêm 1 mục đầu danh sách `{ label: '(tự nhập) ' + value, value, legacy: true }`.
  - `loadDriverNotePresets(force?: boolean): Promise<DriverNotePreset[]>` — cache module-level 1 promise; lỗi thì xoá cache để lần sau thử lại.
  - `<DriverNoteSelect value: string | null; onChange: (note: string | null) => Promise<void> | void; disabled?: boolean; className?: string />`
  - `<DriverNoteManageDialog open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void />`

- [ ] **Step 1: Failing tests**
  - `buildNoteOptions`: (a) value thuộc danh mục → không thêm legacy; (b) value `jjj` ngoài danh mục → mục đầu `{label:'(tự nhập) jjj', value:'jjj', legacy:true}`; (c) value null/'' → không legacy.
  - `loadDriverNotePresets`: gọi 2 lần chỉ 1 request (mock `getDriverNotePresets`); `force=true` gọi lại; request lỗi → lần sau gọi lại được.
  - `DriverNoteManageDialog` (mock api + `useToast`): hiển thị các mục; bấm Xoá mục → `deleteDriverNotePreset(id)` và mục biến mất; delete reject với `Error('Đang có 2 tài xế…')` → toast destructive chứa message, mục vẫn còn; sửa tên rồi Lưu → `renameDriverNotePreset(id, 'Tên mới')`; thêm mục mới → `createDriverNotePreset('X')`.
- [ ] **Step 2: Run** → FAIL (module chưa có).
- [ ] **Step 3: Implement** — `driver-note-select.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { createDriverNotePreset, getDriverNotePresets, type DriverNotePreset } from '@/lib/api';
import { DriverNoteManageDialog } from './driver-note-manage-dialog';

const NONE = '__none__';
const ADD = '__add__';
const MANAGE = '__manage__';

let cache: Promise<DriverNotePreset[]> | null = null;

/** Danh mục dùng chung cho mọi dòng trong danh sách — chỉ 1 request. */
export function loadDriverNotePresets(force = false): Promise<DriverNotePreset[]> {
  if (!cache || force) {
    cache = getDriverNotePresets().catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}

export function buildNoteOptions(presets: DriverNotePreset[], value: string | null) {
  const opts = presets.map((p) => ({ label: p.label, value: p.label, legacy: false }));
  const v = (value ?? '').trim();
  if (v && !presets.some((p) => p.label === v)) {
    return [{ label: `(tự nhập) ${v}`, value: v, legacy: true }, ...opts];
  }
  return opts;
}

export function DriverNoteSelect({
  value, onChange, disabled, className,
}: {
  value: string | null;
  onChange: (note: string | null) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}) {
  const { can } = useAuth();
  const canManage = can('driver-note-presets');
  const { toast } = useToast();
  const [presets, setPresets] = React.useState<DriverNotePreset[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');

  const reload = React.useCallback(async (force = false) => {
    try {
      setPresets(await loadDriverNotePresets(force));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách ghi chú', description: err.message });
    }
  }, [toast]);

  React.useEffect(() => { void reload(); }, [reload]);

  const commit = async (note: string | null) => {
    setBusy(true);
    try {
      await onChange(note);
    } finally {
      setBusy(false);
    }
  };

  const options = buildNoteOptions(presets, value);
  const current = (value ?? '').trim() || NONE;

  return (
    <>
      <Select
        value={current}
        disabled={disabled || busy}
        onValueChange={(v) => {
          if (v === ADD) { setNewLabel(''); setAddOpen(true); return; }
          if (v === MANAGE) { setManageOpen(true); return; }
          void commit(v === NONE ? null : v);
        }}
      >
        <SelectTrigger className={className ?? 'h-8 w-full min-w-[200px] text-sm'}>
          <SelectValue placeholder="Chọn ghi chú…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Không có ghi chú</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
          {canManage && <SelectItem value={ADD}>+ Thêm ghi chú mới…</SelectItem>}
          {canManage && <SelectItem value={MANAGE}>Quản lý danh sách…</SelectItem>}
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm ghi chú mới</DialogTitle></DialogHeader>
          <Input
            autoFocus
            value={newLabel}
            maxLength={100}
            placeholder="Ví dụ: Chuyên chạy ghép"
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Huỷ</Button>
            <Button
              disabled={!newLabel.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const created = await createDriverNotePreset(newLabel.trim());
                  await reload(true);
                  setAddOpen(false);
                  await onChange(created.label);
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Không thêm được ghi chú', description: err.message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Thêm và chọn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManage && (
        <DriverNoteManageDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          onChanged={() => void reload(true)}
        />
      )}
    </>
  );
}
```

`driver-note-manage-dialog.tsx`: Dialog "Quản lý ghi chú tài xế"; khi `open` gọi `loadDriverNotePresets(true)` (import từ `./driver-note-select` — tránh vòng import bằng cách đặt `loadDriverNotePresets` + `buildNoteOptions` + cache vào file thứ ba `driver-note-presets-cache.ts` và để cả hai component import từ đó; plan dùng tên file đó: **`src/app/(app)/drivers/components/driver-note-presets-cache.ts`** chứa `loadDriverNotePresets` + `buildNoteOptions`, `driver-note-select.tsx` re-export chúng); mỗi hàng: `<Input>` nhãn (sửa tại chỗ) + nút `Lưu` (chỉ bật khi đổi, gọi `renameDriverNotePreset`) + nút `Xoá` (gọi `deleteDriverNotePreset`, lỗi → `toast({variant:'destructive', title:'Không xoá được', description: err.message})`); cuối dialog là hàng thêm mục (Input + nút `Thêm`, gọi `createDriverNotePreset`). Sau mỗi thao tác thành công: cập nhật state cục bộ + `onChanged?.()`. Mọi nút `disabled` khi đang gọi API.

- [ ] **Step 4: Run** `npx vitest run "src/app/(app)/drivers/components/driver-note-select.test.tsx" "src/app/(app)/drivers/components/driver-note-manage-dialog.test.tsx"` → PASS; `npm run typecheck` sạch.
- [ ] **Step 5: Commit** `git add "src/app/(app)/drivers/components" && git commit -m "feat(drivers): DriverNoteSelect + dialog quản lý danh sách ghi chú"`.

### Task B3: Nối vào danh sách + dialog chi tiết

**Files:**
- Modify: `src/app/(app)/drivers/components/drivers-table.tsx` — cột "Ghi chú" (khối `TableCell ... min-w-[240px]` ~dòng 1180–1240), `saveCsNote` (~dòng 820), `DriverCsNoteEditor` (~dòng 104) và chỗ dùng ở dialog chi tiết (~dòng 2104), state `editingNoteId`/`noteDraft`/`savingNote`.
- Delete: `src/app/(app)/drivers/components/driver-cs-note-editor.test.tsx`

**Interfaces — Consumes:** `DriverNoteSelect` (B2), `updateDriverCsStatus(driverId, { csNote })` (đã có).

- [ ] **Step 1: Failing test** — nếu có test render `DriversTable` thì bổ sung; nếu không có (hiện chưa có), bỏ qua bước này và dựa vào test B2 + typecheck + kiểm tay trên DEV. Ghi rõ trong commit.
- [ ] **Step 2: Implement**
  - `saveCsNote` thành:

```ts
  const saveCsNote = async (driver: Driver, note: string | null) => {
    try {
      const updated = await updateDriverCsStatus(driver.id, { csNote: note ?? '' });
      patchDriverRow(driver.id, { csNote: updated?.csNote ?? note });
    } catch (err: any) {
      // 403 khi chọn chuỗi ngoài danh mục (không quyền) cũng hiện message tiếng Việt từ BE.
      toast({ variant: 'destructive', title: 'Không lưu được ghi chú', description: err.message });
    }
  };
```

  - Ô ở danh sách: thay toàn bộ nhánh `editingNoteId === driver.id ? … : …` bằng:

```tsx
<DriverNoteSelect
  value={driver.csNote ?? null}
  onChange={(note) => saveCsNote(driver, note)}
/>
```

  - Dialog chi tiết: thay `<DriverCsNoteEditor …/>` bằng

```tsx
{viewDriver && (
  <div className="border-t pt-4 space-y-2">
    <h4 className="font-semibold">Ghi chú tài xế (hiện ở danh sách chuyến đi)</h4>
    <p className="text-xs text-muted-foreground">
      Chọn một ghi chú có sẵn. Không phải nhật ký "Ghi nhận" bên dưới. Chỉ admin thấy.
    </p>
    <DriverNoteSelect
      value={viewDriver.csNote ?? null}
      onChange={async (note) => {
        const updated = await updateDriverCsStatus(viewDriver.id, { csNote: note ?? '' });
        const csNote = updated?.csNote ?? note;
        patchDriverRow(viewDriver.id, { csNote });
        setViewDriver((v) => (v && v.id === viewDriver.id ? { ...v, csNote } : v));
      }}
    />
  </div>
)}
```

  (lỗi từ `onChange` ở dialog: bọc `try/catch` + `toast` giống `saveCsNote`.)
  - Xoá `DriverCsNoteEditor` + test của nó, các state `editingNoteId`, `noteDraft`, `savingNote` và import thừa (`Pencil`, `CheckIcon` nếu không còn dùng — để `npm run typecheck`/lint chỉ ra).
- [ ] **Step 3: Run** `npm run typecheck` sạch; `npx vitest run "src/app/(app)/drivers"` → PASS.
- [ ] **Step 4: Commit** `git add -A "src/app/(app)/drivers" && git commit -m "feat(drivers): ghi chú tài xế chọn từ danh mục ở danh sách và dialog chi tiết"` (KHÔNG `git add` `.claude/settings.json`).

---

## Phần C — Kiểm tra, review, rollout

### Task C1: Tự review + review độc lập (nhóm CAO — RBAC)

- [ ] **Step 1: Self-review diff cả hai repo** — đọc lại từng site: `resolveCsNote` (case khác hoa/thường, giữ nguyên giá trị cũ, xoá), `rename` (UPDATE trong cùng transaction), `remove` (đếm + xoá cùng transaction), thứ tự route trong controller, `@RequireFunction` đúng từng route.
- [ ] **Step 2: Chạy kiểm tĩnh** — BE: `npx tsc --noEmit` + từng spec đã viết (`--runInBand`, `TZ=UTC`); admin: `npm run typecheck` + vitest các file mới.
- [ ] **Step 3: 1 lượt reviewer độc lập** (sub-agent fresh-context, model mạnh): đọc `driver-note-preset.service.ts`, `drivers.controller.ts` (phần note-presets + cs-status), `rbac.constants.ts`, `driver-note-select.tsx`, spec; ghi review ra file trong scratchpad (≤150 dòng), trả về status + 1 dòng. Tối đa 1 lượt (2 nếu lộ lỗi lớn). Sửa theo review rồi quay lại Step 1 một lần.

### Task C2: Rollout (backend TRƯỚC)

- [ ] **Step 1:** push 2 nhánh; merge vào `dev` (backend → Jenkins DEV chạy test đầy đủ + chạy migration), theo dõi build `vigo-backend-dev` xanh.
- [ ] **Step 2: Test tay trên DEV** — tài khoản KHÔNG có `driver-note-presets`: dropdown chỉ có 3 mục + "Không có ghi chú", không có "Thêm"/"Quản lý"; chọn mục → lưu, tag hiện ở trang Chuyến đi; gọi API gõ chuỗi lạ → 403. Tài khoản CÓ quyền (cấp ở `/roles`): thêm mục, đổi tên mục đang dùng (tài xế đổi theo), xoá mục đang dùng → báo lỗi, xoá mục chưa dùng → thành công. Tài xế có ghi chú cũ `jjj` hiện "(tự nhập) jjj".
- [ ] **Step 3:** PR `feat/booking-driver-cs-note` → `main` (backend) trước, deploy; rồi PR `fix/driver-cs-note-ui` → `main` (admin), deploy; resync `main → dev` cả hai repo. Cấp quyền `driver-note-presets` cho đúng người ở `/roles` sau khi deploy.
