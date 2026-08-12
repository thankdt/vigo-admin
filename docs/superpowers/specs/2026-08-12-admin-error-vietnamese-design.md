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

Backend trả `{ success, error: { code, message, details }, timestamp, path }`. **139 site** trong **52 file** làm `toast({ description: err.message })` → admin thấy nguyên cục JSON trong một toast đỏ lớn, không đọc được, không báo được cho dev.

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

Các con số dưới đây là kết quả đo, không phải ước lượng. Chúng chi phối thiết kế.

| Dữ kiện | Giá trị | Ý nghĩa |
|---|---|---|
| Site `toast({ description: err.message })` | 139 site / 52 file | Khối lượng nếu phải sửa tay |
| Site đọc/parse **nội dung** `err.message` | **0** | Đổi shape `message` an toàn tuyệt đối |
| Site `throw new *Exception(...)` kiểu Nest thuần ở BE | 111 | |
| — trong đó là `UnauthorizedException` | 13 | **Chừa hết** (xem §4.2) |
| — còn lại | 98 | |
| — trong đó message **đã là tiếng Việt** | 66 | Không cần đụng |
| — trong đó message **tiếng Anh** | **32** | Đây là khối lượng thật |
| Site dùng `AppException` (mã thật + catalog VN) | 331 | Đường đi đã đúng, không sửa |
| Mã trong `ERROR_CODES` | 68 mã, **68/68** message tiếng Việt | Catalog đã sạch |

**Kết quả then chốt:** vì **không site nào parse nội dung `err.message`**, chỉ cần đổi `Error.message` từ JSON sang câu tiếng Việt sạch là **cả 139 site tự hết cardump mà không phải sửa tay**. Đây là điểm tựa của toàn bộ thiết kế.

> Đính chính so với bản nháp đầu: "111 chỗ tiếng Anh" là sai — 111 là số *site throw*, không phải số site *tiếng Anh*. Đếm lại theo ngôn ngữ message thì chỉ có **32**.
>
> Cách đo: `rg -U` (cho phép message xuống dòng — bỏ cờ này sót mất 1 site ở `users.service.ts:92`), lọc site có ký tự có dấu tiếng Việt. Site duy nhất không dùng chuỗi trực tiếp là `driver-penalty.service.ts:407` (`PENALTY_BLOCKED_MESSAGE[res.reason]`) — map đó **đã tiếng Việt**, không cần đụng.

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

1. `error.message` từ BE **nếu có dấu tiếng Việt** → dùng nguyên.
2. Nếu message **chỉ toàn ASCII** (dấu hiệu tiếng Anh) → thay bằng câu chuẩn theo HTTP status; câu gốc cất vào `rawMessage`, đi theo nút Sao chép.
3. Không có message → câu chuẩn theo status.

Bảng câu chuẩn:

| Status | Câu hiển thị |
|---|---|
| `0` (lỗi mạng) | Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại. |
| `400` | Dữ liệu gửi lên không hợp lệ. |
| `403` | Bạn không có quyền thực hiện thao tác này. |
| `404` | Không tìm thấy dữ liệu. |
| `409` | Dữ liệu đã bị trùng hoặc vừa thay đổi. Tải lại rồi thử lại. |
| `422` | Dữ liệu không hợp lệ. |
| `429` | Thao tác quá nhanh. Vui lòng thử lại sau. |
| `5xx` | Máy chủ đang gặp sự cố. Vui lòng báo đội kỹ thuật kèm mã lỗi bên dưới. |

`401` không cần câu — đã được luồng refresh-token/redirect xử lý trước đó.

**Đánh đổi đã chốt với người dùng:** bước 2 biến `Booking not found` thành `Không tìm thấy dữ liệu` — mất chút cụ thể, đổi lấy thuần Việt ngay. Cửa sổ này rất ngắn vì backend deploy trước (§7), sau đó BE trả tiếng Việt cụ thể và bước 2 gần như không kích hoạt.

### 3.3 Hình dạng toast

Đã chốt: **mã hiện sẵn trên toast + nút Sao chép**.

```
┌────────────────────────────────────┐
│ ⚠  Không cập nhật được tài xế       │
│                                    │
│ Tài xế đang có chuyến chưa kết     │
│ thúc, không thể khoá ví.           │
│                                    │
│ Mã lỗi: DRIVER_HAS_ACTIVE_TRIP     │
│ (HTTP 409)   [ 📋 Sao chép ]       │
└────────────────────────────────────┘
```

