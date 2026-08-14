# Thiết kế: % hoa hồng riêng cho tài xế trong Đội tài chuyên nghiệp

- Ngày: 2026-08-14
- Trạng thái: **BẢN 2 — đã qua review đối kháng, CHỜ DUYỆT**
- Repo đụng: `vigo-backend`, `vigo-admin` (KHÔNG đụng app tài xế / app khách)
- Tiếp nối: [2026-08-10-driver-team-design.md](./2026-08-10-driver-team-design.md)
- Phân loại rủi ro (CLAUDE.md 0.5.b): **CAO** — tiền/ví, số thuế, đa điểm chạm

> **Bản 2 sửa gì:** hai reviewer đối kháng độc lập tìm ra **5 CHẶN · 16 ĐÁNG SỬA · 12 GÓP Ý**.
> Tôi đã tự kiểm chứng lại từng điểm CHẶN bằng code thật trước khi nhận. Thay đổi lớn nhất:
> **quy tắc chia VAT phải đổi** (§4.4) — bản 1 sai, và cái sai đó làm bảng đối soát HTX
> lệch với dashboard tài chính ~20% tổng VAT. Xem §11 để biết 2 việc cần bạn quyết.

## 1. Yêu cầu

CEO: tài xế đã vào Đội tài chuyên nghiệp cần đặt được **% hoa hồng riêng**, mặc định
**0%**, chỉnh lại sau khi cần. Kèm theo: rà soát mọi nơi đang động vào commission.

## 2. Quyết định đã chốt

| # | Vấn đề | Chốt |
|---|---|---|
| Q1 | "Default 0%" nghĩa là gì | **VIGO thật sự KHÔNG thu hoa hồng** tài đó (không phải "chưa set") |
| Q2 | Áp cho chuyến nào | **Mọi chuyến** của tài đó — cả chuyến thường lẫn Vi-now |
| Q3 | Hiệu lực | **Chỉ chuyến mới**. Chuyến đã hoàn thành giữ nguyên số đã chốt |
| Q4 | Phần ăn chia với HTX | **HTX ăn đủ như cũ, VIGO chịu lỗ** |
| Q5 | Quyền sửa % | Phải có **CẢ** `driver-team` **VÀ** `settings.pricing` |
| Q6 | Tài rời "Trong team" | Mức riêng **mất hiệu lực ngay**. Số % vẫn lưu để mời lại thì khôi phục |

Số thực tế trên PROD (đã truy vấn DB, không lấy từ seed migration):

| Key | Giá trị |
|---|---|
| `BOOKING_COMMISSION_RATE` | `0.2` |
| `VINOW_COMMISSION_RATE` | `0.15` (seed migration ghi `0.10` — **đã bị đổi qua UI**) |
| `DRIVER_PERSONAL_INCOME_TAX_RATE` | `0.015` |
| `PRICING_VAT_PERCENT` | `8` |
| `transport_company.htxCommissionRate` | đa số `0.05`; nhiều HTX `0.00`; một HTX `0.06` |

12.619 tài xế, **5.450 (43%) thuộc HTX**. `driver_team_member` **hiện 0 dòng** → triển
khai không gây hồi quy cho ai.

## 3. Mô hình dữ liệu

```sql
ALTER TABLE "driver_team_member" ADD COLUMN "commissionRate" numeric(5,4) NULL;
ALTER TABLE "driver_team_member"
  ADD CONSTRAINT "chk_dtm_commission_rate" CHECK ("commissionRate" IS NULL
        OR ("commissionRate" >= 0 AND "commissionRate" <= 1));

-- Snapshot tại thời điểm nhận chuyến. CẢ HAI tỉ lệ, không chỉ mức riêng (xem §3.2).
ALTER TABLE "booking"          ADD COLUMN "driverCommissionRate"   numeric(5,4) NULL;
ALTER TABLE "booking"          ADD COLUMN "standardCommissionRate" numeric(5,4) NULL;
ALTER TABLE "multi_stop_order" ADD COLUMN "driverCommissionRate"   numeric(5,4) NULL;
ALTER TABLE "multi_stop_order" ADD COLUMN "standardCommissionRate" numeric(5,4) NULL;
```

Tất cả **thêm mới, NULL-able** — không xoá/đổi tên cột nào.

### 3.1 `numeric` trả về **chuỗi** — bắt buộc transformer

`pg` trả `numeric` dạng string. Viết `Number.isFinite(rate) ? rate : standard` với
`'0.0000'` → `isFinite('0.0000')` là **false** → im lặng rơi về mức chung ⇒ **tài team 0%
vẫn bị trừ đủ 20%, không lỗi, không log**.

Bắt buộc, theo đúng tiền lệ đã có ở `transport-company.entity.ts:45-51`:

```ts
@Column({ type: 'decimal', precision: 5, scale: 4, nullable: true,
  transformer: { to: (v) => v, from: (v) => (v == null ? null : Number(v)) } })
driverCommissionRate: number | null;
```

- Transformer trên **cả 5 cột**.
- Mọi `getRawMany()` (finance, htx dùng raw query — **KHÔNG đi qua transformer**) phải
  `Number(...)` tường minh.
- Tuyệt đối **không dùng `||`** để fallback. Chỉ `?? ` hoặc `=== null`. `0` là giá trị
  hợp lệ có nghĩa "miễn phí"; `||` biến nó thành "chưa set" — lệch 200.000đ/chuyến 1 triệu.
- Resolver `clamp(0, 1)` + `Number.isFinite` sau khi đã `Number()`.

### 3.2 Vì sao snapshot CẢ mức chuẩn `R`

