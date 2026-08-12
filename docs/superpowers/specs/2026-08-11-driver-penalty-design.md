# Phạt tài xế vi phạm — thu lại commission chuyến (`/driver-penalties`) — Design

**Ngày:** 2026-08-11 · **Repos:** `vigo-backend` (rollout TRƯỚC) + `vigo-admin` · **App tài xế: KHÔNG đổi**
**Nguồn yêu cầu:** chủ dự án (admin Vigo) · **Trạng thái:** đã qua 1 lượt review đối kháng (fresh-context), đã sửa

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

## 3. Quyết định đã chốt

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | Case chính: chuyến **ĐÃ huỷ**, commission đã tự hoàn → **thu lại** | Không làm luồng "huỷ kèm phạt" |
| 2 | Số tiền = **commission của chuyến đó, đúng 1 lần**, admin **không sửa được** | Không gõ tay ⇒ không sai số |
| 3 | Trừ lại **đúng tỉ lệ ví đã nhận hoàn**; ví thưởng không bị đẩy âm, phần thiếu dồn sang ký quỹ = ghi nợ | Tái lập trạng thái "như chưa từng hoàn" — xem §4.5 |
| 11 | Thẻ "Đã trừ ví tài xế" trên dashboard **giữ nguyên**, gồm cả tiền phạt | Tách chi tiết ở bảng cashflow là đủ (§4.9) |
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

Bước 2 — đọc N **TỪ DÒNG ĐẦU TIÊN của danh sách (id lớn nhất)**, không phải dòng nào khác:
         tỉ lệ commission đổi được giữa hai vòng nhận–huỷ, đọc N từ dòng của vòng cũ thì
         bước 3 không bao giờ khớp ⇒ chặn phạt mà không ai hiểu vì sao.
         Mô tả luôn nhúng sẵn tổng commission ở **nhóm ngoặc SỐ CUỐI CÙNG**.
         Mô tả thật có 2 dạng:
             "Booking Commission (12345) (Main)"
             "Booking Commission (admin reassign) (12345) (Deposit)"   ← booking.service.ts:4201
         ⇒ regex phải bóc nhóm ngoặc-số cuối cùng SAU KHI bỏ hậu tố ví.
         Regex kiểu /Commission \((\d+)\)/ sẽ KHÔNG khớp dạng reassign ⇒ chặn nhầm đúng
         nhóm chuyến hay dính vi phạm nhất.

Bước 3 — dùng N làm BỘ CHỌN (không phải chỉ để kiểm):
             thử lấy 1 dòng đầu → tổng == N ? lấy.
             chưa khớp → thử 2 dòng đầu → tổng == N ? lấy.
             vẫn chưa khớp → KHÔNG tự động phạt, báo "dữ liệu ledger bất thường".

Bước 4 — amount = tổng các dòng vừa chọn (KHÔNG lấy thẳng N — format mô tả đổi thì
         phải vỡ TO ở bước 3, không được vỡ âm thầm bằng cách tin vào chuỗi).

Bước 5 — xác nhận đã được hoàn: mỗi dòng đã chọn phải có một dòng REFUND cùng referenceId,
         source = SYSTEM_REVENUE, dest = ví tài xế, description chứa "(reverse #<id dòng đó>)".
```

> **Vì sao phải dùng N làm bộ chọn chứ không phải "cắt cứng ở 2 dòng":** một lần trừ sinh tối đa
> 1 dòng Main + 1 dòng Deposit, nhưng **không phải lần nào cũng đủ 2 dòng**. Case vỡ có thật: vòng
> nhận–huỷ gần nhất trừ hết ở ví thưởng (1 dòng Main), vòng trước đó trừ hết ở ví ký quỹ (1 dòng
> Deposit) — giá chuyến không đổi nên **mô tả gốc y hệt nhau**. Luật "2 dòng đầu, khác ví, cùng mô
> tả gốc" sẽ gom cả hai ⇒ `amount = 2×`. Đối chiếu N chặn được, nhưng khi đó chuyến bị **chặn phạt
> vô cớ**. Thử-1-rồi-thử-2 xử đúng cả hai dạng.

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
const r = await walletService.deductDriverWallet(
  driverUserId,
  amount,
  `penalty:${penaltyId}`,                    // referenceId — KHÔNG phải bookingId
  `Phạt vi phạm — thu lại hoa hồng chuyến ${bookingCode}`,
  true,                                      // allowNegative — ví ký quỹ được đi âm
  manager,                                   // cùng transaction với việc tạo driver_penalty
  { strategy: <theo ví đã hoàn — xem §4.5>, deferNotify: true },
)
// SAU khi transaction commit mới bắn:
if (r.__notify) driverGateway.notifyDriver(r.__notify.driverId, r.__notify.event, r.__notify.data)
```

