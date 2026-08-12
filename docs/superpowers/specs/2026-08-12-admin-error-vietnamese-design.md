# Lỗi tường minh + thuần Việt hoá UI admin

**Ngày:** 2026-08-12
**Nhánh:** `feat/admin-error-vietnamese` (cắt từ `main`)
**Repo đụng:** `vigo-admin`, `vigo-backend`
**Repo KHÔNG đụng:** `vigo`, `vigo-driver` (không sửa dòng nào, không cần build lại)
**Phân loại rủi ro:** CAO — đụng vùng tiền/ví, contract đa repo, tương thích client cũ

---

## 1. Vấn đề

### 1.1 Toast lỗi in nguyên cục JSON

`fetchWithAuth` nhét cả envelope lỗi vào `Error.message`:

```ts
// src/lib/api.ts:137
const errorData = await response.json().catch(() => ({ message: response.statusText }));
throw new Error(JSON.stringify(errorData) || 'An API error occurred');
```

Backend trả `{ success, error: { code, message, details }, timestamp, path }`. **136 site** trong **50 file** làm `toast({ description: err.message })` → admin thấy nguyên cục JSON trong một toast đỏ lớn, không đọc được, không báo được cho dev.

Ba khuyết tật kèm theo:

- **Mất HTTP status.** Error chỉ mang body. Lỗi mạng, hoặc HTML 502/504 từ ALB, rơi vào `{ message: response.statusText }` → admin thấy `"Bad Gateway"`, không có gì để trace.
- **Trùng lặp.** `parseApiError` tồn tại ở `api.ts:31` nhưng chỉ dùng ~10 chỗ; bị copy-paste thành 3 bản `parseErr` cục bộ (`kol/page.tsx:650`, `agent/page.tsx:447`, `kol/kol-codes-dialog.tsx:41`).
- **Không có mã để trace.** Kể cả khi bóc được câu, admin không có mã lỗi nào đọc cho dev.

### 1.2 Tiếng Anh lẫn trong UI

Admin là người Việt. Hai dạng lọt:

- **Enum thô lọt ra badge** — im lặng, không ai phát hiện cho tới khi admin hỏi.
- **Thuật ngữ Anh nằm trong câu Việt** — `về system`, `ghi audit`, `không thể tự undo`, `PIT`, `net clawback`.

---

## 2. Dữ kiện đã kiểm chứng

Các con số dưới đây là kết quả đo, không phải ước lượng — và chúng chi phối thiết kế, nên mỗi con số kèm **lệnh đo để tái lập**. Số nào không tái lập được thì ghi rõ là chưa kiểm chứng, đừng tin suông.

`$V` = lớp ký tự có dấu tiếng Việt: `[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]`

| Dữ kiện | Giá trị | Lệnh đo |
|---|---|---|
| Site toast dùng thẳng `err.message` làm `description` | 136 site / 50 file | `rg -U -c "description:\s*(err\|error\|e)\??\.(message)" -g "*.tsx" -g "*.ts" src` |
| Site **rẽ nhánh theo nội dung** `err.message` | **0** | `rg "\.message\.(includes\|indexOf\|match\|startsWith\|toLowerCase)" -g "*.ts*" src` |
| Site **parse cấu trúc** `err.message` | 4 (đã kiểm từng site — xem dưới) | `rg -n "JSON\.parse" -g "*.ts*" src` |
| Site `throw new *Exception(...)` kiểu Nest thuần ở BE | **112** | `rg -U -o "throw new (BadRequest\|NotFound\|Conflict\|Forbidden\|Unauthorized\|InternalServerError)Exception\(" src \| wc -l` |
| — trong đó là `UnauthorizedException` | 13 | **Chừa hết** (xem §4.2) |
| — còn lại | 99 | |
| — message **đã là tiếng Việt** | 66 | lọc kết quả trên qua `rg -i "$V"` |
| — message **tiếng Anh** | **32** | lọc qua `rg -iv "$V"` |
| — không dùng chuỗi trực tiếp | 1 (`driver-penalty.service.ts:408`) | map `PENALTY_BLOCKED_MESSAGE`, **đã tiếng Việt** |
| Site `throw new AppException` | 326 | `rg -c "throw new AppException\(" src` — đường đi đã đúng, không sửa |
| Mã trong `ERROR_CODES` | 68 mã, **68/68** message tiếng Việt | Catalog đã sạch |

**Kết quả then chốt:** **không site nào rẽ nhánh theo nội dung `err.message`**, nên đổi `Error.message` từ JSON sang câu tiếng Việt sạch làm **cả 136 site tự hết cardump mà không phải sửa tay**. Đây là điểm tựa của toàn bộ thiết kế.

**4 site parse cấu trúc — đã kiểm từng site, không site nào vỡ:**

| Site | Hành vi | Sau thay đổi |
|---|---|---|
| `api.ts:31` `parseApiError` + 3 bản `parseErr` (`kol/page.tsx:652`, `agent/page.tsx:450`, `kol-codes-dialog.tsx:44`) | `JSON.parse` trong `try/catch` | parse ném → trả nguyên chuỗi. An toàn (§3.5) |
| `promotions-table.tsx:136-147` | `JSON.parse` rồi đọc `errorObj.details` / `errorObj.message` **ở tầng gốc** | Envelope lồng field dưới `error` → **nhánh này đang chết**, form voucher hôm nay hiện nguyên cục JSON. Thay đổi **sửa** nó. Xoá code chết (§3.5) |
| `drivers-table.tsx:82`, `driver-detail-dialog.tsx:38` | `safeImageArray` — parse **ảnh**, không phải lỗi | Không liên quan |