Admin **được phép sửa `BOOKING_COMMISSION_RATE` từ UI** (nhóm settings "Giá & Hoa hồng").
Nếu chỉ snapshot `r`, sau này đổi `R` từ 0.2 → 0.25 sẽ tính lại `forgone`, `htxShareRate`,
`vigoVatRemit` cho **chuyến CŨ của tài team** → Q3 vỡ đúng ở nhóm chuyến mà tính năng này
sinh ra. Chuyến `NULL` tự khử (vì `r = R`), chỉ nhóm có mức riêng bị.

### 3.3 Ngữ nghĩa

- `driver_team_member.commissionRate`
  - `NULL` = chưa set → mức chung.
  - Có giá trị = mức riêng, **chỉ hiệu lực khi `stage = 'JOINED'`** (Q6).
  - Chuyển stage sang `JOINED` mà đang `NULL` → ghi `0.0000` (Q1), **kèm một dòng sự kiện**.
- `booking.*` / `multi_stop_order.*`: ghi **một lần** tại thời điểm nhận chuyến.
  `NULL` = chuyến cũ → mọi nơi đọc fallback về config hiện tại, **giữ nguyên hành vi cũ**.

Mức riêng nằm trên `driver_team_member` chứ không trên `driver`: cùng vùng bảo mật với ghi
chú đàm phán (spec 2026-08-10).

## 4. Công thức

`r` = mức của tài (đã chốt), `R` = mức chuẩn (đã chốt), `h` = `htxCommissionRate` của HTX.

### 4.1 HAI tỉ lệ, không phải một — chỗ chết người nhất

`computeTripEarnings` hiện chỉ có **một** trường `bookingCommissionRate`, nhưng nó điều
khiển **ba** thứ cần hai tỉ lệ khác nhau. Ai đọc "thêm tham số mức riêng" rồi truyền `r`
vào chỗ có sẵn sẽ làm **HTX mất 50.000đ/chuyến** — và **không test nào đỏ**, vì guard
`R > 0` nuốt lỗi thành số 0 thay vì nổ.

Chữ ký bắt buộc:

```ts
type TripEarningsRates = {
  /** = R, mức CHUẨN. Dùng cho: htxShareRate, standardCommission. */
  bookingCommissionRate: number;
  /** = r, mức của tài. Mặc định = bookingCommissionRate.
   *  Dùng cho: commissionAmount, vigoVatRemit, taxableEarnings, tripCashKept. */
  driverCommissionRate?: number;
  htxCommissionRate: number;
  pitRate: number;
  vatRate: number;
};
```

`driverCommissionRate ?? bookingCommissionRate` ⇒ mọi call-site cũ giữ nguyên hành vi.

### 4.2 Công thức

```
r = driverCommissionRate ?? bookingCommissionRate
R = bookingCommissionRate

commissionAmount     = round(priceAfterDiscount × r)          ← SỐ THỰC TRỪ VÍ TÀI XẾ
standardCommission   = round(priceAfterDiscount × R)
forgoneCommission    = standardCommission − commissionAmount   ← phần VIGO ưu đãi

platformIncomeStd    = max(0, standardCommission − discountAmount)
htxShareRate         = R > 0 ? clamp01(h / R) : 0             ← chia cho R, KHÔNG phải r
htxCommission        = round(platformIncomeStd × htxShareRate) ← KHÔNG ĐỔI (Q4)

platformIncomeAfterKm = max(0, commissionAmount − discountAmount)   ← giữ nghĩa CŨ: thực thu
vigoCommission       = (platformIncomeStd − htxCommission) − forgoneCommission  ← CÓ THỂ ÂM

taxableEarnings      = max(0, priceAfterDiscount − platformIncomeAfterKm)
personalIncomeTax    = round(taxableEarnings × pitRate)
tripCashKept         = max(0, priceAfterDiscount − commissionAmount − personalIncomeTax)
driverTotalReceived  = tripCashKept + driverDiscountBonus

vigoVatRemit         = round(vatAmount × r)      ← ĐỔI SO VỚI BẢN 1, xem §4.4
htxVatRemit          = vatAmount − vigoVatRemit
htxTotalReceived     = htxCommission + htxVatRemit + personalIncomeTax
vigoTotalReceived    = vigoCommission + vigoVatRemit
```

**`platformIncomeAfterKm` giữ nguyên nghĩa cũ = phần nền tảng THỰC THU sau khuyến mãi.**
Nó không phải biến nội bộ: được ghi vào `earningsBreakdown`, khai kiểu ở `booking.entity.ts:182`
và `vigo-admin/src/lib/types.ts:253`. Đổi nghĩa nó là đổi ngầm một trường client đang đọc.

### 4.3 Bất biến: `r = R` ⇒ không đổi một con số nào

Reviewer đã kiểm tay 5 ca gồm mọi ca biên (`D > commission`, `finalPrice = 0`, `h > R`,
`h = 0`, `R = 0`) — **khớp 100%** với công thức hiện tại. Lý do: `forgone = 0` và
`platformIncomeStd` với `platformIncomeAfterKm` kẹp trên cùng một số, nên mọi nhánh
`max(0, …)` rơi cùng phía.

Dòng tiền **cân** ở cả `r = R` lẫn `r = 0` (reviewer đã kiểm sổ hai chiều).

### 4.4 VAT — SỬA so với bản 1, cần bạn xác nhận

Bản 1 viết `vigoVatRemit = vatAmount × R` (giữ theo mức chuẩn). **Sai**, vì:

Bảng đối soát HTX ở admin **tự suy ra VAT** từ phí nền tảng thực thu, không dùng số
backend trả (`htx-recon-shared.ts:68-70`):