⚠️ **`deferNotify: true` là bắt buộc, không phải tuỳ chọn.** Hợp đồng ghi ở
`wallet.service.ts:579-584`: caller sở hữu transaction mà không defer thì socket bắn **trước
commit** — transaction rollback là tài xế nhận số dư sai. Người gọi phải tự bắn `__notify` sau
commit, nếu quên thì tài xế không được cập nhật ví.

Được 4 thứ miễn phí, không phải tự làm lại:

- **Khoá ví đúng cách** (`ensureWallet` giữ `pessimistic_write` trên hàng ví) ⇒ không lost-update.
- **Ví thưởng không bị đẩy âm**: `fromMain` luôn kẹp ở số dư (`:626`), phần thiếu rơi vào ví ký quỹ.

⚠️ **Cách này CÓ phá invariant `MAIN > 0 ⟹ DEPOSIT ≥ 0`** (`wallet.service.ts:1235-1248`) — nó tạo
được trạng thái `MAIN = 100k, DEPOSIT = −20k`. Chấp nhận có ý thức: invariant đó vốn đã là
**best-effort**, đã có hai đường phá nó từ trước (giữ hộ thuế chuyến tiền mặt và thuế đơn đặt hộ,
đều `DEPOSIT_ONLY` + `allowNegative`), và `creditMainDebtAware` tự trả nợ ký quỹ ở mọi khoản credit
vào ví thưởng nên trạng thái này tự lành. Đã rà toàn repo: không có chỗ nào *dựa vào* invariant để
quyết định gì, ngoài guard đủ‑số‑dư của `MAIN_FIRST` — và đó chính là lý do §4.5 phải truyền
`allowNegative = true` cho phần ví thưởng.
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

### 4.5 Trừ ví nào — CHỐT: **theo đúng tỉ lệ ví đã nhận hoàn**

`refundDriverCommission` hoàn về **đúng ví đã bị trừ**. Muốn tái lập trạng thái "như thể chưa bao
giờ hoàn" thì phải thu lại theo đúng tỉ lệ đó — đây là lý do entity lưu `sourceCommissionLedgerIds`.

```
mainTarget     = tổng các dòng commission có ví nguồn = ví thưởng
depositTarget  = tổng các dòng còn lại (ví ký quỹ)

fromMain    = min(mainTarget, max(0, số dư ví thưởng))   ← KHÔNG đẩy ví thưởng xuống âm
fromDeposit = (mainTarget + depositTarget) − fromMain    ← phần thiếu dồn về đây, được đi âm
```

Thi hành bằng **hai lời gọi `deductDriverWallet` tách bạch** (`MAIN_FIRST` cho phần ví thưởng đã
kẹp theo số dư, `DEPOSIT_ONLY` cho phần còn lại) — chỉ cách này mới ép được đúng số vào đúng ví,
mà vẫn giữ nguyên khoá ví / cập nhật ví hệ thống / ghi ledger của đường tiền chuẩn.

⚠️ **Cả hai lời gọi đều truyền `allowNegative = true`**, kể cả lời gọi ví thưởng — nghe phản trực
giác nên phải giải thích: guard đủ‑số‑dư của `MAIN_FIRST` soi **TỔNG hai ví**
(`wallet.service.ts:608`), không soi riêng ví thưởng. Tài xế đang **nợ ký quỹ** mà khoản phạt vốn
nằm ở ví thưởng sẽ bị ném `WAL_001` oan — và nợ ký quỹ chính là trạng thái mà lời gọi thứ hai (cùng
khoản giữ hộ thuế) tạo ra, tức đúng nhóm tài xế hay bị phạt nhất. Đặt `true` **không** làm ví thưởng
âm được: `fromMain ≤ max(0, số dư ví thưởng)` nên bên trong hàm `fromMain_inner = amount` và
`fromDeposit_inner = 0`. Guard ở vị trí này không bảo vệ gì, chỉ chặn nhầm.

