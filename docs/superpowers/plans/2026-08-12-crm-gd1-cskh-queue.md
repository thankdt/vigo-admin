# CRM GĐ1 — Hàng đợi CSKH `/crm-queue` + dọn sạch `/bookings` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng màn hàng đợi CSKH độc lập `/crm-queue` để nhận toàn bộ việc gọi khách, rồi gỡ sạch phần gọi khách khỏi trang Chuyến đi.

**Architecture:** Hai repo, **rollout backend TRƯỚC**. `vigo-backend` mở quyền `crm-queue` cho 5 endpoint gọi khách (any-of, không thay thế `bookings`), thêm 2 cột người-nhận-việc theo pha và 3 tham số lọc cho hàng đợi. `vigo-admin` tách `BookingDetail` ra file riêng, dựng trang `/crm-queue` với 4 tab định nghĩa bằng truy vấn, rồi bóc phần gọi khách khỏi `bookings-table.tsx`.

**Tech Stack:** NestJS + TypeORM + Postgres (backend) · Next.js 15 static export + React 19 + vitest (admin) · jest (backend).

## Global Constraints

- Spec nguồn: `docs/superpowers/specs/2026-08-12-crm-vigo-design.md` (§4, §6.1, §7, GĐ1 trong §9).
- **Thứ tự rollout bắt buộc: `vigo-backend` merge + deploy TRƯỚC, `vigo-admin` sau.** Đảo thứ tự thì admin gọi param backend chưa có → hàng đợi trắng.
- **Any-of, không thay thế:** `@RequireFunction('bookings')` đổi thành `@RequireFunction('bookings', 'crm-queue')`. Vai trò cũ chỉ có `bookings` phải dùng được y như trước.
- **Không xoá bất kỳ cột denormalize nào** trên `booking` (`customerCallStatus`, `customerCallCheckedAt`, `customerCallCheckedById`, `customerCallReason`, `callBeforeStatus`, `callBeforeAt`, `callAfterStatus`, `callAfterAt`). Bóc UI không phải bóc dữ liệu.
- **Giờ Việt Nam (UTC+7)** cho mọi mốc ngày người dùng thấy. Ngưỡng "quá hạn" tính bằng **khoảng thời gian tuyệt đối** (`now() - interval`), không phải ranh giới ngày — nên không có bẫy múi giờ ở chỗ này.
- Ngưỡng quá hạn nằm trong `system_config`, key `CSKH_CALL_AFTER_OVERDUE_HOURS`, **mặc định `24`**. Ops đổi được không cần deploy.
- Lệnh kiểm: backend `npx tsc --noEmit && npx jest` · admin `npx tsc --noEmit && npx vitest run`.
- Nhánh: backend `git checkout -b feat/crm-queue-api main` · admin `git checkout -b feat/crm-queue main`.
- Message commit kết thúc bằng: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Yêu cầu trước:** GĐ0 (`docs/superpowers/plans/2026-08-12-crm-gd0-menu-restructure.md`) đã merge vào `main`. Task 8 dựa vào nhóm menu `'Khách hàng (CRM)'` do GĐ0 tạo.

## Hợp đồng API — chốt trước khi code (đa repo)

`GET /bookings/admin/list` nhận thêm **3 tham số, tất cả đều tuỳ chọn** (client cũ không gửi → hành vi không đổi):

| Param | Kiểu | Nghĩa |
|---|---|---|
| `claimedBy` | `string` (uuid admin) | Chỉ chuyến mà admin này đang **giữ việc chưa xong** ở một trong hai pha: `(callBeforeById = X AND callBeforeStatus = 'CLAIMED') OR (callAfterById = X AND callAfterStatus = 'CLAIMED')` |
| `excludeStatus` | `string` (CSV) | Loại trừ trạng thái, vd `COMPLETED,CANCELLED` |
| `overdue` | `'true'` | Chỉ chuyến `completedAt < now() - CSKH_CALL_AFTER_OVERDUE_HOURS giờ`. Bỏ qua nếu `completedAt` NULL |

Định nghĩa 4 tab của hàng đợi, bằng đúng các tham số trên:

| Tab | Tham số | Sắp xếp |
|---|---|---|
| Cần gọi trước | `callBefore=uncalled` + `excludeStatus=COMPLETED,CANCELLED` | `sortBy=createdAt&order=ASC` |
| Cần gọi sau | `callAfter=uncalled` + `status=COMPLETED` | `sortBy=completedAt&order=ASC` |
| Việc của tôi | `claimedBy=<id admin đang đăng nhập>` | `sortBy=createdAt&order=ASC` |
| Quá hạn | `callAfter=uncalled` + `status=COMPLETED` + `overdue=true` | `sortBy=completedAt&order=ASC` |

**Chuyến đã `COMPLETED` mà `callBefore` còn trống thì KHÔNG vào tab "Cần gọi trước"** — đó là lý do có `excludeStatus`. Backend suy pha từ `completedAt` (`booking.service.ts:3762`), nên nếu để chúng trong tab đó, CSKH bấm xử lý sẽ ghi vào `callAfter*` còn `callBeforeStatus` vẫn NULL → **dòng đó nằm lại hàng đợi vĩnh viễn**.

---

## File Structure

**`vigo-backend`**

| File | Trách nhiệm | Hành động |
|---|---|---|
| `src/rbac/rbac.constants.ts` | Danh mục function | **Sửa** — thêm `'crm-queue'` |
| `src/booking/booking.controller.ts` | Route admin | **Sửa** — 5 dòng `@RequireFunction`, 3 `@Query` mới |
| `src/booking/entities/booking.entity.ts` | Thực thể chuyến | **Sửa** — 2 cột `callBeforeById`, `callAfterById` |
| `src/database/migrations/1793200000000-AddBookingCallPhaseOwner.ts` | Migration | **Tạo mới** |
| `src/booking/booking.service.ts` | Truy vấn + ghi cuộc gọi | **Sửa** — `recordCustomerCall` + `findAllBookings` |
| `src/booking/booking.service.spec.ts` | Test service | **Sửa** — thêm test cho 3 param + ghi ById |

**`vigo-admin`**