```ts
const appFeeBeforeVat = f.platformFeeGross;                  // = commissionAmount (theo r)
const appFeeVat       = round(appFeeBeforeVat * 0.08);       // cột 25 "VAT phí nền tảng VIGO"
const htxFareVat      = round((priceBeforeVat - f.platformFeeGross) * 0.08); // cột 21
```

Hai lăng kính khớp nhau **hôm nay chỉ vì `r = R`**. Giữ `× R` thì với `r = 0`:
bảng đối soát ký với HTX ghi VAT nền tảng = **0**, dashboard tài chính ghi **20% tổng VAT**.
Cùng một chuyến, hai chứng từ hai số.

Dùng `× r` thì hai bên **khớp nhau về mặt đại số**: `vatAmount × r = (0.08 × P) × r`, còn
`appFeeVat = 0.08 × (P × r)` — **cùng một biểu thức**. Không phải vá, mà là hết mâu thuẫn.

Và nó đúng về kế toán: VAT đầu ra đánh trên doanh thu thực xuất hoá đơn. VIGO thu 0đ hoa
hồng thì không có VAT đầu ra trên khoản đó; toàn bộ cước là doanh thu dịch vụ vận tải, VAT
theo về phía HTX/tài xế.

Vẫn thoả bất biến §4.3 (khi `r = R` thì `× r` ≡ `× R`).

→ **§11.2: cần bạn xác nhận với kế toán.**

### 4.5 Ví dụ

Chuyến 1.000.000đ (đã trừ VAT), VAT 80.000đ, tài thuộc HTX 5%, không khuyến mãi:

| | Mức chung 20% | Tài team 0% |
|---|---|---|
| Trừ ví tài xế | 200.000 | **0** |
| HTX nhận (hoa hồng) | 50.000 | **50.000** |
| VIGO (hoa hồng) | 150.000 | **−50.000** |
| VAT VIGO nộp | 16.000 | **0** |
| VAT HTX nộp | 64.000 | **80.000** |
| Thuế TNCN nộp hộ | 12.000 | **15.000** |
| Tài xế cầm về | 788.000 | **985.000** |

### 4.6 Số ÂM được phép ở đâu

Chỉ đúng những đại lượng này, **kể cả đại lượng FE tự cộng ra**:

- `vigoCommission`, `vigoTotalReceived` (backend)
- `platformFee = htxCommission + vigoCommission` (FE: `bookings-table.tsx:183`,
  `htx-recon-shared.ts:58`) — âm khi tài 0% **và có bất kỳ khuyến mãi nào**
- `driverDeductTotal`, và `driverIncome` có thể **lớn hơn cước** (`htx-recon-shared.ts:83`)
- Thẻ "Doanh thu VIGO" ở dashboard/finance

Mọi thứ khác phải `≥ 0`.

### 4.7 Nợ kỹ thuật CÓ SẴN, cố ý KHÔNG sửa đợt này

Khi `discountAmount > standardCommission`, `max(0, …)` làm bốc hơi `D − R·P`
(P=1.000.000, D=250.000, R=0.2 → lệch 50.000đ). **Đã lệch y hệt hôm nay** ở mức chung ⇒
không phải hồi quy. Cách sửa tự nhiên là bỏ kẹp `max(0,…)`, nhưng làm thế sẽ đổi số của
mọi chuyến có khuyến mãi lớn → vi phạm §10. **Giữ kẹp, ghi thành nợ riêng.**

## 5. Bản đồ điểm chạm

Đã đọc code thật từng chỗ, và đã đối chiếu với 2 review độc lập.

### A. Trừ tiền thật — mức riêng, ĐỌC TƯƠI trong transaction

| Điểm | File |
|---|---|
| `computeBookingCommission` | `booking.service.ts:861` |
| → accept | `:1040` |
| → admin gán lại (`reassignDriver`) | `:4246` |
| → xác nhận chuyến hẹn giờ (`confirmScheduleBooking`) | `:5050` |
| Vi-now claim — **bản sao inline** | `:1326-1339` |
| Đơn đặt hộ — `orderSettlement` **gọi 2 LẦN** | `multi-stop-lifecycle.service.ts:62` |
| → accept (trừ hoa hồng) | `:222` |
| → **complete (giữ hộ PIT + VAT)** | `:298` |

Việc phải làm:

1. `computeBookingCommission` nhận `driverId`, gọi resolver, **ghi cả `driverCommissionRate`
   và `standardCommissionRate` lên booking**.
2. Xoá khối inline Vi-now, gọi `computeBookingCommission` (đã kiểm: `claimVinow` lọc
   `isVinow: true` ở `:1210` nên `getCommissionRate(booking.isVinow)` ≡ `getCommissionRate(true)`
   — gom được, không đổi tiền).
3. `orderSettlement` nhận **tỉ lệ truyền vào**, không tự resolve. Lúc accept: resolve theo
   `driverId` rồi ghi snapshot. **Lúc complete (`:298`): ĐỌC SNAPSHOT
   `order.driverCommissionRate`, TUYỆT ĐỐI không resolve lại theo `driverId`.**

   Nếu bỏ qua điểm này: tài rời team giữa chừng → complete tính PIT theo mức khác mức đã
   trừ. Đơn 10.000.000đ lệch **30.000đ PIT**, và lệch theo **cả hai chiều** (tài nhận ở mức
   chung rồi được set 0% giữa chừng thì bị thu hai lần).

