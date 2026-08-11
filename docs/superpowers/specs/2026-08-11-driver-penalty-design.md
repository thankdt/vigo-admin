# Phạt tài xế vi phạm — thu lại commission chuyến (`/driver-penalties`) — Design

**Ngày:** 2026-08-11 · **Repos:** `vigo-backend` (rollout TRƯỚC) + `vigo-admin` · **App tài xế: KHÔNG đổi**
**Nguồn yêu cầu:** CEO Vigo · **Trạng thái:** đã qua 1 lượt review đối kháng (fresh-context), đã sửa

> "Trên admin tôi cần 1 chức năng phạt tài xế vi phạm, sau khi xác minh tài xế đó vi phạm cần
> phạt bằng cách thu tiền commission của chuyến đó mà không phải huỷ là trả lại nữa."
>
> "Màn hình phạt riêng cần có tổng hợp các chuyến huỷ sau khi có tài, huỷ mà bị nghi ngờ, huỷ mà
> có vi phạm… ở màn này chỉ phục vụ việc phạt thôi; phạt không để ở màn chuyến đi, quá nhiều chức
> năng và để phân quyền cho dễ."
>
> "Chúng ta chỉ cần biết họ có commission ở chuyến đó là bao nhiêu và phạt bấy nhiêu thôi."

---

## 1. Vấn đề

Commission bị trừ ví tài xế **ngay lúc NHẬN chuyến** (`booking.service.ts:1038` →
`deductDriverWallet`, chiến lược `MAIN_FIRST`: ví thưởng trước, ví ký quỹ sau). Khi chuyến bị huỷ,
`refundDriverCommission` (`wallet.service.ts:755`) **tự động hoàn** đúng số đó về đúng ví đã trừ.

Cơ chế này đúng cho huỷ bình thường, nhưng **thưởng cho tài xế vi phạm**: bùng khách, chở khách
ngoài app, ép khách huỷ… → chuyến bị huỷ → hệ thống trả lại commission → tài xế không mất gì.

Cần: sau khi admin **xác minh có vi phạm**, thu lại đúng khoản commission của chuyến đó.

---

## 2. Phạm vi

### Trong phạm vi

- Bảng `driver_penalty` + luồng phạt / huỷ phạt, an toàn double-tap.
- Trang admin `/driver-penalties`: hàng đợi chuyến huỷ cần soát + lịch sử phạt.
- Nút phạt nhúng thêm ở `/driver-cancel-review` và `/leakage-review`.
- Function RBAC mới `driver-penalties`.
- Thêm nhóm `penalty` vào báo cáo `driver-cashflow` (bắt buộc — xem §4.8).
- Thông báo cho tài xế qua kênh **đã có sẵn**.

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Khung kỷ luật luỹ tiến (×2, ×3 khi tái phạm) | Đợt này **chốt cứng 1× commission** |
| Phạt chuyến `COMPLETED` / chuyến đã `void` | Đã có công cụ `void` riêng; xem §4.6 |
| Phạt đơn "đặt hộ" nhiều điểm (`multi_stop_order`) | Dữ liệu ở bảng khác, không nằm trong `booking` |
| Phạt tài xế **đã bị gán chuyến đi cho người khác** | Hàng đợi xoay quanh tài xế hiện tại của chuyến |
| Tự động phạt theo verdict rò rỉ | **Luôn** cần người xác minh |
| Tài xế khiếu nại trong app | Đợt sau |

---