> **Đính chính lịch sử** (giữ lại để người sau không lặp lại):
> - "111 chỗ tiếng Anh" — sai. 111 là số *site throw*, không phải số site *tiếng Anh*. Theo ngôn ngữ message chỉ có **32**.
> - Con số tổng đúng là **112 = 13 + 99**, không phải 111/98 (bản nháp loại nhầm site `driver-penalty:408`).
> - `331` site `AppException` — đếm lại là **326**.
> - `139 site / 52 file` — đo lại bằng lệnh ghi ở bảng trên ra **136 / 50**.
> - "**0** site parse `err.message`" — diễn đạt sai. Đúng phải là "0 site **rẽ nhánh theo nội dung**"; có **4** site parse cấu trúc, một trong số đó (`promotions-table.tsx`) bản nháp bỏ sót hoàn toàn.
>
> Bài học chung: dùng `rg -U` (cho phép chuỗi xuống dòng). Bỏ cờ này đã gây sai số **3 lần** trong spec — sót site `users.service.ts:92`, và hai lần báo nhầm message tiếng Việt thành tiếng Anh.

---

## 3. Thiết kế — admin

### 3.1 Lớp `ApiError`

Trong `src/lib/api.ts`:

```ts
export class ApiError extends Error {
  readonly code: string;        // 'AUTH_002' | 'Not Found' | 'NETWORK' | 'HTTP_502'
  readonly httpStatus: number;  // 0 khi lỗi mạng
  readonly path: string;        // 'PUT /drivers/8f2a/wallet-lock'
  readonly details?: unknown;   // giữ lại, KHÔNG hiện trên toast
  readonly rawMessage?: string; // câu gốc của BE nếu đã bị thay bằng câu chuẩn
  readonly at: string;          // giờ VN (UTC+7), xem §6
}
```

**Bất biến:** `message` **luôn** là câu tiếng Việt người đọc được. Không bao giờ là JSON.

### 3.2 Chọn câu hiển thị

Theo thứ tự:

0. **Miễn trừ `code === 'VAL_001'`** → **luôn** dùng nguyên `error.message`, kể cả khi toàn ASCII. Không bao giờ thay bằng câu chuẩn. Xem §3.2.1.
1. `error.message` từ BE **nếu có dấu tiếng Việt** → dùng nguyên.
2. Nếu message **chỉ toàn ASCII** (dấu hiệu tiếng Anh) → thay bằng câu chuẩn theo HTTP status; câu gốc cất vào `rawMessage`, đi theo nút Sao chép.
3. Không có message → câu chuẩn theo status.

Bảng câu chuẩn:

| Status | Câu hiển thị |
|---|---|
| `0` (lỗi mạng) | Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại. |
| `400` | Dữ liệu gửi lên không hợp lệ. |
| `401` | Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại. |
| `403` | Bạn không có quyền thực hiện thao tác này. |
| `404` | Không tìm thấy dữ liệu. |
| `409` | Dữ liệu đã bị trùng hoặc vừa thay đổi. Tải lại rồi thử lại. |
| `422` | Dữ liệu không hợp lệ. |
| `429` | Thao tác quá nhanh. Vui lòng thử lại sau. |
| `5xx` | Máy chủ đang gặp sự cố. Vui lòng báo đội kỹ thuật kèm mã lỗi bên dưới. |
| **còn lại** | **Thao tác không thực hiện được. Vui lòng báo đội kỹ thuật kèm mã lỗi bên dưới.** |

**Dòng `401` là bắt buộc, không thừa.** Nhánh redirect ở `api.ts:79` có điều kiện `window.location.pathname !== '/'` — nên 401 phát sinh **trên chính trang đăng nhập** (`/`) **không** vào nhánh redirect mà rơi thẳng xuống chỗ ném. Không có dòng này thì tra bảng ra `undefined` → toast trắng, mà test "message không chứa `{` `}`" vẫn xanh.

**Câu bắt-tất cũng bắt buộc** — bảng không thể liệt kê hết (405, 413, 415, 501…). Thiếu là chuyện chắc xảy ra.

**Đánh đổi đã chốt với người dùng:** bước 2 biến `Booking not found` thành `Không tìm thấy dữ liệu` — mất chút cụ thể, đổi lấy thuần Việt ngay. Với **32 site ở §4**, cửa sổ này ngắn vì backend deploy trước (§7). Với lỗi nhập liệu thì **không có cửa sổ nào cả** — đó là lý do có §3.2.1.

#### 3.2.1 Vì sao `VAL_001` phải được miễn trừ

Backend gom lỗi class-validator thành **một mã duy nhất** `VAL_001` (`http-exception.filter.ts:54-63`), lấy message đầu tiên của mảng làm câu hiển thị.

Đo được: trong `vigo-backend/src/**/*.dto.ts` có **33** decorator có `message:` tiếng Việt tuỳ biến, và **848** decorator **không có** → rơi vào câu mặc định tiếng Anh của class-validator (`"commissionPercent must not be greater than 100"`).

§4 **chỉ sửa 32 site `throw new *Exception`, không đụng một decorator nào**. Nên với lỗi nhập liệu, bước 2 kích hoạt **vĩnh viễn**, không phải "cửa sổ ngắn".

Kịch bản hỏng nếu không miễn trừ — admin sửa hoa hồng đại lý, nhập `commissionPercent = 150`:

| | Admin thấy |
|---|---|
| Hôm nay | cục JSON — xấu, nhưng **đọc được** `commissionPercent must not be greater than 100` |
| Nếu áp bước 2 | `"Dữ liệu gửi lên không hợp lệ."` — **không biết field nào sai** |

Đây đúng vùng CAO: form voucher, duyệt/từ chối rút tiền, điều chỉnh ví, hoa hồng đại lý — đều là DTO `@IsNumber/@Min/@Max` không message. Một câu tiếng Anh chỉ đích danh field **hữu ích hơn** một câu Việt vô nghĩa.

Kèm theo: **`details` (mảng đầy đủ mọi field lỗi) phải có mặt trong payload nút Sao chép** (§3.3) — nếu không, thông tin vẫn biến mất khỏi tay admin.

Việt hoá 848 decorator là việc thật nhưng **ngoài phạm vi đợt này** (§8).

### 3.3 Hình dạng toast

Đã chốt: **mã hiện sẵn trên toast + nút Sao chép**.

```
┌────────────────────────────────────┐
│ ⚠  Không cập nhật được tài xế       │
│                                    │
│ Tài xế đang có chuyến chưa kết     │
│ thúc, không thể khoá ví.           │
│                                    │
│ Mã lỗi: DRV_012 (HTTP 409)         │
│              [ 📋 Sao chép ]       │
└────────────────────────────────────┘
```

Nội dung nút Sao chép mang theo (để admin dán vào Zalo/ticket):

```
DRV_012 | HTTP 409
PUT /drivers/8f2a/wallet-lock
2026-08-12 14:32:07 (VN)
rawMessage: <câu gốc BE nếu đã bị thay ở §3.2 bước 2>
details: <nội dung error.details nếu có — BẮT BUỘC với VAL_001>
```

**Mã trong khung toast và trong payload phải là một.** Bản nháp ghi `DRIVER_HAS_ACTIVE_TRIP` ở khung nhưng `DRV_012` ở payload — hai mã khác nhau cho cùng một lỗi, mà `DRIVER_HAS_ACTIVE_TRIP` lại không tồn tại trong `ERROR_CODES` và sai quy ước đặt tên `DRV_xxx` của chính §4.1. Ví dụ trong spec sẽ được người thi công chép nguyên văn nên phải đúng quy ước.

`path` phải là `` `${(options.method ?? 'GET').toUpperCase()} ${url}` `` — `fetchWithAuth` **không** luôn nhận `method` (lời gọi GET không truyền). Thiếu fallback thì mọi lỗi GET in `undefined /drivers/...`, đúng loại lỗi spec này sinh ra để diệt.

`ToastAction` đã có sẵn trong `src/components/ui/toast.tsx:58` → lắp vào prop `action`, **không cần đổi primitive**. `description?: React.ReactNode` — **đã xác minh** tại `src/hooks/use-toast.ts:17`, nên dòng mã lỗi render được.

### 3.4 Helper `toastApiError`

```ts
toastApiError(toast, err: unknown, 'Không cập nhật được tài xế');
```

Dựng sẵn phần mã lỗi + nút Sao chép. 136 site quy về một lời gọi. **Việc migrate 136 site là dọn dẹp tăng dần, không phải điều kiện để hết cardump** — §3.1 đã lo phần đó.

**Bắt buộc đặc tả nhánh `err` KHÔNG phải `ApiError`:** nhận `unknown`, kiểm `err instanceof ApiError`. Nếu không phải → **ẩn hẳn** khối mã lỗi và nút Sao chép, chỉ hiện `err.message` (hoặc câu bắt-tất ở §3.2). Không có nhánh này thì UI hiện `Mã lỗi: undefined (HTTP undefined)`.

Nhánh này **chắc chắn chạy**, vì có 4 đường ném lỗi không đi qua `fetchWithAuth` (§3.5).

### 3.5 Dọn nợ — 4 đường ném lỗi ngoài `fetchWithAuth`

Bất biến §3.1 (*"message luôn là câu tiếng Việt"*) **không tự động phủ** 4 đường sau. Phải sửa từng đường, nếu không tiếng Anh vẫn lọt sau khi làm xong spec.

**(a) `login()` — bug thật, sửa trước tiên.**

```ts
// api.ts:193-196 — HIỆN TẠI
const errorData = await response.json().catch(() => ({ message: response.statusText }));
throw new Error(errorData.message || 'Login failed');
```

Envelope thật là `{ success, error: { code, message }, timestamp, path }` → **`errorData.message` luôn `undefined`**. Nên khi sai mật khẩu, BE gửi `AUTH_002 "Thông tin đăng nhập không đúng."` mà admin lại thấy **`Login failed`** (`src/app/page.tsx:60`) — chuỗi tiếng Anh trên **màn hình đầu tiên và được nhìn nhiều nhất của toàn bộ admin**.

Sửa: `errorData?.error?.message || errorData?.message || 'Đăng nhập thất bại. Vui lòng thử lại.'`

**(b) `uploadToS3()`** (`api.ts:176`) ném `Error("Failed to upload file to S3. Status: 403")` — tiếng Anh, không có `code`/`httpStatus`. 5 call-site: `drivers-table.tsx:447`, `app-popup-manager.tsx:368`, `routes-manager.tsx:610`, `banner-manager.tsx:247`, `news-manager.tsx:272`. → cho ném `ApiError` với `httpStatus = response.status`, câu tiếng Việt.

**(c) Endpoint OTP/agent dùng raw fetch** (`api.ts:2214, 2228, 2309, 2319, 2345, 2366, 2440`) — ném `Error` thường. Call-site: `agent-portal/login/page.tsx:42,55`, `agent-portal/register/page.tsx:51,73`. → dùng chung đường bóc lỗi với `fetchWithAuth`.