4. Guard `if (commission > 0)` ở accept, Vi-now claim và `confirmScheduleBooking`
   (hiện chỉ reassign `:4247` và multi-stop `:223` có guard — sau sửa là 5/5).

   **Nói rõ để người sau không gỡ nhầm:** guard này **không** bảo vệ dòng tiền —
   `deductDriverWallet` với `amount = 0` hôm nay đã không sinh dòng sổ nào (hai khối ghi
   ledger đều bọc `if (fromMain > 0)` / `if (fromDeposit > 0)`). Nó chỉ bỏ một `ensureWallet`
   và một socket ví số 0. **Chặn số dư nằm ở gate ký quỹ riêng** (`:988`, `:1276`, `:4234`,
   `:5027`), không nằm ở `deductDriverWallet` → guard không làm thủng gate.

**Gán lại tài**: `refundDriverCommission` hoàn bằng cách **đảo đúng từng dòng sổ**, chống
lặp bằng marker `(reverse #<id>)` đọc sau khi đã `pessimistic_write` lock → **rate-agnostic,
không phải sửa**. Reviewer đã diễn thử 4 vòng gán qua gán lại giữa tài 20% và tài 0%: ròng
= 0, không có kẽ hở rút tiền. **Nhưng phải ghi đè `driverCommissionRate` +
`standardCommissionRate` theo tài MỚI.**

⚠️ Cảnh báo cho người sau: `refundDriverCommission` (`wallet.service.ts:786-796`) tìm **mọi**
`PAYMENT` cùng `referenceId`, **kể cả** dòng `"Giữ hộ thuế: PIT … + VAT …"` (`booking.service.ts:1618`,
`multi-stop-lifecycle.service.ts:302`) — khác với `penalty-amount.util.ts` vốn bắt buộc lọc
theo mô tả. Hiện chưa với tới được vì reassign chặn trạng thái kết thúc (`:4195-4205`).
**Ai nới trạng thái reassign sau này phải xử lý chỗ này trước.**

### B. Chốt sổ lúc hoàn thành

`booking.service.ts:1537-1542` → ghi `earningsBreakdown` `:1662-1692`.

Thêm vào jsonb: `standardCommissionRate`, `forgoneCommission`.

**Bắt buộc ghi chú vào chính chỗ ghi:** sau thay đổi, `bookingCommissionRate = r` nhưng
`htxShareRate = clamp01(h / R)`. Ai suy ngược `htxShareRate = htxCommissionRate / bookingCommissionRate`
(công thức gốc đang được document ở `trip-earnings.util.ts:54`) sẽ nhận `0.05 / 0 = Infinity`.
→ **mẫu số của `htxShareRate` / `vigoShareRate` là `standardCommissionRate`.**

### C. API trả cho app tài xế / admin

`attachDriverEarnings` `:434`, `attachDriverEarningsList` `:448`, chi tiết chuyến `:2880-2885`.

### D. Ước lượng khi CHÀO chuyến — theo từng tài

`dispatch.processor.ts:197` và `schedule-confirm.processor.ts:40` (hai bản sao y hệt).

`buildOfferPayload(booking)` dựng **một payload rồi bắn cho nhiều tài** (`:481-487`, `:729-735`).
Để nguyên thì tài team 0% vẫn thấy "trừ hoa hồng 200.000đ" và có thể từ chối chuyến — hỏng
đúng mục đích tính năng.

Cách làm: giữ payload chung, **đè riêng `driverEarnings`** cho userId có mức riêng, lấy từ
bản đồ cache (§6.2).

⚠️ **KHÔNG "tiện tay sửa"**: hai processor này **chỉ** đọc `BOOKING_COMMISSION_RATE`, không
bao giờ đọc `VINOW_COMMISSION_RATE`, và dùng `booking.price` **thô** thay vì
`priceAfterDiscount`. Đó là sai có sẵn. Sửa nó sẽ đổi số hiển thị của **mọi** tài xế →
**ghi thành nợ riêng, đợt này không đụng.**

### E. Thu nhập tài xế nhìn thấy

`wallet.service.ts:165-180` (lịch sử ví), `drivers.service.ts:1268-1284` (doanh thu hôm nay).

Cả hai dùng `price` **thô** + một công thức thứ ba (`gross = price − commission`). Sửa rate
**giảm lệch nhưng KHÔNG hết lệch**: chuyến price 1.250.000 / D 250.000 / P 1.000.000 →

| | Hiển thị sau khi sửa rate | Thực nhận | Lệch |
|---|---|---|---|
| r = 0.2 | 985.000 | 785.000 | +200.000 |
| r = 0 | 1.231.250 | 985.000 | +246.250 |

Sai số **to thêm** với tài 0%. Chuyển sang `priceAfterDiscount` là **ngoài phạm vi** (đổi
số của MỌI tài xế) → nợ riêng. Đợt này chỉ sửa rate và **không hứa hết lệch**.

### F. Báo cáo admin — finance

`loadTripEarnings` `finance.service.ts:292-325`, `loadMultiStopEarnings` `:349-405`.

Đang **tính lại theo config hiện tại**. Không sửa thì Q3 không thành sự thật. Select thêm
2 cột snapshot, truyền vào `computeTripEarnings` (nhớ `Number()` — `getRawMany` không qua
transformer).

**Bổ sung — bảng đối soát HTX của admin** (`listHtxReconciliation` `:765-810`,
`listHtxTrips` `:812-850`): hằng đẳng thức `platformFeeGross − km = htxCommission + vigoCommission`
(chú thích `:752-757`) **vẫn đúng về số**, nhưng **đọc lên thì vô lý**: chuyến 1.000.000đ của
tài 0% cho dòng `platformFeeGross = 0`, `km = 0`, mà `htxCommission = 50.000`,
`vigoCommission = −50.000`. Người đối soát sẽ hỏi "phí nền tảng 0đ sao HTX ăn 50.000?".