**Vì sao KHÔNG dùng `MAIN_FIRST` cho toàn bộ khoản phạt** (phương án đã cân nhắc rồi loại):
nó đối xứng với lúc **TRỪ** commission, còn thứ đang đảo ngược là lúc **HOÀN**. Case vỡ: commission
trừ hết ở ví ký quỹ (ví thưởng lúc đó rỗng) → huỷ chuyến → hoàn về ký quỹ → tài xế được tặng khuyến
mãi vào ví thưởng → phạt ăn hết vào tiền khuyến mãi. Tiền thật của tài xế không suy suyển và khoản
"thu lại hoa hồng" thực chất do ngân sách marketing gánh.

**Vì sao ví thưởng không bị đẩy âm:** cùng nguyên tắc `clawbackDriverPromo` đang áp — thưởng đã
tiêu là khoản marketing mất, không đòi lại được. Phần thiếu thành **nợ ký quỹ**, và nợ ký quỹ mới
là thứ cổng nhận chuyến thực sự chặn (`DEPOSIT ≥ DRIVER_MIN_DEPOSIT` — `booking.service.ts:990`,
Vi-now `:1274`, reassign `:4091`). Ví thưởng âm **không** chặn gì cả.

Hệ quả cần nói với vận hành: tài xế **có thể vẫn nhận chuyến bình thường sau khi bị phạt**, nếu
khoản phạt vốn nằm ở ví thưởng và họ còn đủ số dư ở đó. Chỉ khi ký quỹ âm mới bị treo tới lúc nạp bù.

### 4.6 Chống trùng & đồng thời

- Toàn bộ trong **1 transaction**: khoá hàng `booking` bằng `pessimistic_write` và **kiểm lại
  `status = CANCELLED` bên trong transaction**.
- **Chặn cả chiều ngược lại:** khoá hàng chỉ chặn được lúc phạt đang chạy. `adminUpdateStatus`
  (`booking.service.ts:3881`) đặt thẳng mọi trạng thái thủ công, **không side-effect tiền**, nên
  *sau khi* phạt đã commit, admin vẫn lật được `CANCELLED → ACCEPTED`: chuyến chạy tiếp, tài xế
  vừa bị phạt vừa bị trừ commission mới. Thêm guard: **booking đang có `driver_penalty` ACTIVE thì
  không cho rời trạng thái `CANCELLED`** (muốn lật thì huỷ phạt trước).
  Đã soát mọi đường ghi `booking.status`: `reassignDriver` (`:4145`), `rescheduleBooking` (`:2571`)
  và `handoffToSupport` (`:2513`) đều tự chặn `CANCELLED` sẵn ⇒ `adminUpdateStatus` là đường duy
  nhất cần vá.
  **Cách đấu dây để tránh vòng phụ thuộc:** đăng ký `TypeOrmModule.forFeature([DriverPenalty])`
  trong `BookingModule` và inject thẳng `Repository<DriverPenalty>`. **Đừng** inject
  `DriverPenaltyService` — module mới sẽ import `WalletModule`/`BookingModule` ⇒ circular dependency.
- **Unique partial index** `UNIQUE (bookingId) WHERE status = 'ACTIVE'` → 1 chuyến tối đa 1 vụ phạt
  còn hiệu lực. Chốt chặn cuối ở tầng DB.
- **Không** loại trừ theo lịch sử phạt cũ: sau khi huỷ phạt (tiền đã trả về) thì chuyến **được phép**
  phạt lại, và số tiền phải bằng lần trước. Chống trùng hoàn toàn dựa vào unique index + khoá.

### 4.7 Các case bị chặn (không tạo bản ghi, báo lỗi rõ ràng, phân biệt lý do)

