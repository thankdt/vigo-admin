# Spec — CRM ViGo: tách nhóm khách hàng khỏi Chuyến đi & giải pháp tổng thể

- **Ngày**: 2026-08-12
- **Trạng thái** (cập nhật 2026-08-17): **GĐ0 + GĐ1 + GĐ2 đã code xong và ở nhánh `dev`**,
  chờ test DEV (chưa ai bấm thử). **GĐ3–7 chưa bắt đầu.** Chưa có gì lên `main`/prod — đúng
  luật nhịp deploy "ở lại nhánh feature tới khi xong hết spec CRM".
  Review: 1 lượt đối kháng lúc thiết kế + 2 lượt soát sau khi code GĐ0/GĐ1 (§13), và 1 lượt
  reviewer độc lập cho **backend** GĐ2 (§15). Phần **admin GĐ2 chưa qua reviewer độc lập**.
- **Phạm vi**: `vigo-admin` (chính) + `vigo-backend` (bảng & endpoint mới, **kể cả ở giai đoạn 1**)
- **Không thuộc phạm vi**: app khách (`vigo`), app tài xế (`vigo-driver`) — CRM là công cụ nội bộ

---

## 1. Vấn đề

Phần chăm sóc khách hàng của admin đang bị gộp vào trang Chuyến đi và rải rác khắp menu.

**Gộp trong `/bookings`** — [bookings-table.tsx](../../../src/app/(app)/bookings/components/bookings-table.tsx), file đã phình **1926 dòng**:

| Thứ | Vị trí |
|---|---|
| 2 dropdown lọc "Gọi trước HT" / "Gọi sau HT" chen giữa hàng filter vận hành | dòng 1429–1449 |
| 2 cột bảng riêng cho trạng thái gọi | dòng 1663–1684 |
| Cả khối thao tác "Gọi check khách" (nhận gọi / lý do / ghi chú / lịch sử) nhúng trong dialog chi tiết chuyến | dòng 725–815 |

Hệ quả: người điều phối chuyến và người chăm sóc khách dùng chung một màn hình, mỗi bên phải lọc bỏ phân nửa giao diện không thuộc việc của mình.

**Rải rác ngoài menu** — các mảnh CRM nằm ở 3 nhóm khác nhau: `/acquisition` (Tổng quan), `/cskh-activity` (Vận hành), `/users` (Người dùng & Đối tác).

**Thiếu hẳn**: hàng đợi cuộc gọi độc lập · lịch sử tương tác theo *khách* (hiện chỉ có theo *chuyến*) · phân khúc khách · ticket khiếu nại khách (`/feedback` là góp ý **tài xế**) · chiến dịch chăm sóc · hồ sơ khách doanh nghiệp.

---

## 2. Đối chiếu với CRM chuẩn

Mẫu số chung của Salesforce / HubSpot / Zoho / Getfly gồm 8 khối. Hiện trạng ViGo:

| # | Khối | ViGo | Ghi chú |
|---|---|---|---|
| 1 | Hồ sơ 360 (Contact/Account) | ⚠️ Một nửa | [users/detail](../../../src/app/(app)/users/detail/page.tsx) có profile + ví + chuyến; thiếu chỉ số hành vi |
| 2 | Timeline tương tác hợp nhất | ❌ | Chỉ có lịch sử gọi theo chuyến |
| 3 | Hàng đợi công việc + SLA | ❌ | Việc gọi rải trong bảng chuyến |
| 4 | Ticket / khiếu nại | ❌ | `/feedback` là góp ý tài xế, không phải khiếu nại khách |
| 5 | Phân khúc theo rule | ❌ | Chỉ có `loyaltyTier` thô |
| 6 | Chiến dịch chăm sóc | ⚠️ | Có kênh (ZNS, push, voucher), thiếu "gửi cho phân khúc + đo kết quả" |
| 7 | Pipeline bán hàng (B2B) | ❌ | Chỉ có ô mã số thuế phục vụ xuất hoá đơn |
| 8 | Báo cáo CRM | ⚠️ | Có `/acquisition` + `/cskh-activity`; thiếu retention/cohort/CSAT |

### 2.1 Hình thái phù hợp: CRM gọi xe ≠ CRM bán hàng

Trong CRM cổ điển, đơn vị giá trị là "deal" hiếm và lớn, nên **pipeline** là trung tâm. Ở gọi xe, giao dịch dày và nhỏ → pipeline B2C là vô nghĩa. Trung tâm phải là **vòng đời khách** (RFM, nguy cơ rời bỏ) và **hàng đợi việc phát sinh theo sự kiện chuyến**.

**ViGo CRM = Service CRM (hàng đợi + ticket) + CDP-lite (360 + phân khúc) + Campaign (ZNS/push) + một pipeline B2B nhỏ.** Không bê nguyên Sales Cloud.

### 2.2 Hướng kiến trúc: tự xây trong `vigo-admin`

Đã chốt. Lý do: dữ liệu chuyến đi là trục chính của CRM — đồng bộ sang CRM ngoài vừa đắt vừa luôn trễ, mà giá trị lớn nhất (hàng đợi gọi) lại đòi dữ liệu thời gian thực. Nền sẵn có đủ mạnh để không phải xây từ số 0:

| Sẵn có | Ở đâu |
|---|---|
| `cskh-activity` — feed hoạt động + xếp hạng nhân viên | `vigo-backend/src/cskh/` |
| Logic loyalty trong `UsersService` + `loyalty-config.util` | `vigo-backend/src/users/` |
| ZNS Zalo (`sendZns`) — kênh gửi chuẩn ở VN | `vigo-backend/src/zalo/zalo.service.ts` |
| Thông báo có broadcast theo tệp + lịch gửi (`scheduled_notifications`) + SNS, lưu từng bản ghi theo `userId` | `vigo-backend/src/notification/` |
| Nguồn khách nối GA4 + Meta | `vigo-backend/src/analytics/` |
| RBAC theo function, có test bao phủ route | `vigo-backend/src/rbac/` |

### 2.3 Ba cách bố trí, chọn (a)

- **(a) Nhóm menu "Khách hàng (CRM)" gồm nhiều trang chuyên trách** ✅ — khớp cách admin đang tổ chức (nhóm menu + 1 function RBAC/href), phân quyền được từng mảnh, mỗi file nhỏ.
- (b) Một "CRM workspace" đơn trang nhiều tab — trông liền mạch nhưng tái tạo đúng bệnh đang gặp: file khổng lồ, phân quyền all-or-nothing.
- (c) Nhúng CRM vào từng trang hiện có — chính là hiện trạng.

---

## 3. Cấu trúc menu

### 3.1 Nhóm mới `Khách hàng (CRM)`

| Mục | Href | Nguồn | Function RBAC |
|---|---|---|---|
| Hàng đợi CSKH | `/crm-queue` | **Mới** — nhận phần gọi khách bóc khỏi `/bookings` | `crm-queue` |
| Khách hàng | `/users` | **Chuyển nhóm** (href không đổi) | `users` (giữ nguyên) |
| Ticket khách hàng | `/crm-tickets` | **Mới** | `crm-tickets` |
| Phân khúc | `/crm-segments` | **Mới** | `crm-segments` |
| Chiến dịch chăm sóc | `/crm-campaigns` | **Mới** | `crm-campaigns` |
| Khách doanh nghiệp | `/crm-accounts` | **Mới** | `crm-accounts` |
| Hiệu suất CSKH | `/cskh-activity` | **Chuyển nhóm** từ Vận hành | `cskh-activity` (giữ nguyên) |
| Nguồn khách | `/acquisition` | **Chuyển nhóm** từ Tổng quan | `acquisition` (giữ nguyên) |

**Hồ sơ khách 360 (`/users/detail?id=`) KHÔNG phải mục menu** — nó là trang con mở từ danh sách, giống `/htx-reconciliation/detail` hiện nay. Đưa nó vào `navItems` sẽ vừa bị ẩn vĩnh viễn (`isMenuVisible` tra `MENU_FUNCTION_BY_HREF` theo href nguyên văn → fail-closed) vừa làm đỏ test bijection [rbac.test.ts](../../../src/lib/rbac.test.ts). Mô tả trang này ở §6.3.

### 3.2 URL phải phẳng, không lồng `/crm/*`