→ Thêm `standardFeeGross` (Σ `standardCommission`) và `forgoneCommission` vào `HTX_SUM_KEYS`
(`:751`) để dòng tự giải thích.

### G. Portal HTX

| Điểm | File |
|---|---|
| Danh sách tài của HTX | `htx.service.ts:196-232`, `lifetimeIncome` `:249` |
| Dashboard HTX | `htx.service.ts:612-663` |

⚠️ **Đây là phần việc LỚN, không phải đổi một hằng số.** Query hiện `GROUP BY b.driverId`
rồi nhân rate lên **số tổng** (`:212`):

```ts
.addSelect('SUM(CASE WHEN b."isVinow" THEN b.price ELSE 0 END)', 'vinowGross')
.groupBy('b.driverId')
const commission = gross * commissionRate;   // rate theo chuyến KHÔNG áp được lên tổng
```

Phải viết lại: bỏ `GROUP BY` (per-booking) hoặc `GROUP BY b.driverId, b."driverCommissionRate"`.
Có ảnh hưởng hiệu năng — `lifetimeIncome` chạy cho **toàn bộ** tài của một HTX, **không giới
hạn thời gian**.

**HTX sẽ thấy hai thay đổi, cả hai đều là "hiển thị đúng sự thật":**
- `commissionAmount` và `effectiveRate` **giảm**.
- **PIT nộp hộ TĂNG ~25%** (12.000 → 15.000 trên chuyến 1 triệu), vì `grossEarnings =
  gross − commission` lớn hơn. HTX chính là bên nộp hộ PIT → đây là số họ hỏi ngay.

`htxCommissionAmount = grossRevenue × tc.htxCommissionRate` tính **độc lập** → **tiền HTX
tự ăn không đổi**, đúng Q4.

Nếu để nguyên 20%, portal HTX báo tài xế đã nộp khoản chưa hề nộp — HTX có thể đi đòi tài xế.
Hiển thị đúng an toàn hơn.

### G′. Admin — các màn bị bỏ sót trong bản 1

| Điểm | File | Vấn đề |
|---|---|---|
| Chi tiết chuyến | `bookings-table.tsx:191` | `hasNewSplit = htxCommission > 0 \|\| vigoCommission > 0` → tài 0% **không HTX** cho `0/0` → rơi nhánh **legacy** (dành cho chuyến trước migration `1782000000000`), mất ô "Tổng kiểm tra". Sửa: kiểm **sự tồn tại của trường**, không kiểm dấu |
| Chi tiết chuyến | `bookings-table.tsx:183, ~214` | in `-{fmtVnd(platformFee)}` → `platformFee` âm ra `--40.000` (hai dấu trừ) |
| Đối soát HTX | `htx-recon-shared.ts:58-96` | xem §4.4 — dùng `× r` thì tự khớp, **không phải vá FE**. Vẫn cần test cho `vigoCommission` âm |
| Stats công ty vận tải | `transport-companies-table.tsx:821` | `commissionAmount` cùng nguồn dashboard HTX ⇒ cũng tụt. Đây là màn **admin**, không phải portal |
| Thẻ "Doanh thu VIGO" | `finance-stat-cards.tsx:35`, `dashboard/page.tsx:149` | gán cứng `green` ⇒ số **âm vẫn xanh lá**. Đổi màu theo dấu + hint khi âm |
| Biểu đồ drilldown | `finance-drilldown-chart.tsx:68` | `<Bar radius={[3,3,0,0]}>` — recharts **không lật** radius cho bar âm ⇒ vẽ ngược. Đặt `radius={0}` |

### H. Đã rà — KHÔNG đụng

- **Hoá đơn**: `invoice-utils.ts` chỉ dùng `totalWithVat`/`vat`/`vatInfo`;
  `INVOICE_EXPORT_HEADERS` không có cột hoa hồng. **Mức riêng không ảnh hưởng hoá đơn.**
- **Phạt huỷ chuyến**: parse chuỗi mô tả dòng sổ (`penalty-amount.util.ts:84-130`,
  `driver-penalty.sql.ts:243-245`). **Format `"... Commission (N)"` giữ nguyên TUYỆT ĐỐI.**
  Xem §11.1.
- **Hoa hồng đại lý / KOL** — cơ chế khác hẳn.
- **App tài xế / app khách**: không sửa.
- Đã grep toàn `vigo-backend` (script/, cron, scheduler, seed, overview, analytics, cskh,
  leakage, telegram): **không còn chỗ nào khác** đọc 2 key config này.

### H′. Hành vi mới cần biết trước

- **`driver-cashflow`**: tài 0% không sinh dòng sổ hoa hồng → chuyến có doanh thu mà không
  có dòng "Trừ hoa hồng" (`finance.service.ts:613-628` phân loại bằng mô tả ledger). Không
  sai, nhưng là hành vi mới của một màn đối soát.
- **Log nhiễu**: `wallet.service.ts:802` log WARN `"no un-reversed PAYMENT to refund"` mỗi
  lần tài 0% huỷ / được gán lại (4 call-site). Hạ mức log khi rate = 0, kẻo CloudWatch đầy
  cảnh báo giả.

## 6. Gom nợ kỹ thuật — làm cẩn thận, đúng thứ tự

### 6.1 CHÍN bản sao đọc tỉ lệ (bản 1 đếm nhầm 8)