| Case | Thông báo |
|---|---|
| Chuyến chưa ở trạng thái `CANCELLED` | "Chỉ phạt được chuyến đã huỷ." |
| Chuyến **từng hoàn thành** (chuyến bị `void`) — nhận diện ở §4.7b | "Chuyến này đã hoàn thành rồi bị huỷ bằng công cụ huỷ chuyến — không phạt ở đây." |
| Huỷ trước khi tài xế nhận → không có dòng trừ commission | "Chuyến này chưa từng thu hoa hồng, không có gì để phạt." |
| Có dòng trừ nhưng **chưa được hoàn** | "Hoa hồng chuyến này chưa được hoàn cho tài xế, không có gì để thu lại." |
| Chuyến đang có vụ phạt `ACTIVE` | "Chuyến này đã bị phạt rồi." |

Nút *Phạt* disable kèm đúng lý do, không để admin tưởng hệ thống hỏng.

### 4.7b Nhận diện "chuyến từng hoàn thành" — KHÔNG được chỉ dựa vào `completedAt`

`completedAt IS NOT NULL` **không đủ**: migration backfill `1790200000000-BackfillBookingCompletedAt`
chỉ điền cho hàng `status = 'COMPLETED'` (`:79`, `:98`, `:113`). Chuyến hoàn thành rồi bị `void`
**trước** khi migration chạy lúc đó đã mang `status = CANCELLED` ⇒ `completedAt` vẫn `NULL` ⇒ lọt
thẳng vào hàng đợi.

Điều kiện loại (bất kỳ dấu hiệu nào đúng ⇒ loại):

```
booking.completedAt IS NOT NULL
OR EXISTS (ledger cùng referenceId = bookingId có description LIKE 'Booking Earnings%'
                                              OR LIKE 'Giữ hộ thuế:%')
```

Dấu vết ledger là bằng chứng **trực tiếp việc chuyến đã hoàn thành** (`booking.service.ts:1605`
cho chuyến chuyển khoản, `:1623` cho chuyến tiền mặt) và **không phụ thuộc backfill** nên đúng cả
với dữ liệu lịch sử.

*(Dấu hiệu phụ, chỉ để đối chiếu khi dò lỗi — không dùng làm điều kiện chính: `voidCompletedBooking`
**không** set `cancelledByRole` (`:3872`) trong khi `cancel()` **luôn** set (`:2308`). Nhưng cột này
**không được backfill**, nên chuyến huỷ cũ cũng `NULL` ⇒ dùng làm điều kiện chính sẽ chặn nhầm
chuyến huỷ thật.)*

**Ranh giới thật là `referenceId`, không phải chuỗi mô tả.** Đơn "đặt hộ" nhiều điểm cũng ghi dòng
thuế tương tự nhưng với `referenceId = order.id` (`multi-stop-lifecycle.service.ts:304`), tức một
uuid khác hẳn ⇒ điều kiện `referenceId = bookingId` đã loại nó từ đầu. Chuỗi `'Giữ hộ thuế:%'` (có
dấu hai chấm, khác `'Giữ hộ thuế đặt hộ: …'`) chỉ là lớp trùng lặp — giữ thì tốt, nhưng đừng coi
chuỗi mô tả là hàng rào an toàn.

### 4.8 Huỷ phạt — cũng dùng lại hàm sẵn có

```ts
const r = await walletService.refundDriverCommission(
  driverUserId,
  `penalty:${penaltyId}`,
  `Huỷ phạt vi phạm — chuyến ${bookingCode}`,
  manager,
  { deferNotify: true },                     // bắt buộc — lý do như §4.4
)
// sau commit: r.__notify.event === 'wallet.refunded'
```

Hàm này đảo ngược **chính xác** các dòng `PAYMENT` mang `referenceId = penalty:<id>` về đúng ví đã
bị trừ, có sẵn cơ chế idempotency bằng dấu `(reverse #<id>)` ⇒ bấm 2 lần không hoàn 2 lần.
Sau đó `status → REVERSED`, ghi `reversedByUserId/At/Note`. Bản ghi **không bao giờ bị xoá**.

### 4.9 Báo cáo dòng tiền phải tách khoản phạt ra