## 3. Quyết định đã chốt với CEO

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | Case chính: chuyến **ĐÃ huỷ**, commission đã tự hoàn → **thu lại** | Không làm luồng "huỷ kèm phạt" |
| 2 | Số tiền = **commission của chuyến đó, đúng 1 lần**, admin **không sửa được** | Không gõ tay ⇒ không sai số |
| 3 | Ví không đủ tiền → **cho ví ký quỹ âm = ghi nợ** | Cổng nhận chuyến chặn tới khi nạp bù (§4.4) |
| 4 | **Không** mật khẩu cấp 2 — thay bằng quyền RBAC riêng | Ghi rõ người thực hiện ở mọi vụ |
| 5 | **Bắt buộc chọn lý do** vi phạm | Phục vụ thống kê + đối chất |
| 6 | **Cho huỷ phạt** (hoàn lại tiền) | Bản ghi giữ lại, đổi trạng thái, không xoá |
| 7 | **Thông báo cho tài xế** | App tài xế không cần release |
| 8 | Nút phạt ở 2 màn soát **ăn theo quyền vào màn** | ⇒ endpoint tạo phạt gate any-of 3 quyền + scope ở service (§6) |
| 9 | Màn phạt **không** đặt ở `/bookings` | Trang riêng để tách quyền |
| 10 | Chuyến qua nhiều vòng nhận→huỷ vẫn chỉ phạt **1×** | Các vòng trước đã trừ–hoàn cân bằng, không liên quan |

---

## 4. Cơ chế tiền (phần rủi ro cao nhất)

### 4.1 Nguyên tắc

**Một chuyến = một khoản commission = một lần phạt.**

Số tiền phạt **không tính lại theo công thức** mà lấy **con số lịch sử thật** từ ledger: khoản
commission đã bị trừ ví ở lần tài xế nhận chuyến gần nhất. Ba lý do:

1. Tỉ lệ commission đọc từ `system_config` và **thay đổi được** (`getCommissionRate`,
   `booking.service.ts:131`). Tính lại sẽ phạt chuyến cũ theo tỉ lệ mới.
2. Xác nhận tài xế **thực sự đã bị trừ và đã được hoàn** — chuyến huỷ trước khi có tài nhận thì
   không có gì để phạt.
3. Tránh nhầm sang các khoản khác cùng `referenceId` — đặc biệt là **tiền thuế** (§4.3).

### 4.2 Lấy số tiền phạt

⚠️ **Một lần trừ commission có thể là HAI dòng ledger.** `deductDriverWallet` tiêu ví thưởng trước
rồi ví ký quỹ, và ghi **mỗi ví một dòng** với hậu tố `" (Main)"` / `" (Deposit)"`
(`wallet.service.ts:639`, `:658`). Lấy "dòng gần nhất" là lấy thiếu một nửa.

```
Bước 1 — tìm các dòng trừ commission của chuyến:
   type = PAYMENT
   AND referenceId = :bookingId
   AND sourceWalletId IN (<DRIVER_MAIN>, <DRIVER_DEPOSIT> của tài xế hiện tại của chuyến)
   AND destWalletId  = <SYSTEM_REVENUE>
   AND (description LIKE 'Booking Commission%' OR description LIKE 'Vi-now Commission%')
   ORDER BY id DESC

Bước 2 — gom LẦN TRỪ GẦN NHẤT: lấy tối đa 2 dòng đầu, và chỉ giữ dòng thứ hai khi nó
         KHÁC ví với dòng thứ nhất VÀ có cùng "mô tả gốc" (bỏ hậu tố " (Main)"/" (Deposit)").
         Một lần trừ sinh tối đa 1 dòng Main + 1 dòng Deposit ⇒ cắt ở 2 dòng là không bao giờ
         cộng nhầm sang vòng nhận–huỷ trước đó.

Bước 3 — amount = tổng các dòng vừa gom.

Bước 4 — ĐỐI CHIẾU: mô tả gốc luôn nhúng sẵn tổng commission, dạng "… Commission (<N>)".
         Assert amount == N. Lệch ⇒ KHÔNG tự động phạt, báo "dữ liệu ledger bất thường".
         (Dùng N để kiểm, không dùng N làm số tiền — format description đổi thì vỡ TO,
          không vỡ âm thầm.)

Bước 5 — xác nhận đã được hoàn: mỗi dòng ở bước 2 phải có một dòng REFUND cùng referenceId,
         source = SYSTEM_REVENUE, dest = ví tài xế, description chứa "(reverse #<id dòng đó>)".
```