`booking.service.ts:133`, `wallet.service.ts:236`, `drivers.service.ts:1288`,
`finance.service.ts:293`, `htx.service.ts:206`, `htx.service.ts:612`,
`dispatch.processor.ts:197`, `schedule-confirm.processor.ts:40`,
`multi-stop-lifecycle.service.ts:64`.

### 6.2 Service duy nhất

```
src/commission/commission.module.ts
src/commission/driver-commission.service.ts
src/commission/driver-commission-display.service.ts   ← TÁCH RIÊNG, cố ý
```

Module **độc lập**: chỉ phụ thuộc `DataSource` + `MasterDataService`, đọc
`driver_team_member` bằng SQL thô. Cố ý **KHÔNG** import `DriverTeamModule` (module đó kéo
theo controller + guard admin) → tránh vòng phụ thuộc khi 9 module khác import vào.

```ts
// DriverCommissionService — dùng được ở luồng tiền
standardRate(isVinow): Promise<number>
effectiveRate(driverId, isVinow, manager?): Promise<{ rate, standardRate, isCustom }>

// DriverCommissionDisplayService — CHỈ hiển thị/ước lượng
customRateMapByUserIdForDisplayOnly(): Promise<Map<string, number>>   // cache TTL 10s
```

```sql
SELECT m."commissionRate"
  FROM driver_team_member m
 WHERE m."driverId" = $1
   AND m.stage = 'JOINED'
   AND m."commissionRate" IS NOT NULL
```

`stage = 'JOINED'` nằm **trong chính câu truy vấn** → Q6 được bảo đảm ở tầng dữ liệu,
không phụ thuộc caller nhớ kiểm tra.

**Rào chắn chống dùng nhầm cache cho việc trừ tiền:**
- Tên hàm tự tố cáo (`...ForDisplayOnly`), đặt ở **class/file khác**.
- **Test tĩnh** cấm `booking.service.ts` / `multi-stop-lifecycle.service.ts` import
  `DriverCommissionDisplayService` (theo mẫu `route-coverage.spec.ts`).
- **Xoá cache ngay** khi PATCH rate hoặc đổi stage — nếu không CEO sửa % rồi bấm thử, thấy
  số cũ, tưởng hỏng.

**Nói đúng về cache, đừng nói quá:** mức **CHUẨN** `R` đi qua cache 5s của
`MasterDataService.getSystemConfig` **ngay hôm nay** — kể cả trong luồng trừ tiền. Chỉ mức
**RIÊNG** là đọc tươi. Dispatch chạy ở **process riêng, nhiều ECS task** ⇒ mỗi task một
`Map` ⇒ trong ≤10s hai tài cùng chuyến có thể thấy hai số ước lượng khác nhau. **Chấp nhận
được, và là hành vi mong đợi** — nhưng phải ghi ra, kẻo người sau debug lệch tiền tin nhầm.

### 6.3 `BookingService.buildDriverEarnings` là bản sao của `computeTripEarnings`

**Đã kiểm chứng bằng diff sau khi chuẩn hoá khoảng trắng và chú thích**: giống nhau **từng
phép tính**, chỉ khác chữ ký, tiền tố `this.`, và cách tham chiếu `DRIVER_DISCOUNT_BONUS_RATIO`.

**Thứ tự bắt buộc — không được gộp bước:**

1. Viết test so sánh hai hàm trên input ngẫu nhiên + các ca biên (`D > commission`,
   `finalPrice = 0`, `price = 0`, `h = 0`, `h > R`, `R = 0`). **PASS trước khi xoá.**
2. Xoá bản sao, trỏ mọi call-site sang `computeTripEarnings`.
3. Chạy lại toàn bộ test cũ — **mọi con số y nguyên**.
4. Chỉ SAU khi 1–3 xanh mới thêm **`driverCommissionRate`** (§4.1) — và chỉ thêm tham số,
   **không** đụng `VINOW`/`priceAfterDiscount` của dispatch (§5D).

Không được vừa gom vừa đổi công thức: nếu số lệch thì không biết do gom hay do đổi.

## 7. Quyền & nhật ký

### 7.1 RBAC hiện tại KHÔNG diễn đạt được Q5 — phải mở rộng hạ tầng

Đã kiểm code thật (`function-access.guard.ts:12-26`):

```ts
const required = this.reflector.getAllAndOverride(REQUIRE_FUNCTION_KEY, [
  ctx.getHandler(), ctx.getClass(),          // ← method GHI ĐÈ class
]);
if (required.some((f) => eff.has(f))) return true;   // ← OR, không phải AND
```

Hai hệ quả:
- `@RequireFunction('driver-team','settings.pricing')` → **chỉ cần MỘT** trong hai.
- Đặt `@RequireFunction('settings.pricing')` ở method → **vứt bỏ** metadata `driver-team`
  của class (`driver-team-admin.controller.ts:41`) → tài khoản chỉ có quyền chỉnh giá
  vừa sửa được % hoa hồng, **vừa lọt vào vùng dữ liệu riêng của đội tài**.

**Phải làm:**
- Thêm `REQUIRE_ALL_FUNCTIONS_KEY` + `@RequireAllFunctions(...)`, guard dùng `every()`.
- Hợp nhất metadata class + method (hoặc tách endpoint sang controller riêng để không bị
  ghi đè).
- `route-coverage.spec.ts` hiện **chỉ** kiểm "có decorator + có guard", **không** kiểm ngữ
  nghĩa AND → phải thêm assert riêng cho endpoint này.

### 7.2 Nhật ký

- Mỗi lần đổi ghi một dòng `driver_team_event` bất biến: ai, từ mấy % sang mấy %, lúc nào.
- Chuyển stage sang `JOINED` mà **tự động** ghi `0.0000` cũng phải ghi một dòng — nếu
  không sẽ có tài hưởng 0% mà không ai nhớ vì sao.