`listDriverCashflow` (`finance.service.ts:651`) lấy **mọi** dòng ledger chạm ví tài xế; hàm phân
loại `cashflowCategories()` (`:613`) có nhánh
`commission = PAYMENT AND referenceId NOT LIKE 'admin:%' AND description NOT LIKE '%VAT%'`
⇒ **dòng phạt sẽ bị dán nhãn "Trừ hoa hồng"**, dòng huỷ phạt bị tính vào "Hoàn tiền".

Bắt buộc, **làm cùng đợt này**:

- BE `finance.service.ts:613` — chèn `{ key: 'penalty', cond: "l.\"referenceId\" LIKE 'penalty:%'" }`
  **ngay trước nhánh `refund`** (CASE lấy nhánh khớp đầu tiên ⇒ phải đứng trước cả `refund` và
  `commission`).
- FE `vigo-admin/src/app/(app)/driver-cashflow/page.tsx:23` — thêm
  `{ key: 'penalty', label: 'Phạt vi phạm' }` vào `CATEGORIES` (dropdown lọc + nhãn cột dùng chung
  một nguồn).

**Giữ nguyên có chủ đích:** thẻ "Đã trừ ví tài xế" trên dashboard tài chính
(`aggregateCashFlow.driverDeducted`, `finance.service.ts:436`) cộng mọi khoản trừ khỏi ví tài xế
nên **sẽ gồm cả tiền phạt** — đúng nghĩa đen của chỉ số đó. Tách chi tiết ở bảng cashflow là đủ.

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
| `fromMain` / `fromDeposit` | int | Kết quả chia ví (`splitPenaltyByWallet`). `fromMain` làm tròn rồi `fromDeposit = amount − fromMain` để hai cột luôn cộng đúng `amount` |
| `sourceCommissionLedgerIds` | int[] | Các dòng `PAYMENT` commission làm căn cứ (1 hoặc 2). KHÔNG chỉ để audit: chính chúng quyết định chia ví ở §4.5 |
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

**Không** tạo bảng/cron mới cho hàng đợi — nó là một truy vấn đọc. Hai bẫy khi dựng truy vấn:

- **Không JOIN thẳng `cancel_enforcement_alert`**: một booking có thể có nhiều alert (rule A/B/C,
  bản `shadow` lẫn bản thật) ⇒ JOIN trực tiếp **nhân dòng** làm phân trang sai. Phải gom trước
  (subquery aggregate / `DISTINCT ON`) rồi mới JOIN. `leakage_trace` thì an toàn (UNIQUE theo
  `watchId`, thực tế 1 trace/booking) nhưng vẫn nên gom cho nhất quán.
- **Không tra ledger từng dòng** để tính cột "Thu được" ⇒ N+1. Lấy tập `bookingId` của trang rồi
  truy vấn ledger **một lần theo lô**.

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
**scope ở service**, và **áp cho cả `GET /preview`**, không riêng `POST`: nếu chỉ chặn POST thì
người đó vẫn dò được `bookingId` bất kỳ để đọc số tiền commission + tình trạng ví.

Quy tắc scope khi người gọi **không** có `driver-penalties`:

| Quyền họ có | Ràng buộc `bookingId` | Siết được bao nhiêu |
|---|---|---|
| `leakage-review` | phải tồn tại trong `leakage_trace` | **Siết thật** — chỉ phạt được chuyến bị hệ thống gắn cờ rò rỉ |
| `driver-cancel-review` | phải là chuyến huỷ có tài xế | **Gần như không siết** — đúng bằng tập hàng đợi |

Ghi rõ để không tự lừa mình: với `driver-cancel-review`, scope này **không phải biện pháp an toàn**
— ai vào được màn soát huỷ thì phạt được gần như mọi chuyến trong tập đó. Đó là hệ quả trực tiếp
của quyết định #8 (nút ăn theo quyền vào màn). Nếu sau này thấy rộng quá thì siết bằng cách bỏ nút
ở màn soát, không phải bằng scope.

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

**Kênh thật là `usersService.sendPushToUser(userId, title, body, data, type, DeviceApp.DRIVER)`**
(`users.service.ts:139`) — hàm này gọi `notificationService.create(...)` rồi mới đẩy SNS.