Nội dung nút Sao chép mang theo (để admin dán vào Zalo/ticket):

```
DRV_012 | HTTP 409
PUT /drivers/8f2a/wallet-lock
2026-08-12 14:32:07 (VN)
rawMessage: <câu gốc BE nếu có>
```

`ToastAction` đã có sẵn trong `src/components/ui/toast.tsx:58` → lắp vào prop `action`, **không cần đổi primitive**. `description` nhận `ReactNode` nên dòng mã lỗi render được.

### 3.4 Helper `toastApiError`

```ts
toastApiError(toast, err, 'Không cập nhật được tài xế');
```

Dựng sẵn phần mã lỗi + nút Sao chép. 139 site quy về một lời gọi. **Việc migrate 139 site là dọn dẹp tăng dần, không phải điều kiện để hết cardump** — §3.1 đã lo phần đó.

### 3.5 Dọn trùng lặp

- Xoá 3 bản `parseErr` cục bộ, thay bằng `ApiError`.
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

Dải mã cấp tiếp từ số cao nhất đang có: `BOK_019+`, `DRV_010+`, `WAL_004+`, `PRO_011+`, `RES_005+`, `BUS_005+`. Module chưa có dải thì mở dải mới (`NOTI_`, `MDT_`, `HTX_`, `AGT_`…).

3 site ở `common/vn-time.util.ts:81,84,90` đã tiếng Việt sẵn — chỉ cấp mã, **không đổi chữ**.

### 4.2 Ngoại lệ bắt buộc: chừa toàn bộ 13 site `UnauthorizedException`

Cả 2 app Flutter làm:

```dart
// vigo/lib/data/datasource/remote/socket_service.dart:357
} else if (data.toString().contains('Unauthorized') || ...
```

Hiện `UnauthorizedException` khiến envelope mang `code: 'Unauthorized'` — chuỗi đó **khớp heuristic ép đăng xuất này**. Đổi sang `AppException` sẽ xoá chuỗi đó khỏi envelope và **có thể làm vỡ luồng ép đăng xuất của app**.

13 site đó nằm ở `auth/auth.service.ts` (5), `notification/webhook.controller.ts` (7 — webhook SNS, app không gọi), `common/guards/api-key.guard.ts` (1). **Chừa hết.** Admin không mất gì: 401 ở admin đã do luồng refresh-token/redirect lo.

### 4.3 Vì sao app không bị ảnh hưởng

Bốn lớp, đã kiểm từng lớp:

1. **`code` đổi giá trị** — app chỉ bắt cứng `AUTH_001/004/005/007`, `BOK_005/009`, `DRV_008`, `'401'` (`vigo/lib/presentation/auth/bloc/auth_bloc.dart:158-162`, `finding_driver_screen.dart:277`, `vigo-driver/lib/core/interceptor/auth_interceptor.dart:202`). Tất cả đều là mã **đã có trong catalog**, không nằm trong 32 site ta đụng. Không app nào match `'Not Found'` / `'Bad Request'`.
2. **Chuỗi `'Unauthorized'`** — cả 13 site sinh ra nó đều bị chừa (§4.2).
3. **`message` Anh → Việt** — app không hiển thị thẳng. Nó đi qua `friendlyErrorMessage()` (`vigo/lib/core/utils/error_utils.dart:29`) với bộ lọc `_looksTechnical()` chặn `status code` / `exception` / `http` / `://` / `stack` / `dioerror` / `null` / dài quá 140 ký tự. Câu tiếng Việt thân thiện qua bộ lọc y như câu tiếng Anh trước đó. **Không có logic nào rẽ nhánh theo nội dung message** — đã kiểm, 0 site.
4. **HTTP status + shape response giữ nguyên** — không thêm/xoá/đổi tên field, không đổi field `required`, không đổi shape request body → `disallowUnrecognizedKeys` phía Flutter không bị chạm.

Tác dụng phụ duy nhất lên app: khách/tài xế đang thấy `Booking not found` sẽ thấy `Không tìm thấy chuyến`. Đó là cải thiện, không phải rủi ro.