Các chuỗi `'Booking Commission%'` / `'Vi-now Commission%'` là **đúng chuỗi** code sinh ra:
accept `booking.service.ts:1044`, Vi-now `:1337`, và **admin gán lại tài xế** `:4201`
(`"Booking Commission (admin reassign) (12345)"` — vẫn khớp tiền tố). Đây là điều kiện quan trọng
nhất — xem tiếp.

### 4.3 Ba cái bẫy có thật trong repo (bộ lọc phải né đủ cả ba)

| Bẫy | Vì sao nguy hiểm | Điều kiện né |
|---|---|---|
| **Tiền thuế PIT/VAT** — chuyến tiền mặt hoàn thành ghi `deductDriverWallet(… 'Giữ hộ thuế: PIT x + VAT y' …)` **cùng `referenceId = bookingId`, cùng chiều ví** (`booking.service.ts:1617`). Khi admin `void` chuyến, `refundDriverCommission` **quét mọi dòng PAYMENT** rồi hoàn cả thuế, sau đó đặt `status = CANCELLED` (`:3857`) ⇒ chuyến lọt vào hàng đợi phạt | Phạt **gấp ~3 lần** và thu 2 lần cùng một khoản thuế tài xế đã nộp hộ khách | `description LIKE 'Booking Commission%'` + loại chuyến từng hoàn thành (§4.6) |
| **`clawbackDriverPromo`** (`wallet.service.ts:1406`) ghi `REFUND` + dấu `(reverse #…)` cùng `referenceId = bookingId` (hoa hồng đặt hộ) | Nhầm là khoản hoàn commission | Dòng của nó chạy **ví tài xế → SYSTEM_EXTERNAL** (ngược chiều) ⇒ điều kiện `dest = SYSTEM_REVENUE` ở bước 1 và `source = SYSTEM_REVENUE` ở bước 3 loại đúng |
| **`adminAdjustDriverWallet`** ghi `PAYMENT` ví tài xế → hệ thống | Nhầm là commission | `referenceId = 'admin:<id>'`, không khớp `bookingId` |

### 4.4 Ghi sổ khi phạt — DÙNG LẠI hàm đã chạy production

**Không viết code trừ ví mới.** Gọi đúng hàm hệ thống đang dùng:

```ts
walletService.deductDriverWallet(
  driverUserId,
  amount,
  `penalty:${penaltyId}`,                    // referenceId — KHÔNG phải bookingId
  `Phạt vi phạm — thu lại hoa hồng chuyến ${bookingCode}`,
  true,                                      // allowNegative — ví ký quỹ được đi âm
  manager,                                   // cùng transaction với việc tạo driver_penalty
  { strategy: 'MAIN_FIRST' },
)
```

Được 4 thứ miễn phí, không phải tự làm lại:

- **Đúng thứ tự ví**: tiêu ví thưởng trước rồi tới ví ký quỹ — **đối xứng với lúc trừ commission ở
  accept**, nên tài xế mất đúng thứ họ được hoàn.
- **Giữ invariant `MAIN > 0 ⟹ DEPOSIT ≥ 0`** (`wallet.service.ts:1235-1248`): phần thiếu luôn rơi
  vào ví ký quỹ, ví thưởng bị kẹp ở 0 (`:626`). Nếu trừ thẳng "đúng ví đã nhận hoàn" thì sẽ tạo ra
  trạng thái `MAIN = 200k, DEPOSIT = −20k` — đúng thứ invariant sinh ra để cấm.
- **Cập nhật số dư ví hệ thống** (`bumpBalance`) — chỗ rất dễ quên nếu tự ghi ledger.
- **Khoá ví bằng `ensureWallet`** (`pessimistic_write`) ⇒ serialize với mọi đường tiền khác của
  cùng tài xế.