| File | Trách nhiệm | Hành động |
|---|---|---|
| `src/app/(app)/bookings/components/booking-detail.tsx` | Dialog chi tiết chuyến (dùng chung 2 màn) | **Tạo mới** — chuyển từ `bookings-table.tsx` |
| `src/app/(app)/bookings/components/bookings-table.tsx` | Bảng chuyến đi | **Sửa** — bóc phần gọi khách, re-export `BookingDetail` |
| `src/app/(app)/bookings/components/bookings-table.test.tsx` | Test | **Sửa** — đổi đường import, dọn mock thừa |
| `src/lib/api.ts` | Client API | **Sửa** — `getBookings` thêm 3 param |
| `src/app/(app)/crm-queue/queue-tabs.ts` | Logic thuần: tab → tham số API | **Tạo mới** |
| `src/app/(app)/crm-queue/queue-tabs.test.ts` | Test logic thuần | **Tạo mới** |
| `src/app/(app)/crm-queue/page.tsx` | Trang hàng đợi | **Tạo mới** |
| `src/lib/nav-items.tsx` | Menu | **Sửa** — thêm mục Hàng đợi CSKH |
| `src/lib/rbac.ts` | Catalog RBAC | **Sửa** — thêm `/crm-queue` |
| `src/lib/rbac.test.ts` | Test catalog | **Sửa** — 29 → 30 |

---

# ĐỢT 1 — `vigo-backend` (deploy trước)

### Task 1: Mở quyền `crm-queue` cho 5 endpoint gọi khách

**Files:**
- Modify: `/Volumes/exSSD/dev/projects/vigo-backend/src/rbac/rbac.constants.ts:20`
- Modify: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/booking.controller.ts` (5 chỗ)
- Test: `/Volumes/exSSD/dev/projects/vigo-backend/src/rbac/rbac.constants.spec.ts`

**Interfaces:**
- Consumes: `MENU_FUNCTIONS`, `ALL_FUNCTION_KEYS` (rbac.constants.ts), `@RequireFunction(...keys)` — guard đã hỗ trợ any-of (`function-access.guard.ts:25-27`: `required.some(f => eff.has(f))`).
- Produces: khoá function `'crm-queue'` dùng được ở cả FE lẫn BE.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/rbac/rbac.constants.spec.ts`:

```ts
  it('có function crm-queue cho hàng đợi CSKH (CRM GĐ1)', () => {
    expect(MENU_FUNCTIONS).toContain('crm-queue');
    expect(ALL_FUNCTION_KEYS).toContain('crm-queue');
  });
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx jest src/rbac/rbac.constants.spec.ts`
Expected: FAIL — `'crm-queue'` chưa có trong mảng.

- [ ] **Step 3: Thêm function key**

`src/rbac/rbac.constants.ts`, ngay sau `'driver-penalties',` (dòng 20):

```ts
  // 2026-08-12 (CRM GĐ1): "Hàng đợi CSKH" — màn nhận việc gọi khách, tách khỏi trang
  // Chuyến đi. Quyền RIÊNG để CSKH tuyến đầu KHÔNG phải được cấp 'bookings' (đổi
  // trạng thái chuyến, điều tài, tạo chuyến). Các route gọi khách gate ANY-OF
  // ('bookings','crm-queue') nên vai trò cũ chỉ có 'bookings' vẫn dùng như trước.
  'crm-queue',
```

- [ ] **Step 4: Đổi 5 dòng `@RequireFunction`**

Trong `src/booking/booking.controller.ts`, đổi `@RequireFunction('bookings')` thành `@RequireFunction('bookings', 'crm-queue')` tại **đúng 5 chỗ** sau (kiểm bằng dòng `@Get`/`@Post` ngay bên dưới):

| Dòng ~ | Route ngay dưới |
|---|---|
| 270 | `@Get('admin/list')` |
| 360 | `@Get('admin/:id')` — chi tiết chuyến |
| 372 | `@Get('admin/customer-call-reasons')` |
| 403 | `@Post('admin/:id/customer-call')` |
| 418 | `@Get('admin/:id/customer-call-history')` |

**KHÔNG đổi** các route `bookings` khác (đổi trạng thái, điều tài, huỷ, tạo chuyến, hoá đơn) — CSKH không được phép làm những việc đó.

- [ ] **Step 5: Chạy test + kiểm tĩnh**

Run: `npx jest src/rbac && npx tsc --noEmit`
Expected: PASS, không lỗi type. `route-coverage.spec.ts` phải vẫn xanh (key mới đã nằm trong `ALL_FUNCTION_KEYS`).

- [ ] **Step 6: Commit**

```bash
git add src/rbac/rbac.constants.ts src/rbac/rbac.constants.spec.ts src/booking/booking.controller.ts
git commit -m "feat(crm): thêm function crm-queue, mở any-of cho 5 route gọi khách

CSKH tuyến đầu cần đọc danh sách/chi tiết chuyến và ghi cuộc gọi, nhưng KHÔNG
được đổi trạng thái/điều tài/tạo chuyến. Any-of ('bookings','crm-queue') giữ
nguyên đường cũ cho vai trò chỉ có 'bookings'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Hai cột người-giữ-việc theo pha + backfill

**Files:**
- Modify: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/entities/booking.entity.ts` (sau dòng 315)
- Create: `/Volumes/exSSD/dev/projects/vigo-backend/src/database/migrations/1793200000000-AddBookingCallPhaseOwner.ts`

**Interfaces:**
- Consumes: `booking_customer_call_event` (`bookingId`, `phase`, `status`, `byAdminUserId`, `createdAt`).
- Produces: cột `booking.callBeforeById` và `booking.callAfterById` (`uuid`, nullable) — Task 3 ghi, Task 4 đọc.

**Vì sao cần:** `booking` chỉ có **một** cột `customerCallCheckedById` (dòng 296) dùng chung hai pha và bị đè mỗi lần ghi (`booking.service.ts:3781`). Sau khi CSKH A nhận gọi trước, CSKH B ghi cuộc gọi sau → cột chung thành B → việc của A biến mất khỏi mọi cách lọc. Tab "Việc của tôi" không truy vấn được nếu thiếu 2 cột này.

**Vì sao backfill CHỈ hàng `CLAIMED`:** `booking` là bảng nóng nhất hệ thống. Migration chạy trong một transaction (`runMigrations({ transaction: 'each' })`), nên `UPDATE` toàn bảng sẽ giữ khoá lâu. Mà tab "Việc của tôi" chỉ cần **việc đang dở** — hàng đã `CALLED`/`UNREACHED` là việc đã xong, không ai cần biết ai giữ nữa. Tập `CLAIMED` chưa xử lý luôn nhỏ (đơn vị chục–trăm dòng).

- [ ] **Step 1: Thêm cột vào entity**

`src/booking/entities/booking.entity.ts`, ngay sau `callAfterAt` (dòng 315):

```ts
  /**
   * Ai đang GIỮ VIỆC ở từng pha. Tách khỏi `customerCallCheckedById` (một cột dùng
   * chung, bị đè mỗi lần ghi) vì hai pha là hai việc độc lập của hai người khác nhau:
   * CSKH B ghi cuộc gọi sau KHÔNG được làm mất dấu việc CSKH A đang giữ ở pha trước.
   * Nguồn của tab "Việc của tôi" trong hàng đợi CSKH (/crm-queue).
   */
  @Column({ type: 'uuid', nullable: true })
  callBeforeById: string | null;

  @Column({ type: 'uuid', nullable: true })
  callAfterById: string | null;
```