⚠️ **KHÔNG gọi thẳng `NotificationService.create(...)`**: nó chỉ `save()` một hàng DB
(`notification.service.ts:52`), **không bắn push**. Tài xế sẽ chỉ thấy thông báo nếu tình cờ mở
danh sách noti.

⚠️ **Bắt buộc truyền `appId = DeviceApp.DRIVER`**: một tài khoản tài xế thường đăng ký cả app
khách lẫn app tài. Bỏ trống thì rơi về hành vi cũ "bắn thiết bị mới nhất" — comment
`users.service.ts:128-137` ghi rõ đây là bug đã xảy ra thật với noti "Có chuyến mới".

Nội dung: số tiền, lý do vi phạm, mã chuyến. Bám tiền lệ cùng miền — `cancel-rate.service.ts:236`
gọi `sendPushToUser(userId, 'Tài khoản bị khoá', msg, { type: 'DRIVER_BANNED' }, 'system',
DeviceApp.DRIVER)` ⇒ dùng `{ type: 'DRIVER_PENALTY' }` + `'system'`. (`data.type` chỉ là metadata,
app tài xế không route theo nó — nhưng theo tiền lệ thì khỏi phải cân nhắc lại.)

Socket `wallet.deducted` vẫn bắn để app cập nhật số dư, nhưng **đừng coi nó là kênh thông báo**:
app **vứt payload đi**, chỉ dùng để trigger refresh (`vigo-driver/lib/presentation/home/bloc/home_bloc.dart:507`)
⇒ chữ trong `reason` không tới được tài xế.

Trong màn Thu nhập của app, khoản phạt hiện thành `-X đ` với nhãn chung **"Trừ phí nền tảng"** —
app **không render `description`** (`earnings_history.dart:224-236`) và `referenceId='penalty:<id>'`
không phải UUID nên không hiện link chuyến (đã kiểm: **không crash**, tile chỉ trơ).
⇒ **Bằng chứng đối chất với tài xế nằm ở notification + trang Lịch sử phạt của admin**, không phải
màn Thu nhập. Muốn hiện lý do ngay trong lịch sử ví thì phải release app tài xế — **đợt sau**.

Huỷ phạt → `refundDriverCommission` bắn **`wallet.refunded`** (`wallet.service.ts:848`), không
phải `wallet.credited` — đừng chờ nhầm event khi kiểm thử. Kèm notification tương ứng.

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

**Backend (`npm test`, KHÔNG phải `npx jest`)** — `test/jest-setup-tz.js` ném lỗi nếu process không
chạy ở UTC, nên `npx jest` trần đỏ 100% suite trên máy giờ VN (CLAUDE.md backend, dòng 114-119).
Test chạm Postgres thật phải đặt tên `*.integration.spec.ts` và chạy bằng `npm run test:integration`
(bị loại khỏi `npm test` qua `testPathIgnorePatterns`) — áp cho test #14. Trọng tâm là tiền:

1. Phạt chuyến thường → thu đúng số commission lịch sử, trừ đúng ví đã nhận hoàn.
2. **Chuyến tiền mặt đã `void`** (có dòng "Giữ hộ thuế" đã hoàn) → **bị chặn**, và kể cả nếu lọt
   qua cổng thì bộ lọc `description LIKE 'Booking Commission%'` cũng **không** lấy dòng thuế.
2b. **Chuyến void từ trước migration backfill** (`completedAt IS NULL`) → vẫn bị chặn nhờ dấu vết
   ledger `'Booking Earnings%'` / `'Giữ hộ thuế:%'` (§4.7b).
3. Chuyến qua **nhiều vòng nhận→huỷ** → thu đúng **1×** (lần trừ gần nhất), không cộng dồn.
3b. Commission bị **chia 2 ví** (Main + Deposit) → gom đủ cả 2 dòng, tổng khớp `N`.
3c. Chuyến **admin gán lại tài xế** → mô tả `"Booking Commission (admin reassign) (12345)"`:
    assert cả bộ lọc tiền tố **và** `amount == 12345` (chỉ kiểm tiền tố là **test xanh giả** —
    regex bóc N sai vẫn pass).
3d. Vòng gần nhất trừ hết ở **Main**, vòng trước trừ hết ở **Deposit**, cùng giá (mô tả gốc y hệt)
    → phải lấy đúng 1×, không gom nhầm 2 dòng.