**Vì sao `referenceId = 'penalty:<id>'` chứ không phải `bookingId`** — điểm dễ sai nhất:

> Dòng phạt có **đúng hình dạng** mà `refundDriverCommission` đi tìm (`PAYMENT`, ví tài xế →
> `SYSTEM_REVENUE`, cùng `referenceId`). Nếu dùng `bookingId`, chuyến đó về sau đi qua một vòng
> nhận → huỷ nữa là hệ thống **hoàn cả tiền phạt** cho tài xế.
> Quy ước `<loại>:<id>` đã có sẵn: `adminAdjustDriverWallet` ghi `referenceId = 'admin:<adminUserId>'`
> (`wallet.service.ts:1210`).

Lợi ích phụ đã kiểm: `getDriverLedger` **ẩn** mọi dòng trỏ tới booking `CANCELLED`
(`wallet.service.ts:203-210`). Dùng `bookingId` thì tài xế **không nhìn thấy** khoản phạt;
dùng `penalty:<id>` thì `b.id IS NULL` ⇒ dòng được giữ lại và hiện trong ví.

**KHÔNG thêm giá trị mới cho `LedgerType`** — app tài xế hard-map enum này
(`vigo-driver/lib/data/dto/wallet/transaction_dto.dart`, `@JsonValue`) ⇒ enum mới làm app cũ vỡ parse.

### 4.5 Ví đi âm — cưỡng chế thật sự

Với `MAIN_FIRST`, phần tài xế không trả nổi **luôn rơi vào ví ký quỹ**. Cổng nhận chuyến kiểm
`DEPOSIT ≥ DRIVER_MIN_DEPOSIT` (`booking.service.ts:990`, Vi-now `:1274`, reassign `:4091`) ⇒ ví ký
quỹ âm là **chắc chắn bị chặn** cho tới khi nạp bù. Đây là cơ chế đang áp dụng cho nợ thuế.

> ⚠️ Ghi nhận để không nói sai: **ví thưởng (MAIN) âm KHÔNG chặn gì cả** — cổng chỉ đọc ví ký quỹ.
> Nhưng với `MAIN_FIRST`, MAIN chỉ bị trừ trong phạm vi số dư dương của nó, nên trường hợp
> "tài xế không đủ tiền" luôn biểu hiện thành **ký quỹ âm** ⇒ cưỡng chế vẫn đúng.

### 4.6 Chống trùng & đồng thời

- Toàn bộ trong **1 transaction**: khoá hàng `booking` bằng `pessimistic_write` và **kiểm lại
  `status = CANCELLED` bên trong transaction** — `adminUpdateStatus` (`booking.service.ts:3909`)
  đổi trạng thái booking **không khoá, không side-effect tiền**, nên nếu chỉ đọc trước transaction
  sẽ có race: phạt xong thì chuyến đã bị lật về `ACCEPTED`.
- **Unique partial index** `UNIQUE (bookingId) WHERE status = 'ACTIVE'` → 1 chuyến tối đa 1 vụ phạt
  còn hiệu lực. Chốt chặn cuối ở tầng DB.
- **Không** loại trừ theo lịch sử phạt cũ: sau khi huỷ phạt (tiền đã trả về) thì chuyến **được phép**
  phạt lại, và số tiền phải bằng lần trước. Chống trùng hoàn toàn dựa vào unique index + khoá.

### 4.7 Các case bị chặn (không tạo bản ghi, báo lỗi rõ ràng, phân biệt lý do)