[`isRouteAllowed`](../../../src/lib/rbac.ts#L91) gate quyền theo **segment cấp 1** (`topSegment`). Do đó `/crm/queue` và `/crm/tickets` đều quy về `/crm`:

- nếu `/crm` không có trong catalog → fail-closed, **chặn sạch mọi trang con**;
- nếu thêm `/crm` vào catalog → mọi trang CRM dùng chung **một** function, mất khả năng phân quyền từng mảnh.

Sửa guard để hiểu tiền tố hai đoạn là đụng vào vùng auth — rủi ro cao, lợi ích thẩm mỹ. **Chốt: URL phẳng** (`/crm-queue`, `/crm-tickets`, …). Mỗi trang một segment cấp 1 = một function, guard giữ nguyên. Sidebar `isActive` dùng exact-or-`href + '/'` ([layout.tsx:167](../../../src/app/(app)/layout.tsx#L167)) nên không xung đột tiền tố.

### 3.3 Vị trí nhóm trong menu — có ảnh hưởng, phải chốt

`/` chuyển hướng bằng `firstAllowedRoute(me, navItems.map(i => i.href))`, mà `navItems` là `navGroups.flatMap(...)` → **thứ tự nhóm quyết định trang đích sau đăng nhập**.

**Chốt: nhóm "Khách hàng (CRM)" đặt sau "Xử lý vi phạm", trước "Người dùng & Đối tác".**

Ảnh hưởng đã lường: admin có cả `users` lẫn `cskh-activity` trước đây tiếp đất ở `/cskh-activity` (nhóm Vận hành đứng trước), nay sẽ tiếp đất ở `/users` (đứng trước trong nhóm CRM). Không ai mất quyền. Bổ sung test theo đúng tiền lệ [rbac.test.ts:50-88](../../../src/lib/rbac.test.ts#L50-L88) ("đổi nhóm menu KHÔNG được đụng tới quyền").

### 3.4 Những gì KHÔNG chuyển vào CRM

**Affiliate (`/referrals`) và KOL (`/kol`) ở lại "Người dùng & Đối tác".** Tiêu chí phân nhóm là **đối tượng nghiệp vụ**:

| Nhóm | Đối tượng | Việc chính |
|---|---|---|
| CRM | Khách đi xe | Gọi, chăm sóc, khiếu nại, giữ chân, bán thêm |
| Người dùng & Đối tác | Người giới thiệu (user affiliate + KOL) | Kết nạp, đo hiệu quả kênh, tính & trả hoa hồng |

`/referrals` quản link giới thiệu, lượt nhấn/tải (ChottuLink), hoa hồng, giao dịch chi trả — gắn với ví và công nợ, không phải quan hệ với khách. Phần giao với CRM xử lý **bằng dữ liệu, không bằng menu**:

- Hồ sơ 360 có trường **Nguồn khách**: "Được `<tên>` (KOL/affiliate) giới thiệu", bấm sang được hồ sơ người giới thiệu.
- Phân khúc cho lọc theo `referredBy` để đo chất lượng kênh theo **hành vi sau khi về**, không chỉ đếm lượt mời như `/referrals` đang làm.

`/promotions` ở lại "Nội dung & Thông báo" vì dùng chung cho cả tài xế; chiến dịch CRM chỉ **tham chiếu** khuyến mãi, không quản lý nó.

### 3.5 Tách chủ HTX khỏi danh bạ khách

Hiện `/users` chứa cả `USER` lẫn `TRANSPORT_COMPANY_OWNER` (dropdown "Loại tài khoản", [user-table.tsx:257-269](../../../src/app/(app)/users/components/user-table.tsx#L257-L269)). Vào nhóm CRM thì phải sạch.

**Không đẻ màn mới.** `/transport-companies` đã có cột *Chủ đơn vị*, *SĐT chủ*, trường `ownerUserId` và chức năng *Gán chủ HTX* — chủ HTX đã có nhà.

| Thay đổi | Chi tiết |
|---|---|
| Danh sách `/users` | **Mặc định `role = USER`**. Giữ dropdown "Loại tài khoản" nhưng đổi mặc định từ `ALL` sang `USER` |
| `/transport-companies` | Thêm đường dẫn từ dòng công ty sang hồ sơ tài khoản chủ (`/users/detail?id=<ownerUserId>`), **chỉ hiện khi người dùng có function `users`** (dùng `useAuth().can`) — vì `/users/detail` gate bằng function `users` |
| `/users/detail` | Vẫn là **hồ sơ tài khoản dùng chung** cho mọi role (khoá / mở / xoá / khôi phục / ví). Khối CRM (chỉ số, phân khúc, timeline chăm sóc, tag) **chỉ render khi `role === 'USER'`** (`AdminUserDetail.role` đã có sẵn) |

**Vì sao đổi mặc định chứ không bỏ hẳn dropdown**: bỏ hẳn thì tài khoản `TRANSPORT_COMPANY_OWNER` chưa gán vào công ty nào sẽ biến mất khỏi *mọi* danh sách. Dialog *Gán chủ HTX* **không phải công cụ tra cứu** — `assignTransportCompanyOwner` bắt buộc có `password` và sẽ **đặt lại mật khẩu** tài khoản đang tồn tại, dùng nó để "tìm người" là đá văng mật khẩu chủ HTX đang đăng nhập portal. Đổi mặc định tốn đúng một dòng UI mà giữ nguyên đường tra cứu.

Một trang chi tiết, một nguồn sự thật — repo này đã trả giá một lần vì màn chi tiết tài xế bị nhân đôi.

---

## 4. Ranh giới với `/bookings`: tách sạch hoàn toàn

**Bỏ khỏi `/bookings`**: 2 dropdown lọc gọi · 2 cột trạng thái gọi · toàn bộ khối "Gọi check khách" trong dialog chi tiết. Ước tính ~200 dòng (khối 725–815 ≈ 91 dòng + filter 21 + cột 22 + state/handler ~50).

**Việc kèm theo, dễ quên:**
- Sửa `colSpan` ở [bookings-table.tsx:1381-1387](../../../src/app/(app)/bookings/components/bookings-table.tsx#L1381-L1387) từ `9` xuống `7` — quên thì hàng "Đang tải / Lỗi / Không tìm thấy" lệch cột.
- Dọn mock `getCustomerCallReasons` thừa trong `bookings-table.test.tsx`. (Test hiện có **không** phủ phần gọi khách, nên việc bóc không làm đỏ test sẵn có — cũng có nghĩa là không có lưới an toàn, phải tự kiểm tay.)

**Giữ nguyên, tuyệt đối không xoá**:

- Tham số API `customerCall`, `callBefore`, `callAfter` của `GET /bookings/admin/list` — `/crm-queue` sống bằng chính chúng.
- Các cột denormalize trên `booking`: `customerCallStatus`, `customerCallCheckedAt`, `customerCallCheckedById`, `customerCallReason`, `callBeforeStatus`, `callBeforeAt`, `callAfterStatus`, `callAfterAt`. **Bóc UI không phải bóc dữ liệu.**
- Bảng `booking_customer_call_event` và mọi endpoint ghi/đọc cuộc gọi.

> Lưu ý: `booking` hiện chỉ có **một** cột người gọi dùng chung hai pha (`customerCallCheckedById`), **không** có `callBeforeById`/`callAfterById`. Xem §6.1 để biết vì sao điều này chặn tab "Việc của tôi".

---

## 5. Mô hình dữ liệu

### 5.1 Lớp 1 — Nguồn sự kiện đã có, giữ nguyên

| Bảng | Nội dung đáng chú ý |
|---|---|
| `booking_customer_call_event` | Có `phase` (BEFORE_COMPLETE / AFTER_COMPLETE) đóng băng tại thời điểm gọi, `reason` chuẩn hoá từ `system_config.CSKH_CALL_REASONS`, `note` nội bộ, `byAdminUserId`, append-only. Index `(bookingId, createdAt)` — **không có `customerId`**, lọc theo khách phải join `booking` |
| `driver_customer_call_event` | Làm việc với tài xế |
| `driver_trip_rating` | Có `customerId` + `stars` + `comment` + `tags`, index `(customerId, driverId)` → **nguồn CSAT theo khách đã tồn tại**, chưa ai khai thác |
| `referral` | Ai giới thiệu ai |
| `booking` | Chuyến đi |
| `notification` | Có `userId` từng bản ghi → push đo được. **KHÔNG có index nào ngoài PRIMARY KEY trên `id`** — ràng buộc FK `userId → user(id)` có tồn tại nhưng Postgres **không** tự tạo index cho cột FK, nên lọc theo khách là seq-scan trên **510.397 dòng / 144 MB** (đo DB DEV 2026-08-17). Xem §5.3 |
| `scheduled_notifications` | Đã có lịch gửi + `targetType`/`targetData` + `previewAudience` |

### 5.2 Lớp 2 — Bảng CRM mới

| Bảng | Vai trò | Thiết kế |
|---|---|---|
| `crm_customer_metrics` | Chỉ số tính sẵn theo khách | **UNIQUE(`userId`)** — chốt chặn ở DB, không kiểm trong service (theo tiền lệ `uq_dtr_booking`); cron chạy chồng do retry/deploy trùng sẽ không đẻ dòng trùng. Trường: `firstTripAt`, `lastTripAt`, `tripsCompleted`, `tripsCancelled`, `gmv`, `avgStarsGiven`, `favoriteRouteId`, `rScore`/`fScore`/`mScore`, `segment`, `churnRisk` |
| `crm_customer_tag` | Nhãn thủ công | Danh mục nhãn để trong `system_config`, đúng mẫu `CSKH_CALL_REASONS` — sửa được **không cần deploy**, nhưng ĐỪNG hiểu là "ops tự sửa": xem cảnh báo quyền ngay dưới bảng |
| `crm_customer_note` | Ghi chú về **khách** | Khác `booking_customer_call_event.note` (ghi chú về **chuyến**) |
| `crm_ticket` | Khiếu nại khách | `code` sinh bằng **sequence ở DB** (không đếm trong service — tránh race); `customerUserId`, `bookingId?`, `driverId?`, `category`, `severity`, `status`, `assigneeAdminId`, `slaDueAt`, `resolution`, `compensationAmount`, `source` |
| `crm_ticket_event` | Lịch sử xử lý ticket | Append-only, đúng mẫu `BookingCustomerCallEvent` |
| `crm_segment` | Phân khúc theo rule | `ruleJson` chạy trên `crm_customer_metrics` |
| `crm_campaign` | Chiến dịch | `segmentId`, `channel`, `attributionDays`. **Điều phối QUA `scheduled_notifications` sẵn có, không dựng scheduler thứ hai** (xem §5.4) |
| `crm_campaign_recipient` | Người nhận **+ kết quả** | `sentAt`, `deliveryStatus`, `bookingIdAttributed`. Không có bảng này thì chiến dịch là gửi mù |
| `crm_account` | Công ty B2B | `taxCode`, `stage` (LEAD→NEGOTIATING→SIGNED→ACTIVE→CHURNED), `ownerAdminId`, điều khoản giá & thanh toán |
| `crm_account_member` | Nhân viên công ty đang đặt xe | Nối `crm_account` ↔ `user` thật |
| `crm_account_event` | Lịch sử pipeline B2B | Append-only |

> **CẢNH BÁO QUYỀN — "để trong `system_config`" ≠ "ops sửa được"** (đo DB DEV 2026-08-17).
> `POST /master-data/system-config` tự gate theo key: `functionForConfigKey(key)` =
> `settings.${settingsGroupForKey(key)}` (`vigo-backend/src/rbac/rbac.constants.ts:41-57`).
> Key `CRM_*` / `CSKH_*` **không khớp tiền tố nào** ⇒ rơi vào nhóm `misc` ⇒ đòi function
> **`settings.misc`**, mà `settings.misc` hiện chỉ có **đúng một role: `full-access-legacy`**
> (super-admin). Ba role CRM thật — `cskh`, `quan-ly-chung`, `van-hanh` — **không sửa được**.
>
> Vậy nên khi làm GĐ2 phải chọn một trong ba, đừng mặc định:
> 1. **Giữ nguyên** — danh mục tag do super-admin sửa hộ. Rẻ nhất, nhưng đúng như hiện trạng
>    `CSKH_CALL_REASONS`, tức là mỗi lần thêm tag phải nhờ người khác.
> 2. **Đặt tên key theo tiền tố đã có nhóm** để rơi vào function ops đã cầm — mẹo lách, dễ gây
>    hiểu nhầm về sau, không khuyến nghị.
> 3. **Thêm nhánh `crm` vào `settingsGroupForKey`** (`key.startsWith('CRM_') → 'crm'`) + function
>    `settings.crm` + migration cấp quyền. Sạch nhất, nhưng **phải sửa song song FE
>    `system-config-groups.ts`** — comment ngay trên hàm đó ghi rõ "Sửa gì PHẢI đổi cùng FE
>    (thứ tự + rule giống hệt)" — và nhớ bài học §13.1: thêm function = phải kèm migration cấp.

### 5.3 Lớp 3 — Timeline hợp nhất: cố tình KHÔNG tạo bảng

`GET /crm/customers/:id/timeline` gộp `UNION ALL` từ lớp 1 + lớp 2, sắp theo thời gian, phân trang bằng cursor.

**Đánh đổi có chủ đích.** Bảng timeline riêng buộc phải ghi-kép ở mọi nơi phát sinh sự kiện — sót một chỗ là mất dấu vết vĩnh viễn, không backfill lại được. UNION đọc chậm hơn nhưng luôn đúng và không cần migration dữ liệu cũ. Chỉ tách bảng khi **đo được** là chậm thật.

**Ba điều kiện bắt buộc, nếu không thì UNION sai hoặc chậm:**

1. **Chuẩn hoá kiểu thời gian — ĐỌC KỸ, ĐÂY LÀ CHỖ DỄ SAI NHẤT.**

   `UNION ALL` trộn `timestamp` với `timestamptz` để Postgres ép nhánh không-tz theo **TimeZone
   của session**.

   *Đính chính mức độ (kiểm 2026-08-17):* bản spec trước nói việc này gây "lệch giờ giữa app
   node và job" — **không đúng hiện trạng**. Session TimeZone đã được ghim `UTC` ở **cả hai**
   đường: `vigo-backend/src/app.module.ts:103` (`options: '-c timezone=UTC'`) và
   `typeorm-cli.config.ts:12`. Với TZ = UTC, phép ép là đồng nhất về mặt số ⇒ app hiện **không**
   lệch. Rủi ro thật nằm ở ba chỗ, vẫn đủ để bắt buộc ép tường minh:
   - chạy tay bằng `psql` / BI tool từ máy `+07` → cùng câu SQL ra kết quả khác;
   - ai đó gỡ hoặc bỏ sót cái ghim TZ ở một đường kết nối mới → hỏng im lặng, không lỗi;
   - và quan trọng nhất: **ép SAI CHIỀU thì hỏng bất kể TZ** (xem bẫy bên dưới).

   Mâu thuẫn với §8.2 nếu bỏ qua.

   Bảng kiểu **thật**, đo `information_schema.columns` trên DB DEV 2026-08-17 (bản spec trước
   chỉ liệt kê 3 trong 6 nguồn, thiếu đúng nguồn gây bẫy):

   | Nguồn timeline | Cột | Kiểu thật |
   |---|---|---|
   | `booking_customer_call_event` | `createdAt` | **timestamptz** |
   | `driver_customer_call_event` | `createdAt` | **timestamptz** |
   | `driver_trip_rating` | `createdAt`, `tripCompletedAt` | timestamp (không tz) |
   | `notification` | `createdAt` | timestamp (không tz) |
   | `booking` | `createdAt`, `completedAt` | timestamp (không tz) |
   | `referral` | `createdAt` | timestamp (không tz) |

   **Bẫy: `AT TIME ZONE 'UTC'` không phải hàm "ép về timestamptz" — nó ĐỔI CHIỀU theo kiểu đầu vào.**
   - `timestamp AT TIME ZONE 'UTC'` → **timestamptz** (đọc giờ trần như giờ UTC). Đúng ý ta, dùng cho **4 nguồn không-tz**.
   - `timestamptz AT TIME ZONE 'UTC'` → **timestamp**, tức **RỚT tz**. Áp nhầm lên 2 nguồn
     tz-aware là hạ cấp kiểu. Dưới session UTC hiện tại thì con số vẫn khớp nên **test sẽ xanh**
     — đó mới là chỗ nguy: lỗi nằm im cho tới khi chạy dưới session `+07` (psql tay, BI, hoặc
     một đường kết nối mới quên ghim TZ), lúc đó ra **lệch 7 giờ, không lỗi nào bắn ra**.

   ⇒ Quy tắc: **chỉ bọc `AT TIME ZONE 'UTC'` cho 4 nguồn không-tz**; hai nguồn `*_call_event`
   để nguyên. Viết test khẳng định kiểu trả về của mọi nhánh UNION là `timestamptz` trước khi tin.
2. **Thêm index** `notification(userId, "createdAt" DESC)`. Hiện trạng còn tệ hơn bản spec cũ mô
   tả: bảng **chỉ có PRIMARY KEY trên `id`**, FK `userId` **không** kèm index (Postgres không tự
   tạo index cho cột FK — chỉ tự tạo cho PK/UNIQUE). Nên lọc theo khách là seq-scan trên
   **510.397 dòng / 144 MB**; đúng khách VIP nhiều thông báo là đúng chỗ chậm nhất. Một migration
   index thuần, không đổi shape — nhưng bảng cỡ này thì **phải `CREATE INDEX CONCURRENTLY`** kèm
   chốt `indisvalid` theo §13.5.
3. **Join `booking`** cho nhánh cuộc gọi, vì `booking_customer_call_event` không mang `customerId`.

Ngược lại, `crm_customer_metrics` **phải** là bảng thật: lọc phân khúc mà quét `booking` mỗi lần thì không chạy nổi, và RFM cần mốc cắt cố định để hai lần chạy so sánh được với nhau.

### 5.4 Quan hệ với hệ thống thông báo đã có

`crm_campaign` **không** dựng lịch gửi riêng. Nó tạo/điều phối bản ghi `scheduled_notifications` sẵn có và chỉ giữ thêm phần CRM không có chỗ chứa: phân khúc nguồn, cửa sổ quy đổi, và bảng người nhận kèm kết quả.

Hệ quả bắt buộc: **bộ đếm giới hạn tần suất và danh sách chặn ở §6.6 phải đọc CẢ HAI nguồn** — lượt gửi từ chiến dịch CRM lẫn lượt gửi phát tay từ `/notifications`. Nếu chỉ đếm phía CRM thì chốt chặn bị vô hiệu ngay bởi đường gửi cũ, và cùng một push có thể tới khách hai lần.

Tương tự, `crm_campaign_recipient` chồng lấn một phần với `user_promotion` khi kênh là voucher — chiến dịch **tham chiếu** `user_promotion`, không cấp voucher bằng đường riêng.

---

## 6. Màn hình

### 6.1 `/crm-queue` — Hàng đợi CSKH

Màn nhận toàn bộ phần bóc khỏi `/bookings`.

#### Định nghĩa tab bằng truy vấn (không để mơ hồ)

| Tab | Điều kiện | Sắp xếp mặc định |
|---|---|---|
| Cần gọi trước | `callBefore = uncalled` **AND** `status NOT IN (COMPLETED, CANCELLED)` | `scheduledTime ASC NULLS LAST`, rồi `createdAt ASC` |
| Cần gọi sau | `callAfter = uncalled` **AND** `status = COMPLETED` | `completedAt ASC` |
| Việc của tôi | pha bất kỳ đang `CLAIMED` **và người nhận là tôi** | `createdAt ASC` |
| Quá hạn | như "Cần gọi sau" **AND** `completedAt < now − N giờ` (N trong `system_config`) | `completedAt ASC` |

**Chuyến đã COMPLETED mà `callBefore` vẫn trống thì KHÔNG vào hàng đợi "Cần gọi trước"** — cơ hội gọi trước đã qua, giữ lại chỉ làm hàng đợi không bao giờ vơi. Backend suy pha từ `completedAt` ngay trong transaction ([booking.service.ts:3762](../../../../vigo-backend/src/booking/booking.service.ts)), nên nếu để chuyến đã hoàn thành nằm trong tab đó, CSKH bấm xử lý sẽ ghi vào `callAfter*` còn `callBeforeStatus` vẫn NULL → **dòng đó ở lại vĩnh viễn**. Số chuyến bị sót gọi trước đưa thành **chỉ số** trên `/cskh-activity`, không phải hàng đợi.

Nhờ định nghĩa tab như trên, **không cần thêm param `phase`** cho `POST /bookings/admin/:id/customer-call` — thao tác từ hàng đợi luôn khớp với pha backend tự suy. Trường hợp biên (chuyến hoàn thành đúng lúc CSKH đang bấm) hiếm và ghi vào pha sau là hợp lý; chấp nhận.

#### Giao diện

- Mỗi dòng là **một việc**, không phải một chuyến: khách + SĐT, tuyến, giờ đón / hoàn thành, **đã chờ bao lâu**, ai đang giữ việc
- Thao tác ngay trên dòng: Nhận gọi → Đã gọi được / Không liên lạc được, kèm lý do + ghi chú
- Cần ngữ cảnh chuyến thì mở drawer dùng lại `BookingDetail` — **không dựng màn chi tiết chuyến thứ hai**

#### Việc backend BẮT BUỘC ở giai đoạn 1

Tiền đề "GĐ1 không đụng backend" là **sai**, đã kiểm chứng:

| # | Việc | Vì sao bắt buộc |
|---|---|---|
| 1 | Thêm `'crm-queue'` vào `MENU_FUNCTIONS` (`rbac.constants.ts`); đổi 5 route sang `@RequireFunction('bookings', 'crm-queue')` | Cả 5 endpoint gọi khách (`admin/list`, `admin/:id`, `admin/customer-call-reasons`, `POST admin/:id/customer-call`, `admin/:id/customer-call-history`) đang gate bằng `bookings`. CSKH chỉ có `crm-queue` sẽ **403 trắng trang**. Guard đã hỗ trợ any-of, có tiền lệ `@RequireFunction('bookings', 'users')` |
| 2 | Thêm cột `callBeforeById` / `callAfterById` + backfill từ `booking_customer_call_event` + param lọc `claimedBy` | `booking` chỉ có **một** cột `customerCallCheckedById` dùng chung hai pha, bị đè mỗi lần ghi → tab "Việc của tôi" **không truy vấn được**, và việc của CSKH A biến mất khi CSKH B ghi pha kia. Dữ liệu cũ backfill được vì bảng event đã có `byAdminUserId` + `phase` |
| 3 | Thêm filter khoảng `completedAt` cho `admin/list` | Lọc ngày hiện chỉ theo `createdAt`; tab "Quá hạn" tính ở FE sẽ chỉ đúng trong trang đang xem (20 dòng) → **con số sai** |
| 4 | Mở whitelist sort thêm `callBeforeAt` / `callAfterAt` nếu cần | Whitelist hiện là `createdAt \| updatedAt \| completedAt \| price \| status \| scheduledTime`; phân trang là server-side nên không sắp bù ở FE được |

Rollout **backend trước frontend** (CLAUDE.md mục 4).

#### Việc frontend kèm theo

Tách `BookingDetail` + `PriceBreakdownCard` ra **file riêng trước**, rồi cả `/bookings` lẫn `/crm-queue` cùng import. Import thẳng từ `bookings-table.tsx` sẽ kéo nguyên module 1926 dòng (kèm `getAvailableDrivers`, `reassignBooking`, `CreateBookingDialog`…) vào bundle `/crm-queue` — mâu thuẫn với chính §11.6. Nhớ cập nhật đường dẫn import trong `bookings-table.test.tsx`.

### 6.2 `/users` — Danh bạ khách

Thêm cột & bộ lọc: phân khúc, tier, số chuyến, chuyến gần nhất, tag. Mặc định `role = USER` (§3.5). Gỡ nút "Thêm người dùng" đang treo không nối vào đâu — chính comment trong [users/page.tsx](../../../src/app/(app)/users/page.tsx) thừa nhận điều này.

### 6.3 `/users/detail?id=` — Hồ sơ 360 (trang con, không phải mục menu)

Giữ nguyên khối ví / affiliate / hoá đơn đang có. Bổ sung, **chỉ khi `role === 'USER'`**:

| Khối | Có từ giai đoạn |
|---|---|
| Hàng chỉ số: LTV, số chuyến, tỉ lệ huỷ, sao trung bình khách chấm, tuyến quen, khung giờ quen | GĐ4 (cần `crm_customer_metrics`) |
| Badge phân khúc + nguy cơ rời bỏ | GĐ4 |
| **Nguồn khách** — được KOL/affiliate nào giới thiệu | GĐ2 |
| Tag + ghi chú tự do | GĐ2 |
| **Timeline hợp nhất** | GĐ2 |
| Danh sách ticket | **GĐ3** |
| Chiến dịch đã nhận | **GĐ5** |

Đánh dấu rõ để GĐ2 không hứa một hồ sơ 360 đầy đủ rồi phải quay lại sửa hai lần.

### 6.4 `/crm-tickets` — Ticket khách hàng

Danh sách + SLA đếm ngược, lọc theo trạng thái / loại / người xử lý. Chi tiết là timeline xử lý + nút đền bù nối ví/voucher.

**Đền bù là tiền thật → function RBAC riêng `crm-compensate`, có hạn mức, ghi vết append-only.** Không gộp vào quyền xem ticket. Xem §7 về việc `crm-compensate` cần hạ tầng "function không-menu".

### 6.5 `/crm-segments` — Phân khúc

Dựng rule AND/OR trên các trường của `crm_customer_metrics`, **xem trước số khách + mẫu 20 người trước khi lưu**. Kèm phân khúc dựng sẵn: *Khách mới chưa quay lại · Đang hoạt động · VIP · Nguy cơ rời bỏ · Đã rời bỏ*. Phân khúc *Khách công ty* chỉ có nghĩa **từ GĐ6** (cần `crm_account_member`) — trước đó không dựng, để tránh ship một phân khúc luôn rỗng.

### 6.6 `/crm-campaigns` — Chiến dịch chăm sóc

Phân khúc → kênh → nội dung (ZNS template đã duyệt / push / voucher) → lịch gửi giờ VN (qua `scheduled_notifications`, §5.4) → bảng kết quả: đã gửi / lỗi / số khách phát sinh chuyến trong N ngày / doanh thu quy đổi.

**Hai chốt chặn là điều kiện xuất xưởng, không phải cải tiến sau:**
1. Giới hạn tần suất — không gửi cùng một khách quá X lần/tuần, **đếm cả lượt gửi phát tay từ `/notifications`**
2. Danh sách chặn — khách đã yêu cầu ngừng nhận

Thiếu hai cái này là con đường ngắn nhất tới việc khách chặn số Zalo của ViGo.

### 6.7 `/crm-accounts` — Khách doanh nghiệp

Hồ sơ công ty, thành viên đặt xe, giai đoạn pipeline, hợp đồng & giá thoả thuận, chuyến + công nợ theo kỳ, nối thẳng sang `/invoices` sẵn có.

### 6.8 `/cskh-activity`, `/acquisition`

Giữ nguyên chức năng, chỉ đổi nhóm menu. Bổ sung ở `/cskh-activity`: chỉ số **chuyến bị sót gọi trước** (§6.1).

---

## 7. Phân quyền

| Function mới | Cấp cho | Vì sao tách riêng |
|---|---|---|
| `crm-queue` | CSKH tuyến đầu | Việc hằng ngày, cấp rộng |
| `crm-tickets` | CSKH + giám sát | Đọc/xử lý khiếu nại |
| `crm-compensate` | **Chỉ giám sát/quản lý** | **Trừ/cấp tiền thật** |
| `crm-segments` | Marketing | Chỉ đọc dữ liệu tổng hợp |
| `crm-campaigns` | Marketing | Gửi ra ngoài cho khách thật |
| `crm-accounts` | Sales B2B | Điều khoản giá là dữ liệu nhạy cảm |

Giữ nguyên `users`, `cskh-activity`, `acquisition`.

### 7.1 `crm-compensate` cần hạ tầng "function không-menu" — phải chốt trước GĐ3

Danh mục tick ở `/roles` dựng **hoàn toàn từ `navItems`** ([function-catalog.ts:12](../../../src/lib/function-catalog.ts#L12)), và backend từ chối mọi key ngoài `ALL_FUNCTION_KEYS`. Một function không gắn href như `crm-compensate` sẽ **không xuất hiện trong danh sách tick → không cấp được cho ai**. Hậu quả thực tế: hoặc chỉ super admin đền bù được, hoặc đội implement "chữa" bằng cách gộp nó vào `crm-tickets` — đúng thứ §6.4 cấm.

**Chốt: GĐ3 mở rộng `rbac.constants.ts` + `function-catalog.ts` thêm nhóm "Chức năng đặc biệt (không thuộc menu)", kèm test đồng bộ FE↔BE.** Đây là vùng tiền thật, không để lúc implement tự quyết.

### 7.2 Test đồng bộ không phủ FE↔BE — đừng tin nhầm

Không có cổng nào so `MENU_FUNCTION_BY_HREF` (FE) với `MENU_FUNCTIONS` (BE): `rbac.test.ts` chỉ kiểm nội bộ FE (bijection + **số đếm cứng `29`**), `route-coverage.spec.ts` chỉ kiểm key BE nằm trong `ALL_FUNCTION_KEYS`. Khai function mới ở FE mà chưa deploy BE thì menu vẫn hiện, `/roles` vẫn cho tick, nhưng lưu role ném `VAL_001` hoặc route trả 403 — **cả hai bộ test vẫn xanh**.

Hệ quả bắt buộc cho mọi giai đoạn thêm function:
- Rollout **BE trước FE**.
- **Bump con số cứng `29`** trong `rbac.test.ts` — quên là đỏ CI ngay.
- Cân nhắc bổ sung một test parity đọc `GET /admin/functions` trên DEV.

---

## 8. Ràng buộc kỹ thuật

### 8.1 Static export

`next.config.ts` bật `output: 'export'` → **không dùng được route động** `/crm-customers/[id]`. Mọi màn chi tiết theo mẫu `?id=` như `/users/detail`. Chốt ngay từ đầu, không sửa sau.

Hai chi tiết kèm theo: `trailingSlash: true` nên URL thật là `/users/detail/?id=…`, và `/crm-queue` sẽ được S3 phục vụ từ `crm-queue/index.html`. Ngoài ra toàn repo **chưa bọc `useSearchParams` trong `<Suspense>`** — hiện chạy được, nhưng nếu Next siết prerender thì cả cụm trang `?id=` vỡ cùng lúc, không riêng CRM. Ghi nhận để không bất ngờ.

### 8.2 Giờ Việt Nam (UTC+7)

Áp cho mọi mốc CRM, độc lập với múi giờ trình duyệt admin:

- Cron tính `crm_customer_metrics` chạy 03:00 giờ VN
- Cửa sổ quy đổi chiến dịch đếm theo **ngày VN**
- Lịch gửi ZNS theo giờ VN
- SLA ticket theo giờ VN
- Timeline UNION phải ép `timestamptz` tường minh (§5.3) — đây là chỗ giờ dễ trôi nhất

Dùng lại helper trong [finance-filter.tsx](../../../src/app/(app)/finance/components/finance-filter.tsx) (`todayVn`, `daysAgoVn`, …), không tự chế.

### 8.3 Lỗ hổng phải vá trước giai đoạn chiến dịch

[`zalo.service.ts:141`](../../../../vigo-backend/src/zalo/zalo.service.ts) chỉ gọi API ZNS rồi ghi ra logger — **không lưu vết trong DB**. Không vá thì chiến dịch ZNS gửi mù, không đo được. Vá phải **thuần thêm mới**: ghi thêm bảng log, không đổi chữ ký `sendZns`, và lỗi ghi log không được làm hỏng luồng gửi OTP/booking đang chạy.

---

## 9. Lộ trình

| GĐ | Nội dung | Đụng backend | Quy mô | Rủi ro |
|---|---|---|---|---|
| **0** | Tạo nhóm menu CRM (vị trí §3.3); chuyển `/users`, `/cskh-activity`, `/acquisition` sang; `/users` mặc định `role=USER`; `/transport-companies` thêm link sang hồ sơ chủ | Không | Rất nhỏ | ~0 |
| **1** | `/crm-queue` + **dọn sạch `/bookings`** + tách `BookingDetail` ra file riêng | **CÓ**: 1 migration (2 cột + backfill), 5 dòng `@RequireFunction`, 2 param filter/sort mới (§6.1) | Vừa | Trung bình |
| **2** | Hồ sơ 360: timeline UNION (+ index `notification`), tag, ghi chú, Nguồn khách | 2 bảng nhỏ + 1 index + 1 endpoint | Vừa | Thấp |
| **3** | Ticket khiếu nại + SLA + đền bù + **hạ tầng function không-menu** (§7.1) | 2 bảng + `crm-compensate` + sửa RBAC catalog | Lớn | **CAO — tiền thật** |
| **4** | `crm_customer_metrics` + cron + phân khúc | 2 bảng + cron + rule engine | Lớn | Trung bình |
| **5** | Chiến dịch — **vá log ZNS trước** | 2 bảng + sửa `zalo.service` + nối `scheduled_notifications` | Lớn | **CAO — gửi ra ngoài** |
| **6** | Khách doanh nghiệp + pipeline | 3 bảng | Vừa | Thấp |
| **7** *(tuỳ chọn)* | Insights: cohort giữ chân, CSAT, NPS | Truy vấn tổng hợp | Vừa | Thấp |

GĐ 0–1 giải đúng vấn đề đang đau và gỡ ~200 dòng khỏi file 1926 dòng. GĐ4 là nền của GĐ5 — không có metrics thì phân khúc chỉ là lọc tay và chiến dịch không đo được.

Mỗi giai đoạn là **một nhánh riêng cắt từ `main`**, theo đúng quy trình trong `CLAUDE.md`.

---

## 10. Tương thích ngược

CRM là công cụ nội bộ, **không đụng app khách/tài xế**. Ba chỗ phải cẩn thận:

1. **Không xoá cột denormalize** `booking.customerCallStatus` / `customerCallCheckedAt` / `customerCallCheckedById` / `customerCallReason` / `callBeforeStatus` / `callBeforeAt` / `callAfterStatus` / `callAfterAt`. FE `/bookings` thôi hiển thị, nhưng `/crm-queue` sống bằng chúng.
2. **Đổi `@RequireFunction('bookings')` thành `('bookings', 'crm-queue')` là any-of** → vai trò cũ chỉ có `bookings` vẫn dùng được như trước. Không được thay thế, chỉ được thêm.
3. **Vá log ZNS (GĐ5) phải thuần thêm mới** — không đổi chữ ký `sendZns`, không để lỗi ghi log phá luồng OTP/booking.

Các giai đoạn 2–6 chỉ **thêm** bảng và endpoint mới, không sửa response shape của endpoint app đang dùng.

---

## 11. Rủi ro & cách chặn

| # | Rủi ro | Cách chặn |
|---|---|---|
| 1 | Bóc `/bookings` làm CSKH mất việc quen tay | Lập bảng đối chiếu 1-1 từng chức năng cũ ↔ chỗ mới **trước khi xoá**; chính CSKH test trên DEV rồi mới PR lên `main`. Lưu ý test hiện có **không** phủ phần gọi khách → không có lưới an toàn tự động |
| 2 | Timeline UNION chậm / lệch giờ | Cursor pagination + mặc định 90 ngày; ép `timestamptz` tường minh; thêm index `notification(userId, createdAt)` (§5.3) |
| 3 | RFM lệch vì múi giờ | Mọi mốc cắt tính bằng ngày VN, có unit test cho hàm chia khoảng — **sau khi công thức được chốt** (§12.4) |
| 4 | Chiến dịch thành spam, khách chặn Zalo ViGo | Giới hạn tần suất + danh sách chặn là điều kiện xuất xưởng GĐ5, **đếm cả đường gửi cũ `/notifications`** |
| 5 | Đền bù là tiền thật | Nhóm **RỦI RO CAO** theo `CLAUDE.md` 0.5.b: quyền riêng, hạn mức, ghi vết append-only, bắt buộc reviewer độc lập. Phụ thuộc §7.1 |
| 6 | Lặp lại bệnh file phình | Mỗi màn CRM một thư mục; tách logic thuần ra file có test riêng |
| 7 | Nhân đôi UI | `/crm-queue` dùng lại `BookingDetail` — nhưng **tách ra file riêng trước** (§6.1), không import từ module 1926 dòng |
| 8 | **Mở rộng phạm vi lộ dữ liệu cá nhân khách** | `crm-queue` cấp rộng cho tuyến đầu, mà hồ sơ 360 gom "SĐT + tuyến quen + khung giờ quen + timeline" — đủ để tra cứu người quen/đối thủ. Hiện **không có bảng audit truy cập nào** trong backend. Chặn bằng: (a) che một phần SĐT ở `/crm-queue`, hiện đủ khi bấm gọi; (b) audit log **đọc** hồ sơ 360, append-only theo mẫu `BookingCustomerCallEvent`; (c) cân nhắc tách "tuyến quen / khung giờ quen" khỏi quyền `crm-queue` |
| 9 | Thêm function mà quên đồng bộ BE | Rollout BE trước FE; bump số đếm cứng `29` trong `rbac.test.ts` (§7.2) |
| 10 | Đổi vị trí nhóm menu làm đổi trang đích sau đăng nhập | Đã chốt vị trí ở §3.3 và ghi nhận ảnh hưởng; thêm test theo tiền lệ `rbac.test.ts:50-88` |

---

## 12. Điểm còn mở

1. ~~Khiếu nại khách hiện xử lý bằng cách nào?~~ → **ĐÃ CHỐT 2026-08-17: qua NHÓM ZALO.** Hệ quả bắt buộc cho GĐ3, xem §14.1.
2. ~~Danh mục loại ticket và mức SLA~~ → **ĐÃ CHỐT, xem §14.1.**
3. ~~Hạn mức đền bù theo vai trò~~ → **ĐÃ CHỐT, xem §14.2.**
4. ~~Công thức RFM và ngưỡng `churnRisk`~~ → **ĐÃ CHỐT, xem §14.3.**
5. ~~Ngưỡng "quá hạn" của tab hàng đợi~~ → **ĐÃ CHỐT: 24 giờ**, key `CSKH_CALL_AFTER_OVERDUE_HOURS` trong `system_config` (GĐ1 đã seed).

---

## 13. Bài học từ GĐ0 + GĐ1 — viết SAU khi ship, đọc TRƯỚC khi làm GĐ2

Mục này ghi lại những thứ chỉ lộ ra lúc code, không phải lúc thiết kế. Mỗi mục đều là lỗi
THẬT đã lọt qua ít nhất một vòng kiểm.

### 13.1 Thêm function RBAC = PHẢI kèm migration cấp quyền

Thêm key vào `MENU_FUNCTIONS` chỉ làm key **hợp lệ**, KHÔNG gán cho ai. Hai migration seed
role (`1788000000000`, `1789000000000`) đều `ON CONFLICT DO NOTHING` và đã chạy xong trên
prod, nên hàng `admin_role` hiện có **không bao giờ được cập nhật lại**.

GĐ1 suýt deploy mà thiếu bước này: role `cskh` seed đúng
`[dashboard, feedback, bookings, users, notifications]`, trong khi cùng đợt đó admin GỠ 2 bộ
lọc gọi khách khỏi `/bookings` — nhân viên CSKH sẽ mất **cả đường cũ lẫn đường mới**.

⇒ **Áp cho MỌI giai đoạn còn lại**: `crm-tickets`, `crm-compensate` (GĐ3), `crm-segments`
(GĐ4), `crm-campaigns` (GĐ5), `crm-accounts` (GĐ6) — mỗi cái một migration cấp quyền, khuôn
ở `1791700000000-GrantCskhActivityToManagerRoles.ts` và `1793200200000-GrantCrmQueueToCskhRoles.ts`.

### 13.2 Đừng suy trạng thái của DÒNG từ bộ lọc của TAB

Lỗi CHẶN nặng nhất của GĐ1: FE suy pha cuộc gọi theo tab (`tab === 'before'`), trong khi
backend suy theo dữ liệu của chính dòng (`booking.completedAt` có hay không). Tab "Việc của
tôi" lọc bằng `claimedBy` mà SQL của nó OR **cả hai pha**, nên tab đó chứa lẫn hai loại dòng
— và mọi việc gọi-trước trong đó bị đọc nhầm sang cột `callAfter*` (luôn NULL), khiến dòng
hiện lại nút "Nhận gọi" thay vì nút ghi kết quả: **vòng lặp không lối ra**.

⇒ Quy tắc: khi backend đã có quy tắc suy trạng thái, FE **soi gương đúng quy tắc đó**, không
tự suy lại từ ngữ cảnh màn hình. GĐ3 (ticket có `status` + `slaDueAt`) và GĐ5 (chiến dịch có
`deliveryStatus`) đều có cùng cái bẫy.

### 13.3 Màn mới PHẢI có test cấp trang, không chỉ test hàm thuần

`/crm-queue` ship với `queue-tabs.test.ts` (hàm thuần, 17 ca) nhưng `page.tsx` 358 dòng
**không một dòng test**. Bốn finding — kể cả lỗi CHẶN ở 13.2 — đều nằm gọn trong khoảng
trống đó. Test hàm thuần không chứng minh được gì về thứ người dùng bấm.

### 13.4 `import {} from '...'` sống sót qua SWC

Cắt file mà để lại `import {} from './x';` thì `tsc` **elide** (nên `noUnusedLocals` im, và
repo **không cài eslint**), nhưng SWC của Next **giữ** thành `import './x'` — side-effect
import thật. GĐ1 để sót 17 dòng như vậy, khiến `/crm-queue` vẫn kéo `create-booking-dialog`
vào bundle và việc tách file gần như vô nghĩa (200 → 182 kB sau khi dọn).

⇒ Sau mỗi lần tách file: `grep -rn "^import {} from" src/` và đối chiếu size bằng `next build`.

### 13.5 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` chưa đủ an toàn

CIC bị huỷ giữa chừng để lại index **INVALID nhưng vẫn tồn tại**; lần chạy lại `IF NOT EXISTS`
no-op im lặng rồi đánh dấu migration đã áp dụng ⇒ index vô dụng vĩnh viễn, không log nào báo.
Phải kiểm `pg_index.indisvalid` và DROP trước khi tạo lại.

**Khuôn để copy:** `vigo-backend/src/database/migrations/1793200050000-AddBookingCallPhaseOwnerIndexes.ts`.
(Bản spec trước trỏ vào `1792800200000-ReplaceBookingTeamIndexWithPartial.ts` — file đó **không
tồn tại**; kiểm 2026-08-17 thì trong 222 migration chỉ đúng một file dùng `indisvalid`, là file
nêu trên. Cũng lưu ý migration thật nằm ở `src/database/migrations/`, **không** phải
`src/migrations/` — thư mục sau chỉ có 2 file và dễ nhầm.)

### 13.6 Nợ kỹ thuật chặn GĐ3

`User.password` thiếu `select: false` (`vigo-backend/src/users/user.entity.ts`), trong khi
`isSuperAdmin` ngay dưới thì có. Hệ quả: `GET /bookings/:id` — endpoint **app khách và app
tài xế** gọi — nạp `relations: ['customer','driver.user']` rồi spread thẳng ra response, nên
tài xế nhận bcrypt hash của khách và ngược lại.

Không chặn GĐ0/GĐ1 (cả 3 role được cấp `crm-queue` đều đã có `bookings` từ trước nên mức lộ
không đổi), nhưng **phải vá trước GĐ3**: GĐ3 đẻ ra `crm-compensate` — quyền tiền thật, và là
lúc thật sự cần tạo role hẹp.

> **TRẠNG THÁI 2026-08-17 — ĐÃ VIẾT XONG NHƯNG HOÃN VÔ THỜI HẠN (user chốt).**
> Bản vá đã hoàn chỉnh và xanh (`npx tsc --noEmit` sạch, 217 suite / 3116 test pass): thêm
> `select: false` cho `User.password`, thêm `findByPhoneWithPassword()` cho đúng đường đăng
> nhập, các đường còn lại (kể cả `register`) giữ nguyên `findByPhone`. Đã merge vào `dev` rồi
> **revert** (`git revert -m 1`) theo yêu cầu user: *"nếu phải động đến pass của user thì bỏ
> bước đấy đi, cho vào quên lãng, sau này tính sau"*.
>
> - Code còn nguyên trên nhánh **`fix/user-password-select-false`** (vigo-backend) — lấy lại
>   được, không phải viết lại.
> - `dev` hiện **không** còn dấu vết `findByPhoneWithPassword`; đã đo lại trên DB DEV sau khi
>   revert: 22.392 tài khoản, `password IS NULL` = **0** ở cả 4 role ⇒ revert không hỏng dữ liệu.
> - Cảnh báo revert đã gây thiệt hại phụ: nó xoá kèm
>   `docs/superpowers/plans/2026-08-17-reactivate-deleted-account-on-register.md` (file người
>   khác, lọt vào commit vì `git add -A`) — đã khôi phục.
>
> **Hệ quả cho GĐ3:** điều kiện "vá trước GĐ3" ở trên **chưa được thoả**. Trước khi mở GĐ3
> phải quay lại hỏi user: hoặc bật lại nhánh trên, hoặc chấp nhận rủi ro có văn bản. Đừng
> lặng lẽ làm GĐ3 như thể mục này đã xong.

### 13.7 Những chỗ spec tự mâu thuẫn, cần chốt trước khi làm tiếp

- **Che SĐT khách** — ĐÃ CHỐT 2026-08-14: **giữ hiện đủ** ở `/crm-queue`.
  §11 rủi ro #8 đề xuất che một phần, nhưng §6.1 lại yêu cầu dòng hiển thị "khách + SĐT" —
  spec tự mâu thuẫn, và ở GĐ1 chưa có nút bấm-để-gọi nên che đi thì CSKH phải mở dialog mới
  đọc được số, tức là mất đúng cái tốc độ mà màn này sinh ra để có.
  **Xem lại ở GĐ2**, khi hồ sơ 360 gom "SĐT + tuyến quen + khung giờ quen + timeline" vào một
  chỗ — lúc đó rủi ro tra cứu người quen/đối thủ mới thành thật, và phải đi kèm audit log
  truy cập (hiện backend KHÔNG có bảng audit nào).
- **Cửa sổ thời gian hàng đợi**: §6.1 định nghĩa tab bằng truy vấn nhưng không kẹp thời gian.
  Tab "Cần gọi sau" vì thế bao trọn mọi chuyến COMPLETED lịch sử (cột `callAfterStatus` mới
  thêm nên dữ liệu cũ đều NULL). Phải đếm dữ liệu thật rồi mới quyết.

---

## 14. Quyết định mở khoá GĐ3 + GĐ4 (chốt 2026-08-17)

Bốn điểm mở của §12 đã được chốt. Mục này ghi lại **con số cụ thể và lý do chọn**, để hai
người implement ra cùng một kết quả — đúng thứ §12.4 cảnh báo.

> ⚠️ **Mọi ngưỡng dưới đây nằm trong `system_config`**, ops sửa không cần deploy (đúng mẫu
> `CSKH_CALL_REASONS`). Con số ở đây là **giá trị khởi tạo**, không phải hằng số trong code.

### 14.0 Số liệu nền — đo trên DB DEV ngày 2026-08-17

Mọi ngưỡng bên dưới neo vào số thật, không lấy từ sách CRM:

| Chỉ số | Giá trị |
|---|---|
| Khách (`role=USER`) | 10.486 |
| Chuyến (mọi trạng thái) | 8.171 |
| Chuyến **hoàn thành** | **142** |
| Chuyến đầu tiên → gần nhất | 03/01/2026 → 10/08/2026 (~7 tháng) |
| Giá chuyến hoàn thành | trung vị **300k** · p75 507k · p90 891k · max 1,67tr |
| Phân bố tần suất | **105 khách đi đúng 1 chuyến** · 17 khách 2 chuyến · 1 khách 3 chuyến |
| Độ mới | 62 khách ≤30 ngày · 53 khách 31–60 · 8 khách 61–90 |

**Ba kết luận rút ra, ảnh hưởng trực tiếp tới thiết kế:**

1. **Không dùng ngũ phân vị được.** §12.4 hỏi "ngũ phân vị hay mốc cứng" — dữ liệu trả lời:
   105/123 khách có F đúng bằng 1, chia ngũ phân vị sẽ ra nhiều bin trùng giá trị và điểm số
   nhảy loạn mỗi lần có thêm vài khách. **Dùng MỐC CỨNG.**
2. **Cửa sổ phải ngắn.** Toàn bộ lịch sử mới 7 tháng; ngưỡng "180 ngày không đi = rời bỏ"
   kiểu sách vở sẽ không phân loại được ai.
3. **Bài toán số 1 của ViGo KHÔNG phải churn, mà là chuyến-thứ-hai.** 85% khách hoàn thành
   đúng một chuyến rồi thôi. Xem §14.4 — đây là phát hiện quan trọng hơn cả bốn câu hỏi.

> Cảnh báo: đây là số DEV. Trước khi bật GĐ4 trên prod phải chạy lại đúng bộ truy vấn này
> trên prod và hiệu chỉnh ngưỡng nếu lệch lớn.

### 14.1 Danh mục ticket + SLA

**Nguồn khiếu nại là NHÓM ZALO** ⇒ hệ quả bắt buộc, không phải tuỳ chọn:
- `crm_ticket.source` phải có giá trị `ZALO_GROUP` và đó là **mặc định**.
- Phải có đường **nhập tay** đầy đủ (không có webhook Zalo group): người nhập chọn khách,
  chuyến (tuỳ chọn), loại, mô tả. Thiếu đường này thì GĐ3 không dùng được ngày nào.
- `slaDueAt` tính từ **thời điểm NHẬP**, không phải thời điểm khách kêu (không biết được).
  Thêm ô tuỳ chọn "khách phản ánh lúc" để đo độ trễ của chính kênh Zalo.

Danh mục cố ý **nhỏ và khớp từ vựng đã có** (`PenaltyReasonCode`, `CSKH_CALL_REASONS`) —
đẻ bộ từ vựng thứ tư là sau này không đối chiếu được số liệu với nhau.

| Mã | Nhãn | Phản hồi | Đóng | Vì sao mốc đó |
|---|---|---|---|---|
| `NO_SHOW_DRIVER` | Tài xế không đến / bỏ khách | **1h** | 8h | Khách đang đứng ngoài đường — khẩn nhất, mọi thứ khác chờ được |
| `UNSAFE_DRIVING` | Chạy ẩu, mất an toàn | **1h** | 24h | An toàn: phải chặn tài xế đó nhận chuyến mới trước đã |
| `LOST_ITEM` | Bỏ quên đồ trên xe | **2h** | 24h | Tài xế còn chạy tiếp; qua ngày là đồ đi xa hoặc mất dấu |
| `OVERCHARGE` | Thu sai giá / thu thêm | 4h | 24h | Dính tiền, và thường kèm đền bù |
| `DRIVER_ATTITUDE` | Thái độ tài xế | 4h | 24h | Không khẩn nhưng để lâu là mất khách |
| `OFF_PLATFORM` | Rủ đi ngoài app | 8h | 48h | Khớp `PenaltyReasonCode.OFF_PLATFORM` — nối thẳng sang màn phạt |
| `BOOKING_ISSUE` | Lỗi đặt chuyến / app | 8h | 48h | Thường là bug, không phải tranh chấp |
| `OTHER` | Khác | 8h | 48h | Bắt buộc có, và phải theo dõi tỉ lệ — `OTHER` phình to nghĩa là danh mục sai |

**Lưu ở `system_config`**, key `CRM_TICKET_CATEGORIES`, mỗi mục `MÃ|Nhãn|giờ phản hồi|giờ đóng`,
ngăn bằng `;` — cùng lối `CSKH_CALL_REASONS` đang dùng.

**SLA đếm theo GIỜ HÀNH CHÍNH hay giờ liên tục?** Chốt: **giờ liên tục (24/7)**, vì dịch vụ
chạy 24/7 và khách bị bỏ lúc 22h không thể chờ tới 8h sáng. Nếu sau này ops thấy quá gắt thì
chỉnh số giờ, đừng đổi sang giờ hành chính — đổi cách đếm làm mọi số liệu cũ hết so sánh được.

### 14.2 Hạn mức đền bù

Neo vào giá chuyến thật: trung vị **300k**, p90 **891k**.

| Vai trò | Được làm gì | Trần / vụ | Trần / ngày |
|---|---|---|---|
| Có `crm-tickets` (CSKH tuyến đầu) | Tạo, xử lý, **ĐỀ XUẤT** mức đền bù | **0đ** — không tự duyệt được | — |
| Có `crm-compensate` (giám sát) | Duyệt & thực hiện đền bù | **≤ 500.000đ** | **≤ 3.000.000đ** |
| Super admin | Mọi mức | không trần | không trần |

**Lý do các con số:**
- **500k/vụ** ≈ p75 giá chuyến. Đủ để hoàn trọn một chuyến bình thường mà không cần ai duyệt
  thêm — tức là xử lý xong tại chỗ đúng phần lớn ca thực tế.
- **3tr/ngày** chặn kiểu rò rỉ nguy hiểm hơn: một người rải nhiều lần nhỏ. Trần/vụ một mình
  không chặn được việc này.
- **CSKH = 0đ** là theo đúng §6.4 (*"không gộp vào quyền xem ticket"*). Nhưng cho họ **đề xuất
  mức** — nếu không, mọi ca đền bù đều phải kể lại câu chuyện cho giám sát, và giám sát sẽ
  duyệt mù.

**Bắt buộc kèm mọi lần đền bù** (không phải khuyến nghị):
- Gắn `ticketId`, và `bookingId` nếu có.
- Ghi vết **append-only** (mẫu `BookingCustomerCallEvent`): ai duyệt, bao nhiêu, lý do, lúc nào.
- Vượt trần → **chặn ở BACKEND**, không chỉ ẩn nút ở FE.

`system_config`: `CRM_COMPENSATE_MAX_PER_CASE=500000`, `CRM_COMPENSATE_MAX_PER_DAY=3000000`.

### 14.3 Công thức RFM + ngưỡng rời bỏ

**Mốc cứng, không ngũ phân vị** (§14.0 lý do 1). Cửa sổ tính **180 ngày**, khớp độ dài lịch sử
thật. Chỉ đếm chuyến `COMPLETED`.

**R — độ mới** (số ngày kể từ chuyến hoàn thành gần nhất):

| Điểm | Ngưỡng |
|---|---|
| 5 | ≤ 14 ngày |
| 4 | 15–30 |
| 3 | 31–60 |
| 2 | 61–90 |
| 1 | > 90 ngày |

**F — tần suất** (số chuyến hoàn thành trong 180 ngày): 1 → 1đ · 2 → 2đ · 3–5 → 3đ · 6–9 → 4đ ·
≥10 → 5đ.

**M — giá trị** (tổng `price` chuyến hoàn thành trong 180 ngày): <500k → 1đ · 500k–1tr → 2đ ·
1–2tr → 3đ · 2–5tr → 4đ · ≥5tr → 5đ. *(Neo: 5tr ≈ 16 chuyến trung vị; 500k ≈ chưa tới 2 chuyến.)*

**Phân khúc — suy ra từ điểm, KHÔNG lưu chuỗi tự do:**

| Phân khúc | Điều kiện | Việc cần làm |
|---|---|---|
| `MOI_CHUA_QUAY_LAI` | F=1 **và** R≥3 | Kéo về chuyến thứ hai — nhóm lớn nhất, xem §14.4 |
| `DANG_HOAT_DONG` | R≥4 **và** F≥3 | Giữ nguyên, đừng làm phiền |
| `VIP` | F≥4 **và** M≥4 | Ưu tiên xử lý ticket, chăm riêng |
| `NGUY_CO_ROI_BO` | F≥2 **và** R=2 | Win-back: từng đi đều, đang chững lại |
| `DA_ROI_BO` | F≥2 **và** R=1 | Chiến dịch kéo lại, kỳ vọng thấp |
| `MOT_LAN_ROI_THOI` | F=1 **và** R≤2 | Khác hẳn "rời bỏ" — xem dưới |

**`churnRisk` — định nghĩa hẹp, cố ý:** chỉ tính cho khách **F≥2**. Khách mới đi 1 lần rồi
biến mất **KHÔNG phải "rời bỏ"** — họ chưa bao giờ là khách quen để mà mất. Gộp hai nhóm này
là hỏng cả số liệu lẫn hành động: một bên cần *win-back* (gọi lại, ưu đãi giữ chân), bên kia
cần *onboarding* (lý do để đi lần hai). Trộn vào nhau thì mọi chiến dịch đều nhắm sai người.

`churnRisk = HIGH` khi F≥2 và R≤2; `MEDIUM` khi F≥2 và R=3; còn lại `LOW`.

Toàn bộ ngưỡng lưu ở `system_config` key `CRM_RFM_THRESHOLDS` (JSON), cron tính lại **03:00
giờ VN** theo §8.2.

### 14.4 Phát hiện quan trọng hơn cả 4 câu hỏi

**105 trên 123 khách có chuyến hoàn thành chỉ đi đúng MỘT lần** (85%). 17 người đi 2 lần, 1
người đi 3 lần.

Nghĩa là toàn bộ khung CRM cổ điển — phân khúc VIP, cảnh báo rời bỏ, chiến dịch giữ chân —
đang nhắm vào một tập gần như rỗng. Chỉ 18 khách có F≥2 để mà "giữ".

Việc đáng tiền nhất của CRM ViGo lúc này là **chuyển khách đi-một-lần thành đi-lần-hai**, và
nó cần đúng hai thứ, cả hai đều rẻ hơn nhiều so với GĐ4–GĐ5:

1. **Biết vì sao họ không quay lại.** ⚠️ **ĐÍNH CHÍNH 2026-08-17** — bản đầu của mục này
   viết rằng dữ liệu "đã có sẵn". Đo lại thì KHÔNG:

   | Bảng | Số dòng (DEV) |
   |---|---|
   | `booking_customer_call_event` | 1.437 ✅ dùng được |
   | `driver_trip_rating` | **1** ❌ gần như rỗng |

   Tức là **chưa có dữ liệu CSAT để khai thác** — tính năng đánh giá chuyến gần như không ai
   dùng. Nên việc cần làm trước không phải "đọc dữ liệu sẵn có" mà là **làm cho khách chịu
   đánh giá** (nhắc sau chuyến, hoặc hỏi ngay trong cuộc gọi-sau của hàng đợi CSKH — GĐ1 đã
   có sẵn ô `reason` + `note` cho việc đó).

   Nguồn dùng được NGAY là `booking_customer_call_event` (1.437 dòng, có `reason` chuẩn hoá).
   **Phải đếm lại trên PROD trước khi kết luận** — khách không đánh giá trên DEV là chuyện
   bình thường.
2. **Một chiến dịch duy nhất, nhắm đúng nhóm `MOI_CHUA_QUAY_LAI`.**

⇒ **Đề xuất đổi thứ tự lộ trình**: cân nhắc làm GĐ7 (Insights — cohort giữ chân, CSAT) *trước*
GĐ4/GĐ5, hoặc ít nhất tách phần "báo cáo lý do không quay lại" ra làm sớm. Xây bộ máy phân
khúc + chiến dịch cho 18 khách là đầu tư sai chỗ. **Cần user quyết** — spec đang xếp GĐ7 là
"tuỳ chọn", số liệu này nói ngược lại.

---

## 15. Kết quả GĐ2 + bài học — viết SAU khi ship, đọc TRƯỚC khi làm GĐ3

Ngày 2026-08-17. Cả hai đợt đã ở `dev`: backend `feat/crm-queue-api`, admin `feat/crm-queue`
(tiếp nhánh GĐ1, KHÔNG cắt nhánh mới — theo luật nhịp deploy).

### 15.0 Đã ship những gì

| Lớp | Nội dung |
|---|---|
| DB | `crm_customer_tag`, `crm_customer_note`, `crm_customer_access_log` (**bảng audit đầu tiên của hệ thống**) + index `notification(userId, createdAt DESC)` |
| API | 11 route dưới `admin/crm`, gate `@RequireFunction('users')` cấp class — **không đẻ function RBAC mới**, nên không cần migration cấp quyền và không phải bump số đếm cứng |
| Admin | 3 khối trên `/users/detail` (Nguồn khách · Nhãn & ghi chú · Timeline) + `PhoneCell` ở `/users` và `/users/detail` |

Kiểm: backend 226 suite / 3222 test + 12/12 integration; admin 82 file test / 861 test,
`next build` xanh.

### 15.1 Mock KHÔNG thay được SQL thật — lỗi mà chỉ integration spec bắt được

Trong `UNION ALL`, tên cột của cả CTE lấy từ nhánh **ĐẦU TIÊN**. Ban đầu chỉ nhánh `CALL`
khai alias, nên mọi truy vấn có `sources` **không chứa** `CALL` (vd bật "hiện cả thông báo")
đều chết với `column ev.kind does not exist`.

Test mock `dataSource.query` **xanh 100%** với lỗi này — nó chỉ kiểm chuỗi SQL trông ra sao,
không kiểm Postgres có chấp nhận hay không.

⇒ Quy tắc: nhánh UNION nào cũng phải khai alias tường minh, và **mọi câu SQL thô mới phải có
một ca chạy trên Postgres thật** trước khi tin. Áp cho GĐ4 (cron RFM) và GĐ7 (cohort) — hai
giai đoạn viết SQL tổng hợp nặng nhất.

### 15.2 Merge: file MỚI TÁCH RA không báo xung đột, nên thay đổi của `main` biến mất ÂM THẦM

GĐ1 bóc `BookingDetail` + `PriceBreakdownCard` từ `bookings-table.tsx` sang
`booking-detail.tsx`. Khi merge `main` vào nhánh feature:

- `bookings-table.tsx` báo xung đột (đúng, ai cũng thấy);
- `booking-detail.tsx` **KHÔNG** báo xung đột — vì `main` không có file đó.

Nghĩa là nếu chỉ "giải xung đột" ở file cũ bằng cách xoá khối đã bóc, thì **toàn bộ thay đổi
của `main` trong `BookingDetail` bốc hơi mà git không nói một lời**.

⇒ Sau MỖI lần tách file, khi merge nhánh khác vào phải hỏi: *nhánh kia có sửa gì trong phần
đã bị bóc không?* Cách kiểm rẻ: `git log --oneline --no-merges origin/main..<nhánh> -- <nhóm file>`.

### 15.3 `dev` từng hỏng vì đúng cái bẫy 15.2 — và `next build` không chặn

Lần giải xung đột trước đó trên `dev` đã đánh rơi `import { Switch }` khỏi
`bookings-table.tsx`, trong khi file vẫn dùng `<Switch>` ở dialog **"Gán tài xế"**. Hệ quả:
mở dialog đó trên DEV là `ReferenceError`. `npx next build` **không** bắt vì
`next.config.ts` bật `ignoreBuildErrors` — chỉ `npx tsc --noEmit` mới thấy.

⇒ Nhắc lại gotcha đã có trong CLAUDE.md, giờ đã có nạn nhân thật: **`tsc` mới là cổng, không
phải `build`.** Chạy `tsc` sau MỌI lần giải xung đột, kể cả xung đột "trông như chỉ là comment".

### 15.4 Che dữ liệu: che nửa vời = không che

Reviewer độc lập tìm ra: sau khi che SĐT ở `users/admin/list` + `users/admin/:id`,
`GET admin/crm/customers/:id/source` vẫn trả **SĐT đầy đủ của người giới thiệu, không ghi
vết** — ngay trên chính trang vừa làm chặt. Mà **ai chia sẻ mã giới thiệu cũng thành
referrer**, nên duyệt danh bạ rồi mở lần lượt từng hồ sơ là gom được SĐT của cả tập
khách-là-referrer, hoàn toàn không để lại dấu vết.

⇒ Khi che một trường, phải liệt kê **MỌI endpoint trả trường đó** rồi mới tuyên bố đã che.
Ghi rõ giới hạn: GĐ2 chỉ bảo vệ nhánh quyền `users`; `referral.service.ts` vẫn trả đầy đủ cả
`referrer.phone` lẫn `referee.phone` cho người có function `referrals` — bề mặt CÓ SẴN, ngoài
phạm vi GĐ2, **đừng hiểu nhầm là "SĐT khách đã được bảo vệ"**.

### 15.5 Test giờ VN trên máy giờ VN là XANH GIẢ

`/users/detail` có 3 mốc dùng `date-fns.format()` (giờ TRÌNH DUYỆT). Viết 7 ca test giờ thì
**6 ca xanh** — vì máy dev đang ở `Asia/Ho_Chi_Minh` nên giờ trình duyệt tình cờ trùng giờ VN.
Chỉ ca ghim `process.env.TZ = 'America/New_York'` mới đỏ.

⇒ Mọi ca test giờ VN phải có **ít nhất một ca ghim múi giờ không-VN không-UTC**, nếu không
nó chỉ đang kiểm chính cấu hình máy chạy test.

### 15.6 Nợ chặn GĐ3 — CHƯA thoả

`User.password` thiếu `select: false` (§13.6) vẫn **hoãn vô thời hạn** theo quyết định user.
`getAdminUserDetail` vẫn `return { ...user }`, tức vẫn trả bcrypt hash cho admin.

GĐ2 cố ý **không** đụng (đúng phạm vi), và reviewer xác nhận code mới **không mở rộng** bề
mặt rò. Nhưng điều kiện "vá trước GĐ3" của §13.6 vì thế **chưa được thoả**, trong khi GĐ3
chính là lúc đẻ `crm-compensate` — quyền tiền thật, và là lúc thật sự cần tạo role hẹp.

**Trước khi mở GĐ3 phải hỏi user** một trong ba: (a) bật lại nhánh
`fix/user-password-select-false`; (b) làm bản vá hẹp hơn — chỉ loại field `password` khỏi
riêng response `getAdminUserDetail`, không đụng luồng auth; (c) chấp nhận rủi ro có văn bản.

### 15.7 Việc CÒN LẠI của GĐ2

- **Test DEV** (chưa ai bấm): xem `docs/superpowers/runbooks/2026-08-17-crm-gd0-gd1-test-dev.md`
  cho GĐ0/GĐ1, và mục "Hoàn tất GĐ2" trong plan GĐ2 cho GĐ2.
  Hai mục dễ quên nhất: `indisvalid = t` của `IDX_notification_user_created` (§13.5), và ca
  đối chiếu giờ giữa một nguồn `timestamptz` với một nguồn `timestamp` xảy ra cùng buổi.
- **Admin GĐ2 chưa qua reviewer độc lập** (cap 1 lượt/thay đổi đã dùng cho backend).
- Finding GÓP Ý cố ý bỏ qua: UNIQUE `(userId, tag)` phân biệt HOA/thường. Sửa đúng cách cần
  unique trên `lower("tag")`, mà TypeORM không diễn đạt được index biểu thức nên `@Index` ở
  entity sẽ lệch DB và `migration:generate` đẻ diff giả. FE dùng dropdown nên đường vào hẹp.