- [ ] **Step 2: Viết migration**

Tạo `src/database/migrations/1793200000000-AddBookingCallPhaseOwner.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `booking.callBeforeById` / `callAfterById` — ai đang giữ việc gọi ở TỪNG pha.
 *
 * Trước đây chỉ có `customerCallCheckedById` dùng chung cho cả hai pha và bị đè mỗi
 * lần ghi, nên không truy vấn được "việc CSKH này đang giữ" — tab "Việc của tôi" của
 * hàng đợi CSKH (/crm-queue) không có dữ liệu để chạy.
 *
 * 🚨 `transaction` giữ MẶC ĐỊNH (xem 1793000200000-AddLeakageTraceNotifiedAt): repo
 * chạy `runMigrations({ transaction: 'each' })` nên ADD COLUMN + UPDATE + CREATE INDEX
 * là một khối nguyên tử. KHÔNG dùng CREATE INDEX CONCURRENTLY ở đây.
 *
 * Backfill CỐ Ý chỉ chạm hàng còn 'CLAIMED'. `booking` là bảng nóng nhất hệ thống;
 * UPDATE toàn bảng trong transaction sẽ giữ khoá quá lâu. Hàng đã CALLED/UNREACHED là
 * việc ĐÃ XONG — không tab nào hỏi "ai từng giữ" nên không cần backfill. Tập CLAIMED
 * chưa xử lý chỉ vài chục–vài trăm dòng.
 */
export class AddBookingCallPhaseOwner1793200000000 implements MigrationInterface {
  name = 'AddBookingCallPhaseOwner1793200000000';

  public async up(q: QueryRunner): Promise<void> {
    // Đừng để ADD COLUMN xếp hàng sau một transaction dài rồi chặn mọi reader.
    await q.query(`SET LOCAL lock_timeout = '5s'`);

    // Nullable, không default -> metadata-only trên PG/Neon, không rewrite bảng.
    await q.query(`ALTER TABLE "booking" ADD COLUMN "callBeforeById" uuid`);
    await q.query(`ALTER TABLE "booking" ADD COLUMN "callAfterById" uuid`);

    // Backfill từ event mới nhất của ĐÚNG pha đó, chỉ cho hàng còn đang giữ việc.
    for (const [col, phase, statusCol] of [
      ['callBeforeById', 'BEFORE_COMPLETE', 'callBeforeStatus'],
      ['callAfterById', 'AFTER_COMPLETE', 'callAfterStatus'],
    ] as const) {
      await q.query(`
        UPDATE "booking" b
        SET "${col}" = e."byAdminUserId"
        FROM (
          SELECT DISTINCT ON ("bookingId") "bookingId", "byAdminUserId"
          FROM "booking_customer_call_event"
          WHERE "phase" = '${phase}'
          ORDER BY "bookingId", "createdAt" DESC
        ) e
        WHERE e."bookingId" = b."id" AND b."${statusCol}" = 'CLAIMED'
      `);
    }

    // Index PARTIAL: tab "Việc của tôi" chỉ hỏi hàng đang CLAIMED, nên index đầy đủ
    // sẽ phình vô ích trên một bảng hàng triệu dòng.
    await q.query(`
      CREATE INDEX "IDX_booking_call_before_owner"
      ON "booking" ("callBeforeById")
      WHERE "callBeforeStatus" = 'CLAIMED'
    `);
    await q.query(`
      CREATE INDEX "IDX_booking_call_after_owner"
      ON "booking" ("callAfterById")
      WHERE "callAfterStatus" = 'CLAIMED'
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_booking_call_after_owner"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_booking_call_before_owner"`);
    await q.query(`ALTER TABLE "booking" DROP COLUMN "callAfterById"`);
    await q.query(`ALTER TABLE "booking" DROP COLUMN "callBeforeById"`);
  }
}
```

> Vòng lặp `for` sinh SQL bằng template string với `${col}` / `${phase}` — cả hai đều là **hằng viết trong code**, không phải input người dùng, nên không có đường SQL injection ở đây. Đừng đổi thành tham số bound: tên cột không truyền qua tham số được.

- [ ] **Step 3: Chạy migration trên DB dev cục bộ**

Run: `npx tsc --noEmit && npm run migration:run -- -t each`
Expected: chạy sạch. Kiểm bằng `\d booking` thấy 2 cột mới + 2 index partial.

- [ ] **Step 4: Commit**

```bash
git add src/booking/entities/booking.entity.ts src/database/migrations/1793200000000-AddBookingCallPhaseOwner.ts
git commit -m "feat(crm): booking.callBeforeById/callAfterById + backfill hàng CLAIMED

Một cột customerCallCheckedById dùng chung 2 pha bị đè mỗi lần ghi -> không
truy vấn được 'việc CSKH này đang giữ'. Backfill chỉ chạm hàng còn CLAIMED vì
booking là bảng nóng nhất và việc đã xong thì không ai hỏi ai từng giữ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `recordCustomerCall` ghi người giữ việc theo pha

**Files:**
- Modify: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/booking.service.ts:3775-3785`
- Test: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/booking.service.spec.ts`

**Interfaces:**
- Consumes: `booking.callBeforeById` / `callAfterById` (Task 2).
- Produces: hai cột trên luôn phản ánh người ghi lần gần nhất **của đúng pha đó**.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/booking/booking.service.spec.ts` (cùng khối describe với các test `recordCustomerCall` sẵn có):

```ts
  it('ghi callBeforeById khi chuyến CHƯA hoàn thành, không đụng callAfterById', async () => {
    // ... dựng mock manager như các test recordCustomerCall sẵn có, với target.completedAt = null
    await service.recordCustomerCall('bk-1', 'CLAIMED' as any, undefined, 'admin-A', undefined);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'bk-1' },
      expect.objectContaining({ callBeforeStatus: 'CLAIMED', callBeforeById: 'admin-A' }),
    );
    expect(updateSpy.mock.calls[0][2]).not.toHaveProperty('callAfterById');
  });

  it('ghi callAfterById khi chuyến ĐÃ hoàn thành, không đụng callBeforeById', async () => {
    // ... như trên nhưng target.completedAt = new Date()
    await service.recordCustomerCall('bk-2', 'CALLED' as any, undefined, 'admin-B', undefined);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'bk-2' },
      expect.objectContaining({ callAfterStatus: 'CALLED', callAfterById: 'admin-B' }),
    );
    expect(updateSpy.mock.calls[0][2]).not.toHaveProperty('callBeforeById');
  });
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx jest src/booking/booking.service.spec.ts -t "callBeforeById"`
Expected: FAIL — patch hiện chưa có trường `callBeforeById`.