| Case | Thông báo |
|---|---|
| Chuyến chưa ở trạng thái `CANCELLED` | "Chỉ phạt được chuyến đã huỷ." |
| Chuyến **từng hoàn thành** (`completedAt IS NOT NULL`, tức chuyến bị `void`) | "Chuyến này đã hoàn thành rồi bị huỷ bằng công cụ huỷ chuyến — không phạt ở đây." |
| Huỷ trước khi tài xế nhận → không có dòng trừ commission | "Chuyến này chưa từng thu hoa hồng, không có gì để phạt." |
| Có dòng trừ nhưng **chưa được hoàn** | "Hoa hồng chuyến này chưa được hoàn cho tài xế, không có gì để thu lại." |
| Chuyến đang có vụ phạt `ACTIVE` | "Chuyến này đã bị phạt rồi." |

Nút *Phạt* disable kèm đúng lý do, không để admin tưởng hệ thống hỏng.

### 4.8 Huỷ phạt — cũng dùng lại hàm sẵn có

```ts
walletService.refundDriverCommission(
  driverUserId,
  `penalty:${penaltyId}`,
  `Huỷ phạt vi phạm — chuyến ${bookingCode}`,
  manager,
)
```

Hàm này đảo ngược **chính xác** các dòng `PAYMENT` mang `referenceId = penalty:<id>` về đúng ví đã
bị trừ, có sẵn cơ chế idempotency bằng dấu `(reverse #<id>)` ⇒ bấm 2 lần không hoàn 2 lần.
Sau đó `status → REVERSED`, ghi `reversedByUserId/At/Note`. Bản ghi **không bao giờ bị xoá**.

### 4.9 Báo cáo dòng tiền phải tách khoản phạt ra

`listDriverCashflow` (`finance.service.ts:651`) lấy **mọi** dòng ledger chạm ví tài xế; hàm phân
loại `cashflowCategories()` (`:613`) có nhánh
`commission = PAYMENT AND referenceId NOT LIKE 'admin:%' AND description NOT LIKE '%VAT%'`
⇒ **dòng phạt sẽ bị dán nhãn "Trừ hoa hồng"**, dòng huỷ phạt bị tính vào "Hoàn tiền".

Bắt buộc: thêm nhóm `{ key: 'penalty', cond: "l.\"referenceId\" LIKE 'penalty:%'" }` **đặt TRƯỚC**
cả nhánh `refund` và `commission` (CASE lấy nhánh khớp đầu tiên), thêm nhãn "Phạt vi phạm" ở
`vigo-admin/src/app/(app)/driver-cashflow/page.tsx:31`.

---

## 5. Dữ liệu

### Bảng `driver_penalty`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `bookingId` | uuid, index | |
| `driverEntityId` | uuid, index | khớp `driver.id` — 2 màn soát dùng id này |
| `driverUserId` | uuid, index | để trừ ví + gửi thông báo |
| `amount` | bigint | `Ledger.amount` là `decimal(15,2)`; ép về số nguyên VND bằng `Math.round` + assert, không để rơi phần lẻ âm thầm |
| `fromMain` / `fromDeposit` | bigint | kết quả trả về của `deductDriverWallet` |
| `sourceCommissionLedgerId` | bigint | id dòng `PAYMENT` commission đã dùng làm căn cứ — audit |
| `reasonCode` | enum | `OFF_PLATFORM` / `NO_SHOW` / `FORCED_CANCEL` / `FAKE_TRIP` / `OTHER` |
| `note` | text null | bắt buộc khi `reasonCode = OTHER` |
| `source` | enum | `PENALTY_PAGE` / `CANCEL_REVIEW` / `LEAKAGE_REVIEW` |
| `status` | enum | `ACTIVE` / `REVERSED` |
| `createdByUserId` | uuid | |
| `createdAt` | timestamptz | |
| `reversedByUserId` / `reversedAt` / `reverseNote` | null | |

Index: `UNIQUE (bookingId) WHERE status='ACTIVE'`, `(driverEntityId, createdAt)`, `(createdAt)`.

**Nhãn lý do (hiện ở dropdown):** `OFF_PLATFORM` = Chở khách ngoài app · `NO_SHOW` = Bùng khách,
không đến đón · `FORCED_CANCEL` = Ép khách huỷ chuyến · `FAKE_TRIP` = Chuyến khống / gian lận ·
`OTHER` = Khác (bắt buộc ghi chú).