**(d) Hàng đợi refresh-token.** `processQueue(refreshError, null)` (`api.ts:118`) reject mọi request đang xếp hàng bằng `new Error('Refresh failed')` (`api.ts:116`) — tiếng Anh. Tái hiện: token hết hạn + 2 request song song + refresh fail → request thứ 2 toast `"Refresh failed"` ngay lúc trang đang redirect. → reject bằng `ApiError` tiếng Việt.

### 3.5.1 Dọn trùng lặp

- Xoá 3 bản `parseErr` cục bộ, thay bằng `ApiError`.
- **Xoá block `JSON.parse` chết ở `promotions-table.tsx:136-147`** — nó đọc `errorObj.details`/`errorObj.message` ở tầng gốc trong khi envelope lồng dưới `error`, nên nhánh không bao giờ chạy. Để lại = code chết gây hiểu nhầm.
- `parseApiError` giữ lại làm shim đã lỗi thời: `message` hết là JSON → `JSON.parse` ném → trả nguyên chuỗi. Vẫn đúng, không vỡ 2 call-site đang import nó.

### 3.6 Nhãn — nhóm A (enum thô lọt ra badge)

Chỉ các chỗ chạy **dữ liệu thật**:

| Chỗ | Đang hiện | Sửa |
|---|---|---|
| `referrals/page.tsx:574` `{e.type}` | `CLAWBACK`, `SIGNUP_BONUS` | `Thu hồi`, `Thưởng đăng ký` |
| `notifications-manager.tsx:607` `default:` | mọi status mới của BE | `Không rõ (MÃ_ENUM)` |
| `driver-team-drawer.tsx:315,333` `{e.type}` | enum thô | nhãn tiếng Việt |

Mỗi enum có một hàm label thuần Việt trong `src/lib/*-labels.ts`. Repo đã có mẫu tốt để theo: `src/lib/cskh-call-labels.ts`, `src/lib/driver-team-labels.ts`, `src/app/(app)/driver-penalties/penalty-labels.ts`.

**Quy tắc cứng:** nhánh `default:` **không được** trả enum thô. Trả `"Không rõ (MÃ_ENUM)"` — admin đọc được, dev vẫn trace được mã.

### 3.7 Nhãn — nhóm B (thuật ngữ Anh trong câu Việt)

**B1 — tài chính:**

| Chỗ | Đang hiện | Sửa thành |
|---|---|---|
| `finance-stat-cards.tsx:33` | `Net: commission + PIT + VAT − hoàn (đã trừ refund chuyến huỷ)` | `Thực trừ: hoa hồng + thuế TNCN + VAT − hoàn (đã trừ tiền trả lại chuyến huỷ)` |
| `finance-stat-cards.tsx:40` | `Hoa hồng giới thiệu (net clawback)` | `Hoa hồng giới thiệu (đã trừ phần thu hồi)` |
| `finance-stat-cards.tsx:40` | `Affiliate đã credit` | `Affiliate đã cộng` |
| `finance-top-tables.tsx` | `Net income` / `Net earnings` | `Thực thu` / `Thực nhận` |
| `referrals/page.tsx:611` | `…về system. Hành động được ghi audit và không thể tự undo.` | `…về quỹ hệ thống. Hành động được ghi nhật ký và không thể hoàn tác.` |
| `referrals/page.tsx` | `Đã clawback` | `Đã thu hồi` |
| `bookings-table.tsx` | `vỡ dòng tiền (gán về tài khoản ảo, 0 commission)` | `…0 hoa hồng` |

**B2 — nhãn lẻ:**

| Chỗ | Đang hiện | Sửa thành |
|---|---|---|
| `users/components/user-table.tsx` | `Bonus signup` | `Thưởng đăng ký` |
| `driver-cancel-review/page.tsx` | `Check` | `Kiểm tra` |
| `referrals/page.tsx` | `Copy link` | `Sao chép link` |
| `bookings/components/create-booking-dialog.tsx` | `đã áp draft` | `đã áp bản nháp` |

### 3.8 Giữ nguyên có chủ đích

`Online` / `Offline` · `Cron`, `biểu thức Cron` · `Schedule ARN` (định danh AWS, dịch là sai) · `Member / Silver / Gold / Diamond` · `Affiliate`, `Sub-KOL`, `Hotline`, `STT`, `VIGO`, `Email` · viết tắt: `HTX`, `KOL`, `CSKH`, `OTP`, `VND`, `VAT`, `Excel`, `Zalo`, `SMS` · từ nghiệp vụ quen: `booking`, `voucher`, `dashboard`, `banner`, `app`, `link`, `code` · mã lỗi kỹ thuật (`AUTH_002`) giữ nguyên dạng, không dịch.

`src/components/ui/*` (`Close`, `Toggle Sidebar`, `Previous slide`) là nhãn cho trình đọc màn hình của shadcn, không hiện trên giao diện — **không đụng**.

---

## 4. Thiết kế — backend

### 4.1 Việc phải làm

32 site có message tiếng Anh → chuyển sang `AppException` với mã thật, message tiếng Việt đặt trong `ERROR_CODES`.