- [ ] **Step 3: Sửa `phasePatch`**

`src/booking/booking.service.ts`, đổi khối `phasePatch` (dòng ~3775):

```ts
      const phasePatch = phase === BookingCustomerCallPhase.AFTER_COMPLETE
        ? { callAfterStatus: status, callAfterAt: checkedAt }
        : { callBeforeStatus: status, callBeforeAt: checkedAt };
```

thành:

```ts
      // Ghi luôn NGƯỜI GIỮ VIỆC của đúng pha này. `customerCallCheckedById` bên dưới
      // vẫn giữ "lần gọi mới nhất" cho cột/filter cũ và client cũ — hai thứ khác nhau,
      // đừng gộp: cột chung bị đè nên không trả lời được "ai đang giữ việc pha nào".
      const phasePatch = phase === BookingCustomerCallPhase.AFTER_COMPLETE
        ? { callAfterStatus: status, callAfterAt: checkedAt, callAfterById: adminUserId }
        : { callBeforeStatus: status, callBeforeAt: checkedAt, callBeforeById: adminUserId };
```

- [ ] **Step 4: Chạy test để xác nhận XANH**

Run: `npx jest src/booking/booking.service.spec.ts && npx tsc --noEmit`
Expected: PASS, toàn bộ test `recordCustomerCall` cũ vẫn xanh.

- [ ] **Step 5: Commit**

```bash
git add src/booking/booking.service.ts src/booking/booking.service.spec.ts
git commit -m "feat(crm): recordCustomerCall ghi người giữ việc theo từng pha

customerCallCheckedById vẫn giữ 'lần gọi mới nhất' cho cột/filter cũ — không
gộp hai khái niệm, vì cột chung bị đè nên không trả lời được ai giữ pha nào.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Ba tham số lọc cho hàng đợi

**Files:**
- Modify: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/booking.service.ts` (`findAllBookings`, dòng 3454+ và khối lọc ~3595-3625)
- Modify: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/booking.controller.ts:272-330`
- Test: `/Volumes/exSSD/dev/projects/vigo-backend/src/booking/booking.service.spec.ts`

**Interfaces:**
- Consumes: `this.masterDataService.getSystemConfig(key)` (mẫu dùng ở `booking.service.ts:3795`).
- Produces: `findAllBookings(..., callAfter?, queue?)` — **tham số thứ 20 là một object**, các tham số vị trí cũ không đổi:

```ts
queue?: { claimedBy?: string; excludeStatus?: string; overdue?: string }
```

**Vì sao là object chứ không phải 3 tham số vị trí:** hàm đã có 19 tham số vị trí; thêm 3 nữa thì mọi lời gọi thành một hàng `undefined` dài không đọc nổi và cực dễ đặt nhầm vị trí. Object ở cuối là additive, 13 lời gọi trong `booking.service.spec.ts` không phải sửa dòng nào.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/booking/booking.service.spec.ts`:

```ts
  it('claimedBy lọc theo người giữ việc ở CẢ HAI pha', async () => {
    await service.findAllBookings(1, 20, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, { claimedBy: 'admin-A' });
    const sql = andWhereSpy.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(sql).toContain('callBeforeById');
    expect(sql).toContain('callAfterById');
    expect(sql).toContain("'CLAIMED'");
  });

  it('excludeStatus loại trừ trạng thái (chuyến đã xong không nằm trong hàng đợi gọi trước)', async () => {
    await service.findAllBookings(1, 20, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, { excludeStatus: 'COMPLETED,CANCELLED' });
    const call = andWhereSpy.mock.calls.find((c) => String(c[0]).includes('NOT IN'));
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ exStatuses: ['COMPLETED', 'CANCELLED'] });
  });

  it('overdue=true dùng ngưỡng giờ từ system_config', async () => {
    masterData.getSystemConfig.mockResolvedValueOnce('6');
    await service.findAllBookings(1, 20, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, { overdue: 'true' });
    const call = andWhereSpy.mock.calls.find((c) => String(c[0]).includes('completedAt'));
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ overdueHours: 6 });
  });

  it('overdue=true không có config thì mặc định 24 giờ', async () => {
    masterData.getSystemConfig.mockResolvedValueOnce(null);
    await service.findAllBookings(1, 20, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, { overdue: 'true' });
    const call = andWhereSpy.mock.calls.find((c) => String(c[0]).includes('completedAt'));
    expect(call![1]).toMatchObject({ overdueHours: 24 });
  });
```

> `andWhereSpy` và `masterData` lấy theo đúng cách các test `findAllBookings` sẵn có trong file đang dựng mock query-builder (xem test dòng 1720 trở đi).

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx jest src/booking/booking.service.spec.ts -t "claimedBy"`
Expected: FAIL — chưa có tham số `queue`.

- [ ] **Step 3: Thêm tham số vào service**

(a) Cuối danh sách tham số của `findAllBookings` (sau `callAfter?: string,`, dòng ~3499):

```ts
    /**
     * Bộ lọc RIÊNG của hàng đợi CSKH (/crm-queue). Gom vào một object thay vì thêm 3
     * tham số vị trí: hàm này đã có 19 tham số vị trí, thêm nữa thì mọi lời gọi thành
     * một hàng `undefined` dài và cực dễ đặt nhầm chỗ. Absent = không lọc.
     */
    queue?: { claimedBy?: string; excludeStatus?: string; overdue?: string },
```

(b) Ngay **sau** khối `applyPhaseFilter(...)` (sau dòng ~3613), thêm:

```ts
    // Hàng đợi CSKH: ai đang giữ việc ở BẤT KỲ pha nào. Hai pha độc lập nên phải OR —
    // lọc bằng `customerCallCheckedById` sẽ sai vì cột đó bị đè giữa hai pha.
    if (queue?.claimedBy && queue.claimedBy.trim()) {
      query.andWhere(
        `((booking."callBeforeById" = :claimedBy AND booking."callBeforeStatus" = 'CLAIMED')
          OR (booking."callAfterById" = :claimedBy AND booking."callAfterStatus" = 'CLAIMED'))`,
        { claimedBy: queue.claimedBy.trim() },
      );
    }

    // Loại trừ trạng thái. Dùng cho tab "Cần gọi trước": chuyến đã COMPLETED/CANCELLED
    // không còn cơ hội gọi trước, để lại thì hàng đợi KHÔNG BAO GIỜ VƠI (backend suy
    // pha theo completedAt nên thao tác trên chúng sẽ ghi vào callAfter*).
    if (queue?.excludeStatus && queue.excludeStatus.trim()) {
      const exStatuses = queue.excludeStatus.split(',').map((s) => s.trim()).filter(Boolean);
      if (exStatuses.length) {
        query.andWhere('booking.status NOT IN (:...exStatuses)', { exStatuses });
      }
    }

    // Quá hạn gọi sau. Ngưỡng trong system_config để ops đổi không cần deploy. Đây là
    // KHOẢNG thời gian tuyệt đối (now() - interval), không phải ranh giới ngày, nên
    // không có bẫy múi giờ. completedAt NULL bị loại tự nhiên bởi phép so sánh.
    if (queue?.overdue === 'true') {
      const raw = await this.masterDataService
        .getSystemConfig('CSKH_CALL_AFTER_OVERDUE_HOURS')
        .catch(() => null);
      const parsed = Number(raw);
      const overdueHours = Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
      query.andWhere(
        `booking."completedAt" < (now() - make_interval(hours => :overdueHours))`,
        { overdueHours },
      );
    }