### Hàng đợi cần soát — dữ liệu đã có sẵn, chỉ JOIN

| Nguồn | Lấy gì |
|---|---|
| `booking` | `status=CANCELLED AND driverId IS NOT NULL AND completedAt IS NULL`, `cancelledAt`, `cancelledByRole`, `cancelReason` |
| `leakage_trace` | theo `bookingId`: `verdict` + `confidence` → badge "Nghi rò rỉ" |
| `cancel_enforcement_alert` | theo `bookingId`: `rule` (A/B/C) + `action` + `ratePct` + **`shadow`** → badge "Cảnh báo huỷ"; alert `shadow` phải ghi rõ "(cảnh báo thử)" để admin không coi là bằng chứng |
| `ledger` | số commission có thể thu (§4.2) |
| `driver_penalty` | trạng thái phạt của chuyến |

**Không** tạo bảng/cron mới cho hàng đợi — nó là một truy vấn đọc.

---

## 6. API (vigo-backend)

Module mới `src/driver-penalty/`. Controller `@Roles(ADMIN)` + `FunctionAccessGuard`.

| Method | Route | `@RequireFunction` | Mô tả |
|---|---|---|---|
| GET | `/driver-penalties/queue` | `driver-penalties` | Hàng đợi. Query `from`,`to` (VN `YYYY-MM-DD`), `flag`, `q`, `page`, `limit` |
| GET | `/driver-penalties/preview` | 3 quyền (any-of) | `?bookingId=` → `{ amount, willOweDeposit, blockedReason }` |
| POST | `/driver-penalties` | 3 quyền (any-of) | `{ bookingId, reasonCode, note?, source }` |
| GET | `/driver-penalties` | `driver-penalties` | Lịch sử + `totals` |
| POST | `/driver-penalties/:id/reverse` | `driver-penalties` | `{ note? }` |

`@RequireFunction(...keys)` là **any-of** (`function-access.guard.ts:24`) → khớp quyết định #8.

**Nhưng any-of một mình là chưa đủ** — người chỉ có `leakage-review` sẽ gọi được
`POST /driver-penalties` với `bookingId` **bất kỳ**, tức trừ tiền mọi tài xế, mọi chuyến. Bắt buộc
**scope ở service**: nếu người gọi **không** có `driver-penalties` thì `bookingId` phải tồn tại
trong `leakage_trace` (người có `leakage-review`) hoặc `cancel_enforcement_alert` / chuyến huỷ của
tài xế đang soát (người có `driver-cancel-review`).

`preview` **không trả số dư ví thô** — chỉ trả cờ `willOweDeposit` (số tiền ví ký quỹ sẽ âm) để
người không có quyền `drivers`/`finance` không đọc được số dư tài xế.

Mọi mốc thời gian lọc theo **giờ VN (+07:00)**, bucket ở backend.

---

## 7. Admin UI (vigo-admin)

### 7.1 Trang `/driver-penalties` — "Phạt vi phạm tài xế"

**Tab 1 · Cần xử lý** — chuyến huỷ **sau khi đã có tài xế**, mặc định 30 ngày (`FinanceFilter` + `PRESETS`):

| Cột | Nội dung |
|---|---|
| Thời điểm huỷ | giờ VN, mới nhất trước |
| Chuyến | mã + điểm đón → điểm trả |
| Tài xế | tên, SĐT, tỉ lệ huỷ 30 ngày |
| Ai huỷ | Khách / Admin / Hệ thống + lý do huỷ |
| Dấu hiệu | `Nghi rò rỉ HIGH/LOW` · `Cảnh báo huỷ A/B/C` (ghi rõ nếu là cảnh báo thử) |
| Thu được | commission của chuyến (0 ⇒ nút disable kèm lý do) |
| Trạng thái | Chưa phạt / Đã phạt / Đã huỷ phạt |