## 8. Màn admin

Trong ngăn kéo chi tiết tài:

- Ô **"% hoa hồng riêng"**, chỉ hiện khi stage = Trong team. Thiếu quyền → chỉ-đọc kèm lý do.
- Cảnh báo đỏ khi mức riêng < mức chuẩn, nêu số cụ thể.
- Nhật ký thay đổi ngay trong ngăn kéo.

Ở đầu màn, **HAI thẻ tách bạch** (bản 1 gộp làm một, cho hai con số lệch nhau 4 lần trên
cùng một chuyến — chốt chặn mà mập mờ đơn vị thì phản tác dụng):

| Thẻ | Công thức | Chuyến 1 triệu, tài 0% |
|---|---|---|
| **Doanh thu bỏ qua** | Σ `forgoneCommission` | 200.000đ |
| **Lỗ tiền mặt** (VIGO móc túi trả HTX) | Σ `max(0, −vigoCommission)` | 50.000đ |

**Nguồn số — KHÔNG quét jsonb.** `earningsBreakdown` không có ai đọc, chỉ tồn tại ở chuyến
`COMPLETED` **sau** deploy, `multi_stop_order` **không có** cột đó, và
`SUM((earningsBreakdown->>'forgoneCommission')::numeric)` trên bảng `booking` là truy vấn
nặng không index.

→ Tính từ `driverCommissionRate` + `standardCommissionRate` ngay trong `loadTripEarnings`
(đã load sẵn mọi chuyến trong kỳ), trả qua endpoint finance. Thẻ **bao gồm** đơn đặt hộ
(vì `loadMultiStopEarnings` nằm cùng chỗ). Ghi rõ thẻ chỉ đếm chuyến **đã hoàn thành**.

## 9. Tương thích ngược (CLAUDE.md mục 4)

- 5 cột DB **thêm mới, NULL-able**; `earningsBreakdown` chỉ **thêm** trường.
- **Chặn rò rỉ trường ra response** — thêm cột vào entity `Booking` là thêm field vào **mọi**
  response trả nguyên booking: `buildOfferPayload` dùng `...booking`
  (`dispatch.processor.ts:158-160`), `booking.service.ts:851` `return { ...booking, shareLink }`,
  `attachDriverEarningsList`. Payload `new_booking_request` sẽ mang `driverCommissionRate`.
  Ngoài chuyện tương thích, đây là **rò rỉ vùng dữ liệu riêng** (§3.3) ra app tài xế và mọi
  client. → **phải loại 2 field ở tầng serialize.**
- **Đã kiểm chứng, không ghi suông**: grep `disallowUnrecognizedKeys` trong
  `vigo-driver/lib` và `vigo/lib` → **0 kết quả**. Thêm field mới an toàn.
- **Không thêm loại giao dịch mới** — `TransactionType` trong app tài xế **ném lỗi** khi
  gặp giá trị lạ (`transaction_dto.dart:17-18`).
- Không đổi shape request body của endpoint nào đang có.
- Format mô tả dòng sổ `"... Commission (N)"` giữ nguyên tuyệt đối.

## 10. Kế hoạch kiểm thử

**Bất biến số 1 — `r = R` thì không đổi gì.** Toàn bộ spec commission hiện có phải PASS
**không sửa một con số nào**: `booking.service.spec.ts` (`EXPECTED_COMMISSION = 18400`),
`booking.service.reassign.spec.ts`, `multi-stop-lifecycle.service.spec.ts`,
`wallet.service.spec.ts`, `finance.service.*.spec.ts`, `htx.service.trips.spec.ts`,
`driver-penalty/*.spec.ts`.

> **Phải sửa một con số nào trong các file này = dấu hiệu thiết kế sai. DỪNG, báo user.
> Không sửa test cho khớp code.**

Ca mới:

1. Tài 0%, không HTX → trừ ví 0đ, `vigoCommission = 0`, `htxCommission = 0`.
2. Tài 0%, HTX 5% → trừ ví 0đ, `htxCommission` **y hệt** mức chung, `vigoCommission` **âm**.
3. Tài 0%, HTX 5% → **`htxVatRemit` và `vigoVatRemit`** đúng theo §4.4 *(bản 1 thiếu ca này
   — chính là lỗ hổng để CHẶN-2 lọt qua)*.
4. Tài 10%, HTX 5%, chuẩn 20% → `htxCommission` không đổi, `vigoCommission` giảm đúng `forgone`.
5. Tài 0% + khuyến mãi > hoa hồng → không có số âm ngoài danh sách §4.6.
6. Vi-now với tài có mức riêng → dùng mức riêng, không dùng `VINOW_COMMISSION_RATE`.
7. Đổi mức riêng **sau khi** chuyến hoàn thành → số chuyến cũ không đổi (khoá Q3).
8. **Đổi `BOOKING_COMMISSION_RATE` sau khi chuyến hoàn thành** → số chuyến cũ không đổi
   (khoá §3.2).
9. **Đơn đặt hộ: đổi mức riêng GIỮA accept và complete** → PIT/VAT giữ hộ theo mức lúc
   accept (khoá CHẶN-1).
10. Chuyển stage khỏi `JOINED` → chuyến mới về mức chung, chuyến cũ giữ nguyên (Q6).
11. `driverCommissionRate = NULL` → mọi báo cáo ra số y hệt trước.
12. **`NULL` và `0` cạnh nhau trên cùng một tài** — đọc từ **DB thật** (mẫu:
    `driver-team.sql.integration.spec.ts`), khoá lỗi `numeric`→string ở §3.1.