```

- [ ] **Step 4: Thêm `@Query` vào controller**

`src/booking/booking.controller.ts`, sau `@Query('callAfter') callAfter?: string,` (dòng ~309):

```ts
    // Bộ lọc riêng của hàng đợi CSKH (/crm-queue) — xem findAllBookings.
    @Query('claimedBy') claimedBy?: string,
    @Query('excludeStatus') excludeStatus?: string,
    @Query('overdue') overdue?: string,
```

và ở lời gọi service, sau `callAfter,`:

```ts
      { claimedBy, excludeStatus, overdue },
```

- [ ] **Step 5: Chạy test để xác nhận XANH**

Run: `npx jest src/booking && npx tsc --noEmit`
Expected: PASS toàn bộ, kể cả 13 lời gọi `findAllBookings` cũ trong spec (không sửa dòng nào).

- [ ] **Step 6: Seed config mặc định**

Tạo `src/database/migrations/1793200100000-SeedCskhOverdueHours.ts` theo đúng mẫu `1791300000000-AddCustomerCallReason.ts`, chèn `CSKH_CALL_AFTER_OVERDUE_HOURS = '24'` vào `system_config` (`ON CONFLICT DO NOTHING`), `down()` xoá đúng key đó.

Run: `npm run migration:run -- -t each`

- [ ] **Step 7: Commit**

```bash
git add src/booking/booking.service.ts src/booking/booking.controller.ts src/booking/booking.service.spec.ts src/database/migrations/1793200100000-SeedCskhOverdueHours.ts
git commit -m "feat(crm): 3 tham số lọc cho hàng đợi CSKH (claimedBy, excludeStatus, overdue)

Gom vào object ở cuối thay vì 3 tham số vị trí — hàm đã có 19 tham số vị trí.
excludeStatus là thứ giữ cho tab 'Cần gọi trước' vơi được: backend suy pha theo
completedAt nên chuyến đã COMPLETED phải bị loại khỏi tab đó.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Hoàn tất đợt 1

- [ ] `npx tsc --noEmit && npx jest` — sạch cả hai.
- [ ] Push `feat/crm-queue-api`, merge vào `dev`, chạy migration trên DEV, kiểm bằng `curl` với token admin: 4 tổ hợp param của bảng "Hợp đồng API" trả đúng tập chuyến.
- [ ] PR `feat/crm-queue-api` → `main`, merge, **deploy backend production**.
- [ ] Resync `main → dev`.

> **Chỉ sau khi backend đã lên production mới bắt đầu đợt 2.**

---

# ĐỢT 2 — `vigo-admin`

### Task 5: Tách `BookingDetail` ra file riêng

**Files:**
- Create: `src/app/(app)/bookings/components/booking-detail.tsx`
- Modify: `src/app/(app)/bookings/components/bookings-table.tsx`
- Modify: `src/app/(app)/bookings/components/bookings-table.test.tsx:3`

**Interfaces:**
- Produces: `export function BookingDetail({ bookingId, onClose, onDuplicate?, onCallRecorded? })` và `export function PriceBreakdownCard({ booking })` từ `./booking-detail`.

**Vì sao tách TRƯỚC khi dựng `/crm-queue`:** import `BookingDetail` thẳng từ `bookings-table.tsx` sẽ kéo nguyên module 1926 dòng — kèm `getAvailableDrivers`, `reassignBooking`, `CreateBookingDialog` — vào bundle của `/crm-queue`. Dùng lại component thì đúng, nhưng dùng lại qua một file khổng lồ thì đổi một bệnh lấy bệnh khác.

- [ ] **Step 1: Chuyển code**

Cắt từ `bookings-table.tsx` sang `booking-detail.tsx` (giữ nguyên nội dung, chỉ chuyển chỗ + mang theo import cần thiết):
- `PriceBreakdownCard` và các helper chỉ nó dùng
- `CUSTOMER_CALL_LABEL`, `CUSTOMER_CALL_TOAST`, `CustomerCallBadge` (dòng 403-421)
- `BookingDetail` (dòng 427 → hết component)
- `CANCELLED_BY_ROLE_LABEL` nếu `BookingDetail` dùng — nếu `BookingsTable` cũng dùng thì để lại `bookings-table.tsx` và import ngược sang, **không chép hai bản**

- [ ] **Step 2: Re-export để không vỡ chỗ đang dùng**

Trong `bookings-table.tsx`, thêm ở đầu file:

```tsx
// Tách ra file riêng (2026-08-12) để /crm-queue dùng lại mà không phải nạp cả module
// này. Re-export giữ nguyên đường import cũ cho các chỗ đang dùng.
export { BookingDetail, PriceBreakdownCard } from './booking-detail';
import { BookingDetail, CustomerCallBadge } from './booking-detail';
```

- [ ] **Step 3: Chạy test — phải XANH mà không sửa assertion nào**

Run: `npx vitest run src/app/\(app\)/bookings && npx tsc --noEmit`
Expected: PASS. Đây là refactor thuần — test cũ xanh **là** bằng chứng không đổi hành vi.

- [ ] **Step 4: Đổi import trong test cho đúng nhà mới**

`bookings-table.test.tsx:3`:

```tsx
import { PriceBreakdownCard, BookingDetail } from './booking-detail';
```