Chip lọc nhanh: `Tất cả` · `Nghi rò rỉ` · `Có cảnh báo huỷ` · `Chưa phạt` · `Đã phạt`.
Tìm theo tên/SĐT tài xế.

**Tab 2 · Lịch sử phạt** — ngày phạt, tài xế, chuyến, số tiền (tách 2 ví), lý do, **người phạt**,
trạng thái, nút *Huỷ phạt*. Dòng tổng: số vụ + tổng tiền đã thu trong khoảng.

### 7.2 Dialog phạt (component dùng chung)

Thông tin chuyến + tài xế · **số tiền do backend tính** · cảnh báo đỏ khi `willOweDeposit > 0`:
*"Sau khi phạt, ví ký quỹ âm X đ — tài xế phải nạp bù mới nhận được chuyến"* · dropdown lý do
(**bắt buộc**) · ghi chú · nút Xác nhận.

Số tiền là **chữ, không phải ô nhập**.

### 7.3 Nhúng vào 2 màn soát

- `/driver-cancel-review` → dialog chi tiết tài xế, mục "Danh sách chuyến huỷ": mỗi dòng thêm nút *Phạt*.
- `/leakage-review` → `trace-detail-dialog`: nút *Phạt tài xế* (trace đã có `bookingId`).

Nút hiện **vô điều kiện** với người vào được màn (quyết định #8); backend tự scope theo §6.
Phạt xong refetch để dòng đó đổi sang "Đã phạt".

### 7.4 RBAC

Thêm `driver-penalties` vào `MENU_FUNCTIONS` (BE `rbac.constants.ts`) và `MENU_FUNCTION_BY_HREF`
(FE `src/lib/rbac.ts`), bump số chốt trong `rbac.test.ts:22` và `function-catalog.test.ts:25`.

⚠️ `route-coverage.spec` **chỉ** kiểm route ADMIN có `@RequireFunction` + có guard, **không** kiểm
key có nằm trong catalog. Gõ sai key (`'driver-penalty'` vs `'driver-penalties'`) sẽ **pass hết
test** rồi khoá cửa cả trang trên production. Thêm assert: mọi key trong `@RequireFunction` phải
thuộc `ALL_FUNCTION_KEYS`.

---

## 8. Thông báo cho tài xế — không cần release app

**Kênh thật là `NotificationService.create(...)`** (in-app + push): ghi rõ số tiền, lý do, mã chuyến.

Socket `wallet.deducted` vẫn bắn để app cập nhật số dư, nhưng **đừng coi nó là kênh thông báo**:
app **vứt payload đi**, chỉ dùng để trigger refresh (`vigo-driver/lib/presentation/home/bloc/home_bloc.dart:507`)
⇒ chữ trong `reason` không tới được tài xế.

Trong màn Thu nhập của app, khoản phạt hiện thành `-X đ` với nhãn chung **"Trừ phí nền tảng"** —
app **không render `description`** (`earnings_history.dart:224-236`) và `referenceId='penalty:<id>'`
không phải UUID nên không hiện link chuyến (đã kiểm: **không crash**, tile chỉ trơ).
⇒ **Bằng chứng đối chất với tài xế nằm ở notification + trang Lịch sử phạt của admin**, không phải
màn Thu nhập. Muốn hiện lý do ngay trong lịch sử ví thì phải release app tài xế — **đợt sau**.

Huỷ phạt → bắn `wallet.credited` + notification tương ứng.

---

## 9. Tương thích ngược (CLAUDE.md §4)

| Kiểm | Kết luận |
|---|---|
| Xoá/đổi tên field response | Không — chỉ thêm bảng + endpoint mới |
| Đổi enum client hard-map | **Không thêm `LedgerType` mới** (§4.4) |
| Đổi shape/required của request cũ | Không |
| Endpoint dùng chung với app tài xế | Không đụng |
| App tài xế phải cập nhật | **Không** (đã kiểm không crash với `referenceId` lạ) |

Rollout: **backend trước** (migration + module + sửa `cashflowCategories`), admin sau.

---

## 10. Test

**Backend (`npx jest`)** — trọng tâm là tiền:

1. Phạt chuyến thường → thu đúng số commission lịch sử, `MAIN_FIRST` đúng thứ tự ví.
2. **Chuyến tiền mặt đã `void`** (có dòng "Giữ hộ thuế" đã hoàn) → **bị chặn**, và kể cả nếu lọt
   qua cổng thì bộ lọc `description LIKE 'Booking Commission%'` cũng **không** lấy dòng thuế.
3. Chuyến qua **nhiều vòng nhận→huỷ** → thu đúng **1×** (lần trừ gần nhất), không cộng dồn.
3b. Commission bị **chia 2 ví** (Main + Deposit) → gom đủ cả 2 dòng, `amount` khớp `N` ở bước 4.
3c. Chuyến **admin gán lại tài xế** → mô tả `"Booking Commission (admin reassign) (…)"` vẫn khớp bộ lọc.
4. **Không nuốt nhầm dòng `clawbackDriverPromo`** (cùng `referenceId`, ngược chiều ví).
5. Ví không đủ → **ví ký quỹ âm** đúng số, MAIN không âm (giữ invariant), không throw.
6. Chuyến huỷ trước khi có tài nhận → `amount = 0`, chặn với message riêng.
7. Có dòng trừ nhưng chưa hoàn → chặn với message riêng.
8. Phạt 2 lần → lần 2 bị unique index chặn.
9. Huỷ phạt → hoàn đúng từng ví; gọi 2 lần → không hoàn 2 lần.
10. Phạt → huỷ phạt → phạt lại → số tiền bằng lần đầu.
11. Sau khi phạt, chuyến đi thêm một vòng nhận→huỷ → `refundDriverCommission` **không** hoàn nhầm
    tiền phạt (chốt chặn của `referenceId = penalty:<id>`).
12. Race: phạt trong khi `adminUpdateStatus` lật trạng thái → khoá booking + kiểm lại trong txn.
13. RBAC scope: người chỉ có `leakage-review` phạt `bookingId` không thuộc trace nào → **403**.
14. `cashflowCategories()` xếp dòng phạt vào nhóm `penalty`, không phải `commission`/`refund`.

**Admin (`npx vitest run`)**: nhãn lý do/trạng thái, nút Phạt disable đúng lý do khi `amount = 0`,
đồng bộ catalog RBAC, lọc theo ngày VN của hàng đợi, nhãn `penalty` ở driver-cashflow.

---

## 11. Rủi ro đã biết & ghi nhận

- **Ví ký quỹ âm ⇒ tài xế không nhận được chuyến.** Đây là **chủ đích**, nhưng CSKH phải biết để
  trả lời khi tài xế gọi lên → trang Lịch sử phạt là nơi tra.
- **Latent bug có sẵn (không thuộc phạm vi, chỉ ghi nhận):** `refundDriverCommission` quét *mọi* dòng
  `REFUND` cùng `referenceId` rồi rút marker `reverse #<id>`; marker của `clawbackDriverPromo` (trỏ
  tới id dòng `DEPOSIT`) về lý thuyết có thể trùng id một dòng `PAYMENT` commission và làm bỏ sót một
  khoản hoàn. Xác suất rất thấp. Thiết kế này **không làm nặng thêm** vì dòng phạt mang
  `referenceId = penalty:<id>`, không lọt vào tập truy vấn đó ngay từ đầu.
- **Tài xế đã bị gán chuyến đi cho người khác thì không phạt được qua màn này** — bộ lọc §4.2 scope
  theo ví của tài xế **hiện tại** của chuyến. Cố ý: tránh thu nhầm người vô can.