3e. `deferNotify` — rollback transaction thì **không** có socket nào được bắn.
4. **Không nuốt nhầm dòng `clawbackDriverPromo`** (cùng `referenceId`, ngược chiều ví).
5. Ví thưởng không đủ phần của nó → phần thiếu dồn sang **ví ký quỹ** (được âm), ví thưởng KHÔNG âm, không throw. Kể cả khi ký quỹ đang âm sẵn (guard `MAIN_FIRST` soi tổng hai ví) cũng không được chặn oan.
6. Chuyến huỷ trước khi có tài nhận → `amount = 0`, chặn với message riêng.
7. Có dòng trừ nhưng chưa hoàn → chặn với message riêng.
8. Phạt 2 lần → lần 2 bị unique index chặn.
9. Huỷ phạt → hoàn đúng từng ví; gọi 2 lần → không hoàn 2 lần.
10. Phạt → huỷ phạt → phạt lại → số tiền bằng lần đầu.
11. Sau khi phạt, chuyến đi thêm một vòng nhận→huỷ → `refundDriverCommission` **không** hoàn nhầm
    tiền phạt (chốt chặn của `referenceId = penalty:<id>`).
12. Khoá booking + kiểm lại `status` trong txn; và **chiều ngược**: chuyến có `driver_penalty`
    ACTIVE thì `adminUpdateStatus` không lật được khỏi `CANCELLED`.
13. RBAC scope: người chỉ có `leakage-review` gọi **cả `POST` lẫn `GET /preview`** với `bookingId`
    không thuộc trace nào → **403** (không chỉ chặn POST).
14. `cashflowCategories()` xếp dòng phạt vào nhóm `penalty`, không phải `commission`/`refund`.

**Admin (`npx vitest run`)**: nhãn lý do/trạng thái, nút Phạt disable đúng lý do khi `amount = 0`,
đồng bộ catalog RBAC, lọc theo ngày VN của hàng đợi, nhãn `penalty` ở driver-cashflow.

---

## 11. Rủi ro đã biết & ghi nhận

- **Phạt KHÔNG đồng nghĩa với treo tài xế.** Nếu khoản hoa hồng đó vốn được hoàn vào **ví thưởng**
  và tài xế còn đủ số dư ở đó thì phạt xong ký quỹ không đổi ⇒ **vẫn nhận chuyến bình thường**.
  Vận hành/CSKH đừng hứa ngược với khách hay với tài xế.
- **Chỉ khi tài xế không đủ tiền** thì phần thiếu mới dồn vào ví ký quỹ → âm → cổng nhận chuyến
  chặn tới khi nạp bù. Đây là **chủ đích**; CSKH tra ở trang Lịch sử phạt để trả lời tài xế.
- **Khe hở nhỏ của §4.7b (ghi nhận, không xử):** chuyến hoàn thành với thuế = 0 *và* earnings = 0
  (thực tế chỉ xảy ra với chuyến 0đ) rồi bị `void` **trước** migration backfill thì không có cả
  `completedAt` lẫn dấu vết ledger ⇒ vẫn lọt hàng đợi. Số tiền phạt khi đó vẫn đúng bằng commission,
  chỉ là sai phạm vi.
- **Latent bug có sẵn (không thuộc phạm vi, chỉ ghi nhận):** `refundDriverCommission` quét *mọi* dòng
  `REFUND` cùng `referenceId` rồi rút marker `reverse #<id>`; marker của `clawbackDriverPromo` (trỏ
  tới id dòng `DEPOSIT`) về lý thuyết có thể trùng id một dòng `PAYMENT` commission và làm bỏ sót một
  khoản hoàn. Xác suất rất thấp. Thiết kế này **không làm nặng thêm** vì dòng phạt mang
  `referenceId = penalty:<id>`, không lọt vào tập truy vấn đó ngay từ đầu.
- **Tài xế đã bị gán chuyến đi cho người khác thì không phạt được qua màn này** — bộ lọc §4.2 scope
  theo ví của tài xế **hiện tại** của chuyến. Cố ý: tránh thu nhầm người vô can.