13. Gán lại tài giữa tài 20% và tài 0%: tài cũ hoàn đúng số đã trừ, tài mới trừ theo mức
    của mình, snapshot ghi đè theo tài mới.
14. Guard: thiếu `settings.pricing` → 403; thiếu `driver-team` → 403; có cả hai → 200.
15. Dispatch: payload mời chuyến cho tài có mức riêng hiện đúng số của tài đó.
16. FE: `hasNewSplit` với `0/0` vẫn vào nhánh mới; `platformFee` âm không in hai dấu trừ.
17. `htx-recon-shared.test.ts`: ca `vigoCommission` âm, kiểm `customerTotal == grossRevenue`.

Kiểm tĩnh: `TZ=UTC npx tsc --noEmit && TZ=UTC npx jest` (backend);
`npx tsc --noEmit && npx vitest run` (admin).

## 11. CẦN BẠN QUYẾT trước khi code

### 11.1 Tài team 0% sẽ không thể bị phạt huỷ chuyến

Cơ chế phạt = thu lại đúng khoản hoa hồng của chuyến bị huỷ. Không có hoa hồng → hệ thống
trả lý do `NO_COMMISSION` và chặn phạt. Tài team có thể huỷ chuyến mà không mất gì.

1. **Chấp nhận** — đội do CEO trực tiếp chăm, xử lý bằng quan hệ. *(khuyến nghị đợt 1)*
2. Phạt theo **mức chuẩn** dù được ưu đãi — giữ răn đe, nhưng mâu thuẫn với "0% hoa hồng".
3. Mức phạt riêng cho tài team — thêm phạm vi, để đợt sau.

### 11.2 Xác nhận quy tắc VAT (§4.4)

Bản 1 giữ `vigoVatRemit = vatAmount × R`; bản 2 đổi thành `× r`. Lý do kỹ thuật vững (hết
mâu thuẫn giữa bảng đối soát HTX và dashboard tài chính, và đây là quan hệ **đại số**, không
phải vá). Nhưng đây là **số thuế**, không phải số hiển thị:

- `× r`: VIGO nộp VAT đầu ra **0đ** trên chuyến của tài 0%; toàn bộ VAT cước về phía HTX.
- `× R`: VIGO nộp 16.000đ VAT trên chuyến 1 triệu **dù không thu đồng hoa hồng nào** — và
  bảng đối soát ký với HTX sẽ ghi con số khác dashboard.

**Cần kế toán xác nhận.** Tôi khuyến nghị `× r`.

## 12. Ngoài phạm vi (đã cân nhắc, cố ý không làm)

- Truy thu / hoàn tiền chuyến đã hoàn thành khi đổi mức (Q3).
- Mức riêng theo tuyến / loại xe; hẹn giờ hiệu lực.
- `wallet.service` + `drivers.service` dùng `priceAfterDiscount` thay `price` thô (§5E).
- Dispatch offer đọc `VINOW_COMMISSION_RATE` + `priceAfterDiscount` (§5D).
- Bỏ kẹp `max(0, …)` khi khuyến mãi > hoa hồng (§4.7).
- Lọc theo mô tả trong `refundDriverCommission` (§5A).
- **`accept()` trừ tiền ngoài transaction** (`booking.service.ts:1035` không truyền
  `manager`, khác reassign `:4249` và multi-stop `:229`). Reviewer nêu lo ngại rằng sau
  thay đổi, hỏng giữa chừng sẽ khiến `complete()` tính PIT theo mức khác mức đã trừ.
  **Đã kiểm lại: không đúng.** Nếu `manager.save(booking)` hỏng thì cả txn ngoài rollback →
  booking **không** ở trạng thái ACCEPTED → không bao giờ tới `complete()`. Hậu quả duy
  nhất vẫn là dòng PAYMENT mồ côi, **y như hôm nay**. Và snapshot rate được ghi bằng chính
  `manager.save(booking)` nên nó **nguyên tử với việc nhận chuyến**. Sửa lock ordering
  trong luồng tiền là thay đổi đáng làm nhưng đáng có review riêng.

Cả 7 đều là nợ **có sẵn**. Sửa kèm sẽ đổi số của mọi tài xế và làm vỡ bất biến §10 → không
còn cách nào biết thay đổi này có an toàn hay không.

## 13. Triển khai

1. Backend `feat/driver-commission` → `dev` → **test trên DEV** (cổng bắt buộc).
2. Admin `feat/driver-commission` → `dev` → test trên DEV.
3. PR `feat → main` từng repo, **backend trước**.
4. **Migration**: `ADD COLUMN … NULL` không DEFAULT trên PG 11+ là metadata-only, **không
   rewrite bảng**. Nhưng vẫn cần `ACCESS EXCLUSIVE`: nếu có query dài đang chạy trên
   `booking` (dashboard tài chính quét 365 ngày — `finance.service.ts:291` `getMany()`
   **không phân trang**), ALTER xếp hàng và **mọi đọc/ghi `booking` xếp hàng sau nó** → app
   tài xế đứng hình.

   → Bắt buộc `SET LOCAL lock_timeout = '5s'` (theo tiền lệ
   `1793000200000-AddLeakageTraceNotifiedAt.ts:32`), chạy ngoài giờ cao điểm, retry được.

   `CHECK` constraint trên `driver_team_member` an toàn vì bảng đang 0 dòng — **không copy
   pattern đó sang `booking`**.
5. Resync `main → dev` cả hai repo.

Không cần thao tác tay ngoài cửa sổ deploy. Không cần phát hành app tài xế.