| Module | Site | Message hiện tại |
|---|---|---|
| `booking` | 5 | `Booking not found` ×4, `New driver not found` |
| `users` | 6 | `User not found` ×3, `Phone number already in use`, `Email already in use`, `Failed to register device with SNS` (500) |
| `master-data` | 4 | `Route not found` ×3, `Parent admin unit ${id} not found` |
| `promotions` | 3 | `Promotion code already exists` ×2, `Promotion ${id} not found` |
| `referral` | 2 | `Referral not found`, `Event not found` |
| `maps` | 2 | `place_id is required`, `input is required` |
| `wallet` | 1 | `Insufficient deposit balance` |
| `drivers` | 1 | `Driver is not in rejected state` |
| `share` | 1 | `Booking not found` |
| `s3` | 1 | `Image not found` |
| `notification` | 1 | `Schedule not found` |
| `withdrawal` | 1 | `Withdrawal not found` |
| `leakage` | 1 | `Leakage trace not found` |
| `news` / `banner` / `app-popup` | 3 | `News not found`, `Banner not found`, `App popup not found` |
| **Tổng** | **32** | |

Thêm một chỗ lẫn tiếng Anh **trong câu tiếng Việt** ở BE, sửa luôn cho đồng bộ với nhóm B của admin: `drivers/drivers.service.ts:1030` — `Route(s) không tồn tại hoặc đã ngừng hoạt động: ...` → `Tuyến không tồn tại hoặc đã ngừng hoạt động: ...`.

**QUY TẮC CỨNG: cả 32 site đều CẤP MÃ MỚI. Tuyệt đối không tái dùng mã có sẵn gần nghĩa.**

Người làm 32 site rất dễ nghĩ *"`Booking not found` → dùng luôn `RES_001`, đỡ phình catalog"*. Hai hậu quả, **cả hai đều lọt qua test**:

1. **Status trôi âm thầm.** `Promotion code already exists` là `ConflictException` (409). Tái dùng `PRO_006` (`BAD_REQUEST`) vì tên nghe hợp lý → **409 → 400**. Test "mã *mới* map đúng status" không bắt được, vì mã tái dùng không phải mã mới.
2. **App khách nuốt câu cụ thể.** `AppSnackBar.translateError` (`vigo/lib/presentation/common/widgets/app_snackbar.dart:86-93`) **ưu tiên `code` hơn `message`** — trúng mã trong map ~68 mã là trả câu của map, không thèm đọc `message` của BE. Nếu `share.service.ts:29` chuyển sang `RES_001`, khách mở link chuyến đã xoá sẽ thấy câu chung *"Không tìm thấy dữ liệu"* thay vì câu cụ thể → **tệ hơn hiện tại**, ngược hẳn §4.3. Đáng chú ý app tài xế làm **ngược lại** (`error_interceptor.dart:88` ưu tiên `serverMsg`) nên lỗi này **chỉ hiện ở app khách**, rất dễ lọt khi test.

Dải mã cấp tiếp từ số cao nhất đang có: `BOK_019+`, `DRV_010+`, `WAL_004+`, `PRO_011+`, `RES_005+`, `BUS_005+`. Module chưa có dải thì mở dải mới (`NOTI_`, `MDT_`, `HTX_`, `AGT_`…).

3 site ở `common/vn-time.util.ts:81,84,90` đã tiếng Việt sẵn — chỉ cấp mã, **không đổi chữ**.

### 4.2 Chừa toàn bộ 13 site `UnauthorizedException` — theo nguyên tắc thận trọng

**Lý do đúng:** cả 13 site **không nằm trong 32 site tiếng Anh**, nên chừa chúng có **chi phí bằng 0** và loại bỏ toàn bộ một lớp rủi ro 401 khỏi đợt này. Admin cũng không mất gì: 401 ở admin đã do luồng refresh-token/redirect lo.

13 site nằm ở `auth/auth.service.ts` (5), `notification/webhook.controller.ts` (7 — webhook SNS, app không gọi), `common/guards/api-key.guard.ts` (1).

> **Đính chính lý do sai trong bản nháp.** Bản nháp lập luận rằng chuỗi `'Unauthorized'` trong envelope nuôi heuristic ép đăng xuất của app, nên đổi 13 site sẽ làm vỡ luồng đó. **Sai.** Hàm chứa `socket_service.dart:357` là `_handleConnectionError` — handler của socket.io `connect_error`, xử lý payload bắt tay socket, **không đi qua `HttpExceptionFilter`**. Ba gateway backend (`customer.gateway.ts:29,36,42`, `driver.gateway.ts:45,55,68`) chỉ gọi `client.disconnect()`, **không emit chuỗi `'Unauthorized'`**.
>
> Đường phụ thuộc **thật** của app là **`statusCode == 401`** (`vigo/lib/core/interceptor/auth_interceptor.dart:60`, `vigo-driver/…/auth_interceptor.dart:67`), không phải chuỗi. Và nguồn 401 HTTP thật của app là `AuthGuard`/passport — cũng ném `UnauthorizedException` nhưng **không nằm trong 13 site** này.
>
> Hệ quả: hành động (chừa 13 site) vẫn đúng, nhưng **không được coi đó là lớp bảo vệ cho luồng ép đăng xuất** — đó là bảo đảm giả.

Danh mục heuristic chuỗi `'Unauthorized'` trong 2 app (bản nháp ghi "cả 2 app" nhưng chỉ trích 1 site — **thiếu site thứ 3**):

| Site | Đường |
|---|---|
| `vigo/lib/data/datasource/remote/socket_service.dart:357` | socket.io |
| `vigo-driver/lib/data/datasource/remote/socket_service.dart:334` | socket.io |
| `vigo-driver/lib/utils/background_location_service.dart:236` | socket, chạy trong **isolate nền** |