Run lại: `npx vitest run src/app/\(app\)/bookings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/bookings/components/
git commit -m "refactor(bookings): tách BookingDetail + PriceBreakdownCard ra file riêng

Chuẩn bị cho /crm-queue dùng lại dialog chi tiết chuyến mà không kéo cả module
1926 dòng (kèm điều tài, tạo chuyến) vào bundle. Refactor thuần — test cũ xanh
không sửa assertion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `getBookings` nhận 3 tham số hàng đợi

**Files:**
- Modify: `src/lib/api.ts:745-802`

**Interfaces:**
- Produces: `getBookings(params)` nhận thêm `claimedBy?: string`, `excludeStatus?: string`, `overdue?: boolean`.

- [ ] **Step 1: Thêm vào kiểu tham số**

Sau `callAfter?: CustomerCallFilter;` (dòng 781):

```ts
  // ─── Hàng đợi CSKH (/crm-queue) ────────────────────────────────────────────
  // Chỉ chuyến admin này đang GIỮ VIỆC chưa xong ở một trong hai pha (BE lọc
  // callBeforeById/callAfterById + trạng thái CLAIMED).
  claimedBy?: string;
  // CSV trạng thái cần loại trừ, vd 'COMPLETED,CANCELLED'.
  excludeStatus?: string;
  // true = chỉ chuyến hoàn thành quá lâu mà chưa gọi sau. Ngưỡng giờ do BE đọc từ
  // system_config (CSKH_CALL_AFTER_OVERDUE_HOURS) — FE cố ý KHÔNG biết con số này.
  overdue?: boolean;
```

- [ ] **Step 2: Thêm vào query string**

Sau `...(params.callAfter && { callAfter: params.callAfter }),` (dòng 801):

```ts
    ...(params.claimedBy && { claimedBy: params.claimedBy }),
    ...(params.excludeStatus && { excludeStatus: params.excludeStatus }),
    ...(params.overdue && { overdue: 'true' }),
```

- [ ] **Step 3: Kiểm tĩnh + commit**

Run: `npx tsc --noEmit`

```bash
git add src/lib/api.ts
git commit -m "feat(crm): getBookings nhận claimedBy/excludeStatus/overdue

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Logic thuần "tab → tham số API"

**Files:**
- Create: `src/app/(app)/crm-queue/queue-tabs.ts`
- Test: `src/app/(app)/crm-queue/queue-tabs.test.ts`

**Interfaces:**
- Produces:
```ts
export type QueueTab = 'before' | 'after' | 'mine' | 'overdue';
export const QUEUE_TAB_LABEL: Record<QueueTab, string>;
export const QUEUE_TAB_ORDER: QueueTab[];
export function paramsForTab(tab: QueueTab, adminId: string): Record<string, unknown>;
```
Task 8 (`page.tsx`) đổ thẳng kết quả `paramsForTab` vào `getBookings`.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/app/(app)/crm-queue/queue-tabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { paramsForTab, QUEUE_TAB_ORDER } from './queue-tabs';