**Không sửa dòng code nào trong `vigo` / `vigo-driver`. Không cần build lại app.**

### 4.4 Bất biến bắt buộc

Mã mới phải map **đúng HTTP status cũ**: `NotFoundException` → 404, `BadRequestException` → 400, `ConflictException` → 409, `ForbiddenException` → 403. **Đổi status là vỡ client.** Bất biến này được khoá bằng test (§5).

---

## 5. Test

**Admin (`npx vitest run`):**

- `ApiError`: envelope BE chuẩn → bóc đúng `code` / `message` / `httpStatus` / `path`.
- `message` **không bao giờ** chứa `{` hoặc `}` — chặn tái phát cardump. Đây là test quan trọng nhất.
- Message ASCII → thay bằng câu chuẩn theo status, câu gốc vào `rawMessage`.
- Message có dấu tiếng Việt → giữ nguyên, `rawMessage` rỗng.
- Lỗi mạng (fetch ném) → `httpStatus === 0`, câu "Không kết nối được máy chủ…".
- Body không phải JSON (HTML 502) → không ném khi parse, câu 5xx, `code === 'HTTP_502'`.
- `parseApiError` shim: nhận câu tiếng Việt sạch → trả nguyên chuỗi, không ném.
- Enum-label map: mỗi giá trị enum đều có nhánh; `default:` không trả enum thô. Thiếu nhánh → test đỏ.

**Backend (`npx tsc --noEmit` + `npx jest`):**

- Mỗi mã mới trong `ERROR_CODES` map đúng HTTP status của exception nó thay thế (§4.4).
- Mọi mã trong `ERROR_CODES` có message tiếng Việt (có dấu) — catalog hiện đã sạch 68/68, test này khoá trạng thái đó lại để không ai thêm mã tiếng Anh về sau.
- Không mã mới nào trùng mã đã có.
- 13 site `UnauthorizedException` vẫn còn nguyên (test hồi quy cho §4.2).

---

## 6. Giờ Việt Nam

Dấu thời gian trong payload nút Sao chép phải là **giờ VN (UTC+7), độc lập với timezone trình duyệt** — theo luật bắt buộc ở `CLAUDE.md`. Dùng lại helper sẵn có ở `src/app/(app)/finance/components/finance-filter.tsx`, **không tự viết**. Tuyệt đối không dùng `toLocaleDateString()` hay `getFullYear/getMonth/getDate` cục bộ.

---

## 7. Rollout

Theo `CLAUDE.md` — backend deploy **trước**, admin sau:

1. `vigo-backend`: 32 site + catalog + test → PR → merge → deploy.
2. Xác minh trên DEV: gọi vài endpoint lỗi, kiểm envelope trả mã mới + message tiếng Việt, **status không đổi**.
3. `vigo-admin`: `ApiError` + helper + nhãn + test → merge vào `dev` → **test runtime trên DEV (cổng bắt buộc)**.
4. PR `feat/admin-error-vietnamese` → `main` → merge = deploy production.
5. Resync `main` → `dev`.

Không PR `dev → main`. Không cherry-pick.

**Review:** thay đổi phân loại **CAO** (tiền/ví, contract đa repo, tương thích client cũ) → 1 lượt sub-agent review fresh-context, giữ model mạnh, đọc file đụng + call-site trực tiếp, ghi report ra scratchpad.

---

## 8. Ngoài phạm vi (đã chốt với người dùng)

- **`/reports`** — chạy `mockUsers` từ `src/lib/data.ts` (tên tiếng Anh giả: "Alex Johnson", "Maria Garcia"), và nút *Tạo tóm tắt tổng quan* đẩy dữ liệu giả đó vào AI. Người dùng xác nhận **trang đang phát triển, để nguyên, không sửa gì**.
- **`content-table.tsx`** — dùng `mockArticles`, không có trong menu điều hướng → admin không vào được. Cùng lý do, để nguyên.
- **`TOAST_LIMIT = 1`** (`src/hooks/use-toast.ts:11`) — thao tác hàng loạt bắn nhiều lỗi thì chỉ 1 toast sống sót. Đã nêu, người dùng không yêu cầu đổi. Không đụng.
- **68 site BE đã tiếng Việt** — không đụng.
- **331 site `AppException`** — đã đúng đường, không đụng.