Cả 3 đều nằm trên đường socket → kết luận không đổi, nhưng danh mục phải đủ để lần sửa sau không sót.

### 4.3 Vì sao app không bị ảnh hưởng

Bốn lớp, đã kiểm từng lớp:

1. **`code` đổi giá trị.** App rẽ nhánh theo `code` ở **4 chỗ, phủ gần trọn catalog 68 mã** — `app_snackbar.dart` (map ~68 mã), `app_error.dart` (enum ~50 mã), `error_interceptor.dart:50-60` (`suppressedCodes = {BOK_012, BOK_002, DRV_SUSPENDED, DRV_008, DRV_004, DRV_005}` — quyết định **có hiện dialog hay không**), `home_booking_mixin.dart:268,275,292,293`. → **An toàn CHỈ KHI cấp mã hoàn toàn mới** (quy tắc cứng ở §4.1). Cả 32 site hiện sinh code `'Not Found'`/`'Bad Request'`/`'Conflict'`, không app nào match các chuỗi đó. `AppErrorCode.fromCode` có `orElse: () => AppErrorCode.unknown` (`app_error.dart:83`) nên mã mới không làm vỡ app.

   > Bản nháp ghi *"app chỉ bắt cứng 8 mã"* — **sai sự thật**, và chính là tiền đề khiến người đọc tưởng "dùng mã nào cũng được".

2. **Chuỗi `'Unauthorized'`** — 13 site sinh ra nó đều được chừa (§4.2). Lưu ý đây là **thận trọng**, không phải bảo vệ luồng socket.
3. **`message` Anh → Việt** — app không hiển thị thẳng; đi qua `friendlyErrorMessage()` (`vigo/lib/core/utils/error_utils.dart:29`) với bộ lọc `_looksTechnical()`. Đã kiểm toàn bộ 68 message catalog bằng đúng vị từ của bộ lọc: **0 câu >140 ký tự, 0 câu dính từ khoá kỹ thuật**. Đúng cho catalog hiện tại — rủi ro nằm ở message **mới**, xem §4.5.
4. **HTTP status + shape response giữ nguyên** — không thêm/xoá/đổi tên field, không đổi field `required`, không đổi shape request body → `disallowUnrecognizedKeys` phía Flutter không bị chạm. `ErrorResponseDto` nguyên vẹn.

Tác dụng phụ duy nhất lên app: khách/tài xế đang thấy `Booking not found` sẽ thấy `Không tìm thấy chuyến`. Đó là cải thiện, không phải rủi ro — **với điều kiện tuân thủ quy tắc cấp mã mới ở §4.1**.

**Không sửa dòng code nào trong `vigo` / `vigo-driver`. Không cần build lại app.**

### 4.4 Bất biến HTTP status — và cách khoá nó cho đúng chỗ

Mã mới phải map **đúng HTTP status cũ**:

| Exception | Status |
|---|---|
| `NotFoundException` | 404 |
| `BadRequestException` | 400 |
| `ConflictException` | 409 |
| `ForbiddenException` | 403 |
| `InternalServerErrorException` | **500** (site `users.service.ts:92`) |

**Đổi status là vỡ client.** Nhưng bản nháp tuyên bố bất biến này mà **không khoá được nó ở đúng chỗ nó vỡ**.

**Lỗ hổng:** `AppException` nhận `errorCode: string` — chuỗi tự do, không phải union:

```ts
// app.exception.ts:25-38
constructor(errorCode: string, message?: string, details?: any) {
  const errorConfig = ERROR_CODES[errorCode];
  if (!errorConfig) {
    super({ code: 'SYS_001', ... }, HttpStatus.INTERNAL_SERVER_ERROR);  // ← 500
```

Gõ `BOK_O19` (chữ O thay số 0 — lỗi rất dễ mắc khi làm cơ học 32 site) → **`tsc` xanh**, runtime trả **500 + `SYS_001`** thay cho 404. Khách mở link chuyến đã xoá: trước là dialog "Không tìm thấy…", sau là `'Unknown error occurred'`; mọi alert 5xx của backend báo động giả; retry/backoff phân biệt 4xx-5xx đổi hành vi.

Test "mã mới map đúng status" **không bắt được** — nó đọc catalog, mà mã gõ sai không nằm trong catalog.

**Bắt buộc, làm TRƯỚC khi migrate 32 site:**

- Siết kiểu: `type ErrorCode = keyof typeof ERROR_CODES` và `constructor(errorCode: ErrorCode, ...)`. Gõ sai → **đỏ ở `tsc`**, không cần test. Rẻ nhất, đóng luôn rủi ro về sau.
- Nếu 326 call-site hiện có vướng khiến không siết được ngay: bổ sung test **quét call-site** — regex mọi `new AppException('X'` trong `src/`, assert `X in ERROR_CODES`.

### 4.5 Hợp đồng ngầm với app: giới hạn nội dung message catalog

`_looksTechnical()` của app (`vigo/lib/core/utils/error_utils.dart:9-21`) **nuốt** message và thay bằng câu chung `kGenericErrorMessage` nếu message dài >140 ký tự hoặc chứa `status code` / `exception` / `http` / `://` / `mozilla` / `server code` / `stack` / `dioerror` / `null`.

Catalog hiện tại sạch, nhưng message **mới** có 3 cái bẫy thật:

1. **`length > 140`.** Câu tiếng Việt dài hơn tiếng Anh ~25-30%. Một câu kiểu *"Không tìm thấy đơn vị hành chính cha … vui lòng kiểm tra lại cây đơn vị hành chính rồi thử lại"* vượt 140 rất dễ → app **tệ hơn hiện tại** (câu Anh `Parent admin unit ... not found` chỉ 45 ký tự, đi lọt).
2. **`contains('null')`.** Site có nội suy (`master-data.service.ts:391` `${data.parentId}`, `promotions.service.ts:163` `${id}`) — nếu biến là `null`/`undefined`, template literal in ra chuỗi `"null"` → **dính bộ lọc**, nuốt câu.
3. **`contains('http')`.** Message tương lai kèm link hỗ trợ sẽ bị nuốt im lặng.

**Quy tắc:** message trong `ERROR_CODES` **≤140 ký tự**, không chứa các từ khoá trên, và **không nội suy biến** — dữ liệu động đưa vào `details`. Khoá bằng test ở §5.

---

## 5. Test

**Admin (`npx vitest run`):**

- `ApiError`: envelope BE chuẩn → bóc đúng `code` / `message` / `httpStatus` / `path`.
- `message` **không bao giờ** chứa `{` hoặc `}` — chặn tái phát cardump. Đây là test quan trọng nhất.
- `message` **không bao giờ** là `undefined` / rỗng, với **mọi** status kể cả status không có trong bảng §3.2 (405, 413, 501…) → khoá câu bắt-tất.
- Status `401` → câu "Phiên đăng nhập đã hết hạn…", **không** `undefined` (khoá F3).
- Message ASCII → thay bằng câu chuẩn theo status, câu gốc vào `rawMessage`.
- Message có dấu tiếng Việt → giữ nguyên, `rawMessage` rỗng.
- **`code === 'VAL_001'` + message ASCII → GIỮ NGUYÊN message, không thay** (khoá miễn trừ §3.2.1). Đây là test bảo vệ vùng tiền.
- **`details` có mặt trong payload nút Sao chép** khi envelope có `details`.
- Lỗi mạng (fetch ném) → `httpStatus === 0`, câu "Không kết nối được máy chủ…".
- Body không phải JSON (HTML 502) → không ném khi parse, câu 5xx, `code === 'HTTP_502'`.
- `path` khi `options.method` là `undefined` → `'GET /...'`, không phải `'undefined /...'`.
- `toastApiError` nhận `err` **không phải `ApiError`** (Error thường) → ẩn khối mã lỗi + nút Sao chép, không hiện `undefined`.
- `parseApiError` shim: nhận câu tiếng Việt sạch → trả nguyên chuỗi, không ném.
- Enum-label map: mỗi giá trị enum đều có nhánh; `default:` không trả enum thô. Thiếu nhánh → test đỏ.

**Backend (`npx tsc --noEmit` + `npx jest`):**

- **Bất biến status theo *call-site*, không theo mã** — snapshot status trước/sau cho từng site trong 32 site. Test theo mã sẽ **thoát** trường hợp tái dùng mã có sẵn sai status (§4.1).
- Mọi `new AppException('X'` trong `src/` có `X in ERROR_CODES` — bắt mã gõ sai (§4.4). Bỏ được nếu đã siết `errorCode: keyof typeof ERROR_CODES`, vì khi đó `tsc` lo.
- Mọi mã trong `ERROR_CODES` có message tiếng Việt (có dấu) — catalog hiện sạch 68/68, test khoá trạng thái đó lại.
- **Hợp đồng ngầm với app (§4.5):** mọi `message` trong `ERROR_CODES` **≤140 ký tự** và không chứa `status code|exception|http|://|mozilla|server code|stack|dioerror|null` (case-insensitive). Chép đúng vị từ của `vigo/lib/core/utils/error_utils.dart:9-21`, kèm comment trỏ về file Dart đó để lần sau ai đổi bộ lọc bên app thì biết đường đồng bộ.
- Không mã mới nào trùng mã đã có.
- 13 site `UnauthorizedException` vẫn còn nguyên — **test hồi quy cho §4.2, mục đích là đóng băng phạm vi đợt này**, KHÔNG phải bảo vệ luồng ép đăng xuất (xem đính chính §4.2).

---

## 6. Giờ Việt Nam

Dấu thời gian trong payload nút Sao chép phải là **giờ VN (UTC+7), độc lập với timezone trình duyệt** — theo luật bắt buộc ở `CLAUDE.md`. Dùng lại helper sẵn có ở `src/app/(app)/finance/components/finance-filter.tsx`, **không tự viết**. Tuyệt đối không dùng `toLocaleDateString()` hay `getFullYear/getMonth/getDate` cục bộ.

---

## 7. Rollout

Theo `CLAUDE.md` — backend deploy **trước**, admin sau:

0. `vigo-backend`: **siết kiểu `AppException(errorCode: keyof typeof ERROR_CODES)` TRƯỚC** (§4.4) — làm riêng, `tsc` xanh, rồi mới migrate.
1. `vigo-backend`: 32 site + catalog + test → PR → merge → deploy.
2. Xác minh trên DEV: gọi vài endpoint lỗi, kiểm envelope trả mã mới + message tiếng Việt, **status không đổi**.
3. `vigo-admin`: `ApiError` + helper + nhãn + test → merge vào `dev` → **test runtime trên DEV (cổng bắt buộc)**.
4. PR `feat/admin-error-vietnamese` → `main` → merge = deploy production.
5. Resync `main` → `dev`.

Không PR `dev → main`. Không cherry-pick.

**Review:** thay đổi phân loại **CAO** (tiền/ví, contract đa repo, tương thích client cũ).