describe('paramsForTab', () => {
  // Chuyến đã COMPLETED/CANCELLED KHÔNG được nằm trong tab gọi trước: backend suy pha
  // theo completedAt nên xử lý chúng sẽ ghi vào callAfter*, callBeforeStatus vẫn NULL
  // -> dòng đó ở lại hàng đợi VĨNH VIỄN.
  it('tab "before" loại trừ chuyến đã xong và sắp theo chờ lâu nhất', () => {
    expect(paramsForTab('before', 'admin-1')).toEqual({
      callBefore: 'uncalled',
      excludeStatus: 'COMPLETED,CANCELLED',
      sortBy: 'createdAt',
      order: 'ASC',
    });
  });

  it('tab "after" chỉ chuyến đã hoàn thành, sắp theo hoàn thành sớm nhất', () => {
    expect(paramsForTab('after', 'admin-1')).toEqual({
      callAfter: 'uncalled',
      status: 'COMPLETED',
      sortBy: 'completedAt',
      order: 'ASC',
    });
  });

  it('tab "mine" lọc theo admin đang đăng nhập', () => {
    expect(paramsForTab('mine', 'admin-1')).toEqual({
      claimedBy: 'admin-1',
      sortBy: 'createdAt',
      order: 'ASC',
    });
  });

  it('tab "overdue" = "after" + cờ overdue (ngưỡng giờ do BE quyết)', () => {
    const p = paramsForTab('overdue', 'admin-1');
    expect(p).toMatchObject({ callAfter: 'uncalled', status: 'COMPLETED', overdue: true });
    expect(p).not.toHaveProperty('overdueHours');
  });

  it('4 tab, đúng thứ tự hiển thị', () => {
    expect(QUEUE_TAB_ORDER).toEqual(['before', 'after', 'mine', 'overdue']);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run src/app/\(app\)/crm-queue/queue-tabs.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết `queue-tabs.ts`**

```ts
/**
 * Định nghĩa 4 tab của hàng đợi CSKH bằng ĐÚNG tham số API — logic thuần, tách khỏi
 * page.tsx để test được mà không phải mount cả trang.
 *
 * Quy tắc quan trọng nhất ở đây là `excludeStatus` của tab "before". Backend suy pha
 * cuộc gọi từ `booking.completedAt` (booking.service.ts), client không chọn được pha.
 * Nếu để chuyến đã COMPLETED nằm trong tab "cần gọi trước", CSKH bấm xử lý sẽ ghi vào
 * callAfter* còn callBeforeStatus vẫn NULL -> dòng đó KHÔNG BAO GIỜ rời hàng đợi.
 * Số chuyến bị sót gọi trước là một CHỈ SỐ (xem /cskh-activity), không phải việc tồn.
 */
export type QueueTab = 'before' | 'after' | 'mine' | 'overdue';

export const QUEUE_TAB_ORDER: QueueTab[] = ['before', 'after', 'mine', 'overdue'];

export const QUEUE_TAB_LABEL: Record<QueueTab, string> = {
  before: 'Cần gọi trước',
  after: 'Cần gọi sau',
  mine: 'Việc của tôi',
  overdue: 'Quá hạn',
};

export function paramsForTab(tab: QueueTab, adminId: string): Record<string, unknown> {
  switch (tab) {
    case 'before':
      return {
        callBefore: 'uncalled',
        excludeStatus: 'COMPLETED,CANCELLED',
        // Chờ lâu nhất lên đầu. CỐ Ý dùng createdAt chứ không phải scheduledTime:
        // chuyến thường có scheduledTime NULL nên sắp theo cột đó sẽ đẩy chuyến
        // đi-ngay (gấp nhất) xuống cuối. Xem "Sai khác so với spec" cuối plan.
        sortBy: 'createdAt',
        order: 'ASC',
      };
    case 'after':
      return { callAfter: 'uncalled', status: 'COMPLETED', sortBy: 'completedAt', order: 'ASC' };
    case 'mine':
      return { claimedBy: adminId, sortBy: 'createdAt', order: 'ASC' };
    case 'overdue':
      // Ngưỡng giờ CỐ Ý không nằm ở FE — backend đọc từ system_config để ops đổi
      // được mà không cần deploy admin.
      return {
        callAfter: 'uncalled',
        status: 'COMPLETED',
        overdue: true,
        sortBy: 'completedAt',
        order: 'ASC',
      };
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận XANH**

Run: `npx vitest run src/app/\(app\)/crm-queue/queue-tabs.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/crm-queue/queue-tabs.ts src/app/\(app\)/crm-queue/queue-tabs.test.ts
git commit -m "feat(crm): định nghĩa 4 tab hàng đợi CSKH bằng tham số API (logic thuần)

excludeStatus của tab 'before' là thứ giữ cho hàng đợi vơi được — BE suy pha
theo completedAt nên chuyến đã xong phải bị loại khỏi tab gọi trước.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Trang `/crm-queue` + mục menu + catalog RBAC

**Files:**
- Create: `src/app/(app)/crm-queue/page.tsx`
- Modify: `src/lib/rbac.ts:42` (thêm `/crm-queue`)
- Modify: `src/lib/nav-items.tsx` (thêm mục vào nhóm CRM, **vị trí đầu**)
- Modify: `src/lib/rbac.test.ts:23` (29 → 30) và khối test nhóm CRM của GĐ0

**Interfaces:**
- Consumes: `paramsForTab`, `QUEUE_TAB_ORDER`, `QUEUE_TAB_LABEL` (Task 7) · `getBookings` (Task 6) · `BookingDetail` từ `../bookings/components/booking-detail` (Task 5) · `useAuth().me.id`.

- [ ] **Step 1: Viết test thất bại (catalog RBAC)**

Trong `src/lib/rbac.test.ts`:

(a) đổi dòng 22-24 thành:

```ts
  it('has exactly 30 menu functions (navItems minus /settings)', () => {
    expect(Object.keys(MENU_FUNCTION_BY_HREF).length).toBe(30); // 2026-08-12: +crm-queue
  });
```

(b) trong khối `describe('nhóm Khách hàng (CRM)', ...)` do GĐ0 tạo, đổi `CRM_HREFS` thành:

```ts
    const CRM_HREFS = ['/crm-queue', '/users', '/cskh-activity', '/acquisition'];
```

(c) thêm test riêng cho quyền tách bạch:

```ts
    // Cả lý do tồn tại của GĐ1: CSKH tuyến đầu KHÔNG được cấp 'bookings'.
    it('crm-queue là quyền RIÊNG, có bookings không mở được /crm-queue', () => {
      expect(MENU_FUNCTION_BY_HREF['/crm-queue']).toBe('crm-queue');
      const ops = mkMe({ functions: ['bookings'] });
      expect(isMenuVisible('/crm-queue', ops)).toBe(false);
      expect(isRouteAllowed('/crm-queue', ops)).toBe(false);
      const cskh = mkMe({ functions: ['crm-queue'] });
      expect(isRouteAllowed('/crm-queue', cskh)).toBe(true);
      expect(isRouteAllowed('/bookings', cskh)).toBe(false);
    });
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run src/lib/rbac.test.ts`
Expected: FAIL — 29 ≠ 30 và `/crm-queue` chưa có trong catalog.

- [ ] **Step 3: Khai vào catalog + menu**

`src/lib/rbac.ts`, sau `'/cskh-activity': 'cskh-activity',` (dòng 42):

```ts
  // Backend: @RequireFunction('bookings','crm-queue') trên 5 route gọi khách. Quyền
  // RIÊNG khỏi 'bookings' — CSKH tuyến đầu chỉ được đọc chuyến + ghi cuộc gọi, KHÔNG
  // được đổi trạng thái/điều tài/tạo chuyến. URL PHẲNG (không phải /crm/queue) vì
  // isRouteAllowed gate theo segment cấp 1: /crm/* sẽ gộp chung một function.
  '/crm-queue': 'crm-queue',
```

`src/lib/nav-items.tsx`, thêm `PhoneCall` vào danh sách import từ `lucide-react` (cạnh `Headset` đã có), rồi đặt mục **đầu tiên** trong nhóm `'Khách hàng (CRM)'`:

```tsx
      { href: '/crm-queue', label: 'Hàng đợi CSKH', icon: PhoneCall },
```

> Đặt đầu nhóm là cố ý: đây là màn CSKH mở nhiều nhất trong ngày, và nó thành trang đích sau đăng nhập cho người chỉ có quyền CSKH.

- [ ] **Step 4: Chạy test để xác nhận XANH**

Run: `npx vitest run src/lib/rbac.test.ts`
Expected: PASS.

- [ ] **Step 5: Dựng trang**

Tạo `src/app/(app)/crm-queue/page.tsx`. Yêu cầu bắt buộc:

- `'use client'` ở dòng đầu.
- `Tabs` với `QUEUE_TAB_ORDER` / `QUEUE_TAB_LABEL`; đổi tab → `setPage(1)`.
- Nạp dữ liệu: `getBookings({ page, limit: 20, ...paramsForTab(tab, me!.id) })`. Tab `mine` chỉ gọi khi `me?.id` đã có (`useAuth()` có giai đoạn `loading`) — chưa có thì hiện spinner, **không** gọi với `claimedBy: undefined` (sẽ ra toàn bộ chuyến).
- Cột: Khách (tên + SĐT) · Tuyến · Giờ đón/hoàn thành · **Đã chờ** (tính từ `createdAt` hoặc `completedAt` theo tab) · Người giữ việc · Thao tác.
- Mỗi dòng bấm được để mở `<BookingDetail bookingId=… onClose=… onCallRecorded={reload} />`.
- Mọi hiển thị ngày–giờ dùng `formatVnDateTime` từ `../leakage-review/leakage-labels` — **không tự viết formatter, không dùng `toLocaleDateString()`**.
- Không có nút tạo chuyến, không có nút đổi trạng thái, không có điều tài.

- [ ] **Step 6: Kiểm tĩnh + build**

Run: `npx tsc --noEmit && npx vitest run && npx next build`
Expected: sạch cả ba. (`npx next build`, **không** `npm run build` — lệnh đó deploy thẳng lên S3 production.)

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/crm-queue/page.tsx src/lib/rbac.ts src/lib/rbac.test.ts src/lib/nav-items.tsx
git commit -m "feat(crm): trang Hàng đợi CSKH /crm-queue

URL phẳng vì isRouteAllowed gate theo segment cấp 1 — /crm/* sẽ gộp mọi trang
CRM vào chung một function. Quyền crm-queue tách hẳn khỏi bookings: CSKH chỉ
đọc chuyến + ghi cuộc gọi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Dọn sạch phần gọi khách khỏi `/bookings`

**Files:**
- Modify: `src/app/(app)/bookings/components/bookings-table.tsx`
- Modify: `src/app/(app)/bookings/components/bookings-table.test.tsx:13`

**Interfaces:** không đổi export nào. `BookingDetail` (kèm khối gọi khách bên trong) **giữ nguyên** ở `booking-detail.tsx` — `/crm-queue` dùng chính nó.

**Làm task này SAU CÙNG.** Chỉ xoá khi `/crm-queue` đã chạy được trên DEV — mất đường cũ trước khi đường mới thông là cách nhanh nhất để CSKH đứng hình.

- [ ] **Step 1: Đối chiếu 1-1 trước khi xoá**

Ghi bảng này vào phần mô tả PR (bắt buộc, không bỏ):

| Chức năng cũ ở `/bookings` | Chỗ mới |
|---|---|
| Lọc "Gọi trước HT" | Tab *Cần gọi trước* của `/crm-queue` |
| Lọc "Gọi sau HT" | Tab *Cần gọi sau* |
| Cột trạng thái gọi trước/sau | Cột trạng thái trong hàng đợi + badge trong `BookingDetail` |
| Nhận gọi / Đã gọi / Không liên lạc được | `BookingDetail` mở từ `/crm-queue` (**không đổi luồng**) |
| Lịch sử cuộc gọi | `BookingDetail` (**không đổi**) |

- [ ] **Step 2: Xoá bộ lọc**

Xoá khối `[{ label: 'Gọi trước HT', ... }, { label: 'Gọi sau HT', ... }].map(...)` (dòng 1429-1449) cùng state `callBeforeFilter` / `callAfterFilter` / `customerCallFilter` (dòng 1127-1131), và gỡ chúng khỏi `FetchArgs`, `fetchBookings`, và **cả hai** mảng dependency `useEffect` (dòng ~1228-1237).

- [ ] **Step 3: Xoá 2 cột**

Xoá `<TableHead>Gọi trước HT</TableHead>` và `<TableHead>Gọi sau HT</TableHead>` (dòng ~1546-1547) cùng 2 `<TableCell>` tương ứng (dòng 1665-1684).

- [ ] **Step 4: Sửa `colSpan` — RẤT DỄ QUÊN**

Dòng 1381-1387, đổi `9` thành `7`:

```tsx
  // 2 cột gọi khách đã chuyển sang /crm-queue (CRM GĐ1) -> 9 xuống 7.
  const colSpan =
    7 + (activeTab === 'COMPLETED' ? 1 : 0) + (activeTab === 'CANCELLED' ? 3 : 0) + (showScheduledCol ? 1 : 0);
```

Quên bước này thì hàng "Đang tải / Lỗi / Không tìm thấy" lệch cột — và **không test nào bắt được**.

- [ ] **Step 5: Dọn import và mock thừa**

- Trong `bookings-table.tsx`: gỡ `import { CustomerCallBadge }` (Task 5 thêm vào để phục vụ đúng 2 cột vừa xoá — nó ở lại `booking-detail.tsx` cho `BookingDetail` dùng), gỡ khỏi dòng 40 những import api giờ không dùng (`recordBookingCustomerCall`, `getBookingCustomerCallHistory`, `getCustomerCallReasons` — chúng đã theo `BookingDetail` sang file mới), và gỡ type `CustomerCallStatus`/`CustomerCallFilter`/`BookingCustomerCallEvent` nếu không còn dùng. `npx tsc --noEmit` sẽ chỉ ra từng cái.
- Trong `bookings-table.test.tsx`: `getCustomerCallReasons` trong `vi.mock` (dòng 13) giờ thuộc về `booking-detail.tsx` — giữ nếu test vẫn render `BookingDetail`, xoá nếu không.

- [ ] **Step 6: Chạy đủ bộ kiểm**

Run: `npx tsc --noEmit && npx vitest run && npx next build`
Expected: sạch cả ba.

- [ ] **Step 7: Kiểm tay tại chỗ**

`npm run dev`, vào `/bookings`:
1. Hàng filter **không còn** 2 dropdown gọi.
2. Bảng **không còn** 2 cột gọi; đếm cột ở tab *Tất cả*, *Hoàn thành*, *Đã huỷ*, *Đặt lịch* — hàng "Không tìm thấy chuyến nào" phải trải đúng hết chiều ngang bảng ở **cả 4 tab**.
3. Mở chi tiết một chuyến → khối "Gọi check khách" **vẫn còn** (nó thuộc `BookingDetail`, `/crm-queue` dùng chung).

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/bookings/components/
git commit -m "refactor(bookings): gỡ phần gọi khách khỏi trang Chuyến đi

2 dropdown lọc + 2 cột trạng thái gọi chuyển sang /crm-queue. Giữ nguyên mọi
cột denormalize và tham số API — hàng đợi sống bằng chính chúng. colSpan 9->7.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Hoàn tất GĐ1

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run && npx next build` — sạch.
- [ ] **Step 2:** Push `feat/crm-queue`, merge vào `dev`.
- [ ] **Step 3: Test runtime trên DEV — cổng bắt buộc, người thật test:**
  1. Tạo một vai trò **chỉ có `crm-queue`**, gán cho một tài khoản thử. Tài khoản đó: vào được `/crm-queue`, **không** thấy và **không** vào được `/bookings`.
  2. Cả 4 tab trả đúng tập chuyến; tab *Việc của tôi* chỉ hiện việc **của chính mình** (nhờ 2 người cùng thử).
  3. Nhận gọi ở tab *Cần gọi trước* → dòng rời khỏi tab đó.
  4. Ghi kết quả gọi sau ở tab *Cần gọi sau* → dòng rời khỏi tab đó **và** khỏi tab *Quá hạn*.
  5. Vai trò cũ chỉ có `bookings` vẫn dùng `/bookings` bình thường (any-of không cắt quyền ai).
  6. **Chính CSKH** dùng thử một buổi và xác nhận không thiếu việc gì so với cách cũ.
- [ ] **Step 4:** PR `feat/crm-queue` → `main` (KHÔNG PR `dev → main`).
- [ ] **Step 5:** Merge → build production admin → resync `main → dev` → xoá nhánh feature.

---

## Sai khác so với spec — cần bạn xác nhận

1. **Tab "Cần gọi trước" sắp theo `createdAt ASC`, không phải `scheduledTime ASC NULLS LAST`** như spec §6.1. Lý do: chuyến thường (đi ngay — gấp nhất) có `scheduledTime` NULL, mà Postgres mặc định NULLS LAST cho ASC nên chúng sẽ bị đẩy xuống cuối hàng đợi. `createdAt ASC` = "chờ lâu nhất trước", luôn đúng và không cần đụng whitelist sort của backend. Nếu ops muốn ưu tiên theo giờ đón thì làm sau, cần thêm xử lý NULLS ở backend.
2. **Backfill của migration chỉ chạm hàng `CLAIMED`**, không phải toàn bộ lịch sử. `booking` là bảng nóng nhất; việc đã xong thì không tab nào hỏi "ai từng giữ".
3. **Ngưỡng "quá hạn" mặc định 24 giờ** (`CSKH_CALL_AFTER_OVERDUE_HOURS` trong `system_config`) — giả định của plan, ops đổi được ngay không cần deploy.