- **Lượt 1 — ĐÃ CHẠY** (2026-08-12, sub-agent fresh-context adversarial, Opus). Kết quả: **2 CHẶN, 6 ĐÁNG SỬA, 3 GÓP Ý**. Report: `scratchpad/spec-review-admin-error-vietnamese.md` (ephemeral, ngoài git). Toàn bộ finding đã xử lý trong bản spec này — xem §9.
- Theo CLAUDE.md 0.5.e còn **1 lượt dự phòng** (vì lượt 1 lộ lỗi lớn). Để dành cho **diff code thật**, không dùng lại cho spec.

---

## 8. Ngoài phạm vi (đã chốt với người dùng)

- **`/reports`** — chạy `mockUsers` từ `src/lib/data.ts` (tên tiếng Anh giả: "Alex Johnson", "Maria Garcia"), và nút *Tạo tóm tắt tổng quan* đẩy dữ liệu giả đó vào AI. Người dùng xác nhận **trang đang phát triển, để nguyên, không sửa gì**.
- **`content-table.tsx`** — dùng `mockArticles`, không có trong menu điều hướng → admin không vào được. Cùng lý do, để nguyên.
- **848 decorator DTO không có `message:` tiếng Việt** — nguồn gốc của lỗi nhập liệu tiếng Anh (§3.2.1). Người dùng chốt **miễn trừ `VAL_001`** thay vì Việt hoá decorator trong đợt này. Việt hoá là việc thật, nên tách spec/đợt riêng. Cho tới lúc đó, admin vẫn thấy câu tiếng Anh chỉ đích danh field khi nhập sai — **có chủ đích**, vì nó hữu ích hơn câu Việt chung chung.
- **`TOAST_LIMIT = 1`** (`src/hooks/use-toast.ts:11`) — thao tác hàng loạt bắn nhiều lỗi thì chỉ 1 toast sống sót. Đã nêu, người dùng không yêu cầu đổi. Không đụng.
- **68 site BE đã tiếng Việt** — không đụng.
- **326 site `AppException`** — đã đúng đường, không đụng.

---

## 9. Truy vết review lượt 1

Sub-agent fresh-context, adversarial, Opus. Report đầy đủ: `scratchpad/spec-review-admin-error-vietnamese.md`.

| # | Mức | Finding | Xử lý |
|---|---|---|---|
| F1 | **CHẶN** | Heuristic ASCII nuốt vĩnh viễn message validation; "cửa sổ ngắn" là sai vì §4 không đụng 848 decorator DTO | §3.2 bước 0 + §3.2.1: miễn trừ `VAL_001`; `details` vào payload Sao chép. Người dùng chốt phương án |
| F2 | **CHẶN** | `AppException(errorCode: string)` → mã gõ sai âm thầm hoá 500+`SYS_001`, `tsc` xanh, test không bắt | §4.4: siết `keyof typeof ERROR_CODES` **trước** khi migrate; §7 bước 0; test quét call-site |
| F3 | ĐÁNG SỬA | Bảng §3.2 thiếu dòng 401, mà 401 **có** đường tới chỗ ném khi `pathname === '/'` → `message` `undefined` | §3.2: thêm dòng 401 + câu bắt-tất; 2 test ở §5 |
| F4 | ĐÁNG SỬA | 4 đường ném lỗi ngoài `fetchWithAuth`; `login()` đọc sai tầng envelope → admin thấy `Login failed` | §3.5 (a)-(d); §3.4 đặc tả nhánh không phải `ApiError` |
| F5 | ĐÁNG SỬA | Lý do chừa 13 site là **sai** (heuristic nằm trên đường socket.io, không phải envelope HTTP); sót site thứ 3 | §4.2 viết lại + đính chính; bổ sung `background_location_service.dart:236` |
| F6 | ĐÁNG SỬA | Không cấm tái dùng mã → status trôi + app khách nuốt câu cụ thể, cả hai lọt test | §4.1 quy tắc cứng cấp mã mới; §5 test status **theo call-site** |
| F7 | ĐÁNG SỬA | "App chỉ bắt cứng 8 mã" sai — app rẽ theo code ở 4 chỗ, phủ gần trọn 68 mã | §4.3 lớp 1 viết lại |
| F8 | ĐÁNG SỬA | Không có gì giữ message **mới** qua được `_looksTechnical()` (>140 ký tự, `null` do nội suy, `http`) | §4.5 mới + test hợp đồng ngầm ở §5 |
| G1 | GÓP Ý | "0 site parse `err.message`" diễn đạt sai; bỏ sót `promotions-table.tsx:136-147` | §2 viết lại + bảng 4 site; §3.5.1 xoá code chết |
| G2 | GÓP Ý | Lệch số: 111→112, 331→326, 139/52→136/50 | §2: sửa số + **ghi lệnh đo cho từng con số** |
| G3 | GÓP Ý | Mã ví dụ §3.3 mâu thuẫn; `options.method` có thể `undefined` | §3.3 thống nhất `DRV_012`; `path` có fallback `'GET'`; xác minh `description: ReactNode` tại `use-toast.ts:17` |

**Reviewer tự đếm lại độc lập và xác nhận khớp:** 13 / 32 / 66, bảng module §4.1 khớp từng dòng, 68 mã catalog, 6 dải mã kế tiếp, shape `ErrorResponseDto` không đổi, `AppErrorCode.fromCode` có `orElse` nên mã mới không vỡ app. Không tìm thấy đường vỡ tương thích client cũ **trực tiếp** nào; rủi ro tương thích duy nhất là **gián tiếp** qua F2 (status trôi) và F6 (tái dùng mã) — cả hai đã thành quy tắc cứng + test.
