# CRM GĐ3 — Ticket khiếu nại + SLA + Đền bù — Implementation Plan

**Ngày:** 2026-08-17 · **Trạng thái:** CHỜ USER DUYỆT, chưa code một dòng nào.

**Mức rủi ro: CAO** (CLAUDE.md 0.5.b) — đụng **tiền thật** (đền bù vào ví khách) và **vùng
quyền** (đẻ 2 function RBAC mới, trong đó một cái không thuộc menu). Bắt buộc reviewer độc
lập trước khi merge.

**Nguồn quyết định đã chốt, KHÔNG mở lại:** spec §14.1 (danh mục ticket + SLA), §14.2 (hạn
mức đền bù), §7.1 (hạ tầng function không-menu), §6.4 (tách quyền đền bù khỏi quyền xem).

---

## 0. Điều kiện vào — đã thoả

| Điều kiện | Trạng thái |
|---|---|
| Nợ `User.password` (§13.6/§15.6) | ✅ Đã vá HẸP 2026-08-17 (`getAdminUserDetail` không còn trả `password`). Bản vá tận gốc vẫn hoãn. |
| Danh mục ticket + SLA | ✅ §14.1 |
| Hạn mức đền bù | ✅ §14.2 |
| GĐ2 đã ở `dev` | ✅ |

⚠️ **CHƯA thoả:** GĐ0/GĐ1/GĐ2 **chưa ai test trên DEV**. Plan này code được, nhưng
**không nên merge GĐ3 vào `dev` khi GĐ2 chưa được người thật xác nhận** — dồn 4 giai đoạn
chưa verify lên cùng một môi trường thì lúc có lỗi không biết tại giai đoạn nào.

---

## 1. Phạm vi

**Nhánh:** tiếp `feat/crm-queue-api` (backend) và `feat/crm-queue` (admin) — KHÔNG cắt nhánh
mới, theo luật nhịp deploy. Rollout **backend trước**.

**Làm:**
1. Hạ tầng **function không-menu** (§7.1) — điều kiện tiên quyết của mọi thứ còn lại.
2. 2 bảng: `crm_ticket`, `crm_ticket_event`.
3. Đường **nhập tay** ticket (nguồn = nhóm Zalo).
4. SLA đếm ngược theo giờ VN.
5. **Đền bù** vào ví khách, có trần, chặn ở BACKEND, ghi vết append-only.
6. Màn `/crm-tickets` + khối "Danh sách ticket" trên hồ sơ 360 (§6.3 gán cho GĐ3).

**KHÔNG làm (chống trôi phạm vi):**
- Webhook Zalo (không có API cho group chat — nên §14.1 mới bắt buộc nhập tay).
- Màn xem `crm_customer_access_log` (thuộc GĐ4, cùng lúc với phân quyền xem audit).
- Tự động hoá SLA (nhắc/leo thang) — GĐ3 chỉ **hiển thị** đếm ngược.
- Voucher đền bù — GĐ3 chỉ đền bằng **ví**. Voucher đi qua `user_promotion` (§5.4) và thuộc GĐ5.

---

## 2. Hạ tầng function không-menu — LÀM TRƯỚC, chặn mọi thứ khác

Đây là mục §7.1 spec bắt "phải chốt trước GĐ3". Đã kiểm lại hiện trạng 2026-08-17:

| Nơi | Hiện trạng | Hệ quả |
|---|---|---|
| BE `src/rbac/rbac.constants.ts` | `ALL_FUNCTION_KEYS = [...MENU_FUNCTIONS, ...SETTINGS_FUNCTIONS]` | Không có chỗ cho function không-href |
| FE `src/lib/function-catalog.ts` | `buildFunctionCatalog()` dựng từ **`navItems`** + `CONFIG_GROUPS` | Function không có href **không xuất hiện trong danh sách tick → KHÔNG CẤP ĐƯỢC CHO AI** |

⇒ Không làm mục này thì `crm-compensate` chỉ super admin dùng được, hoặc đội implement sẽ
"chữa" bằng cách gộp nó vào `crm-tickets` — đúng thứ §6.4 cấm.

**Việc:**
- BE: thêm `SPECIAL_FUNCTIONS = ['crm-compensate']`, nối vào `ALL_FUNCTION_KEYS`.
- FE: thêm nhóm thứ ba `Chức năng đặc biệt (không thuộc menu)` vào `buildFunctionCatalog()`,
  với nhãn tiếng Việt + **mô tả cảnh báo** ("cấp quyền trừ/cấp tiền thật").
- FE: `crm-tickets` là function CÓ menu → thêm vào `navItems` + `MENU_FUNCTION_BY_HREF`.
- **Bump số đếm cứng** (§7.2, §13.1): `src/lib/rbac.test.ts` 30 → **31**;
  `src/lib/function-catalog.test.ts` 40 → **42** (+`crm-tickets` +`crm-compensate`).
  Quên là đỏ CI ngay — đó là mục đích của nó.
- **Test parity FE↔BE**: hiện KHÔNG có cổng nào so `MENU_FUNCTION_BY_HREF` (FE) với
  `MENU_FUNCTIONS` (BE). Thêm một test đọc danh sách BE (copy hằng số) để lệch là đỏ.

**Bài học §13.1 — BẮT BUỘC:** thêm key vào `MENU_FUNCTIONS` chỉ làm key **hợp lệ**, KHÔNG
gán cho ai. Hai migration seed role đều `ON CONFLICT DO NOTHING` và đã chạy xong trên prod
⇒ hàng `admin_role` hiện có **không bao giờ được cập nhật lại**. Phải có migration cấp quyền:

| Function | Cấp cho | Khuôn |
|---|---|---|
| `crm-tickets` | `cskh`, `quan-ly-chung`, `full-access-legacy` | `1793200200000-GrantCrmQueueToCskhRoles.ts` |
| `crm-compensate` | **CHỈ** `quan-ly-chung`, `full-access-legacy` | như trên |

🚨 **Không cấp `crm-compensate` cho `cskh`.** Đó là toàn bộ lý do nó tồn tại (§6.4/§14.2:
CSKH chỉ ĐỀ XUẤT mức, không tự duyệt).

---

## 3. Mô hình dữ liệu

### `crm_ticket`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `code` | varchar UNIQUE | Sinh bằng **sequence ở DB**, KHÔNG đếm trong service (tránh race) |
| `customerUserId` | uuid NOT NULL | |
| `bookingId` | uuid NULL | Ticket có thể không gắn chuyến |
| `driverId` | uuid NULL | |
| `category` | varchar | 8 mã của §14.1 |
| `severity` | varchar | |
| `status` | varchar | `OPEN` → `IN_PROGRESS` → `RESOLVED` → `CLOSED` (+ `REJECTED`) |
| `assigneeAdminId` | uuid NULL | |
| `source` | varchar | **mặc định `ZALO_GROUP`** (§14.1) |
| `reportedAt` | timestamptz NULL | "khách phản ánh lúc" — ô TUỲ CHỌN, để đo độ trễ của chính kênh Zalo |
| `slaRespondDueAt` | timestamptz | Tính từ thời điểm **NHẬP**, không phải lúc khách kêu |
| `slaResolveDueAt` | timestamptz | |
| `firstRespondedAt` | timestamptz NULL | |
| `resolution` | text NULL | |
| `compensationAmount` | numeric NULL | Tổng đã duyệt |
| `createdByAdminId` | uuid NOT NULL | |
| `createdAt` / `updatedAt` | timestamptz | |

**`timestamptz` cho MỌI mốc** — theo §15.1/§5.3: bảng mới thì chọn tz-aware ngay, khỏi phải
ép `AT TIME ZONE` khi vào timeline hồ sơ 360.

Index: `(customerUserId, createdAt DESC)`, `(status, slaResolveDueAt)` (nuôi màn hàng đợi +
đếm ngược), `(assigneeAdminId, status)`.

### `crm_ticket_event`

Append-only, đúng mẫu `BookingCustomerCallEvent`: `ticketId`, `type`
(`CREATED|STATUS_CHANGE|NOTE|ASSIGN|COMPENSATION_PROPOSED|COMPENSATION_APPROVED|COMPENSATION_REJECTED`),
`fromStatus`/`toStatus`, `note`, `amount`, `byAdminUserId`, `createdAt timestamptz`.

🚨 **Mọi lần đền bù PHẢI đẻ một dòng ở đây** (§14.2: ai duyệt, bao nhiêu, lý do, lúc nào).
Không có đường sửa, không có đường xoá.

### `system_config` seed

`CRM_TICKET_CATEGORIES` (8 mục `MÃ|Nhãn|giờ phản hồi|giờ đóng`, ngăn `;` — cùng lối
`CSKH_CALL_REASONS`), `CRM_COMPENSATE_MAX_PER_CASE=500000`,
`CRM_COMPENSATE_MAX_PER_DAY=3000000`.

⚠️ Nhắc lại cảnh báo §5.2: key `CRM_*` rơi vào nhóm `settings.misc` ⇒ **chỉ super admin sửa
được**. Nói thẳng với ops, đừng hứa "ops tự chỉnh".

---

## 4. Đền bù — phần nguy hiểm nhất

**Chưa có đường cấp tiền vào ví KHÁCH.** `adminAdjustDriverWallet` chỉ làm ví TÀI XẾ
(`DRIVER_MAIN`/`DRIVER_DEPOSIT`) và đòi **mật khẩu cấp 2**. GĐ3 phải thêm đường mới cho
`WalletType.USER`.

**Chốt chặn — TẤT CẢ ở BACKEND, không chỉ ẩn nút ở FE:**

1. `@RequireFunction('crm-compensate')` trên **đúng** route duyệt đền bù (route tạo/xem
   ticket vẫn `crm-tickets`). Guard là any-of ⇒ **không** khai thêm key nào khác.
2. Trần **500.000đ/vụ** và **3.000.000đ/ngày/người duyệt** (§14.2). Trần ngày tính theo
   **ngày VN** — dùng `vnRangeToUtc`, không dùng `now() - 24h`.
3. Bắt buộc gắn `ticketId`; `bookingId` nếu có.
4. Ghi `crm_ticket_event` **trong CÙNG transaction** với bút toán ví. Ghi ngoài transaction
   là có ngày ví đổi mà không có vết.
5. Super admin không bị trần (§14.2) — nhưng vẫn ghi vết như mọi người.

**Câu cần user chốt trước khi code — có mật khẩu cấp 2 không?**
- `adminAdjustDriverWallet` **CÓ**. `driver-penalty` **KHÔNG**, và đã ghi rõ lý do: thao tác
  diễn ra hàng ngày, thêm một lớp mật khẩu sẽ khiến người ta bỏ qua việc phạt; bù lại số
  tiền không do người nhập và có nhiều lớp chặn khác.
- Đền bù CRM giống `driver-penalty` hơn (thao tác thường xuyên, đã có trần + quyền riêng +
  ghi vết), nhưng KHÁC ở một điểm: **số tiền DO NGƯỜI NHẬP**.
- **Đề xuất:** KHÔNG mật khẩu cấp 2 cho mức ≤ trần; nhưng **vượt trần thì chặn cứng** chứ
  không cho super admin gõ mật khẩu để vượt. Cần bạn xác nhận.

---

## 5. Backend — endpoint

Prefix `admin/crm/tickets`, gate `@RequireFunction('crm-tickets')` cấp class.

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /` | `crm-tickets` | Lọc status/category/assignee/quá hạn; sắp theo SLA gần hết hạn trước |
| `POST /` | `crm-tickets` | **Nhập tay**; `source` mặc định `ZALO_GROUP`; tính `slaRespondDueAt`/`slaResolveDueAt` từ danh mục |
| `GET /:id` | `crm-tickets` | Kèm timeline sự kiện |
| `POST /:id/status` | `crm-tickets` | Đổi trạng thái + ghi event |
| `POST /:id/assign` | `crm-tickets` | |
| `POST /:id/note` | `crm-tickets` | |
| `POST /:id/compensation/propose` | `crm-tickets` | CSKH **đề xuất** mức (§14.2) — không đụng ví |
| `POST /:id/compensation/approve` | **`crm-compensate`** | Duyệt + ghi ví + event, một transaction |
| `GET /categories` | `crm-tickets` | Danh mục + SLA từ `system_config`, có fallback hardcode |
| `GET admin/crm/customers/:id/tickets` | `crm-tickets` | Khối trên hồ sơ 360 |

**Timeline hồ sơ 360:** thêm nhánh `TICKET` vào `crm-timeline.service.ts`.
🚨 `crm_ticket.createdAt` là `timestamptz` ⇒ **ĐỂ NGUYÊN**, không bọc `AT TIME ZONE 'UTC'`
(§15.1 — bọc lên cột đã tz là HẠ kiểu, lệch 7h theo chiều ngược). Và phải khai **alias cột
tường minh** cho nhánh mới, nếu không lại đúng lỗi `column ev.kind does not exist`.

---

## 6. Admin — màn hình

- `/crm-tickets`: danh sách + **đếm ngược SLA** (đỏ khi quá hạn), lọc, nút tạo ticket tay.
- Chi tiết: timeline xử lý + ô đề xuất đền bù + nút duyệt.
- Nút duyệt đền bù bọc `can('crm-compensate')` — **nhưng BE vẫn là chốt cuối**.
- Khối "Ticket" trên `/users/detail` (trong cụm gate `role === 'USER'` đã có).
- Giờ VN: `formatVnDateTime`. Đếm ngược tính bằng hiệu hai mốc nên không dính múi giờ, nhưng
  **mốc hiển thị thì có** — phải có ca test ghim `process.env.TZ` không-VN (§15.5).

**Bẫy §13.2 ở hình dạng mới:** ticket có `status` + `slaResolveDueAt` của CHÍNH DÒNG. Nút
hiện ra phải suy từ dòng đó, **không** từ tab/bộ lọc đang chọn. GĐ1 đã mất một vòng vì lỗi
này, GĐ2 tránh được nhờ viết thành test — làm y hệt ở đây.

---

## 7. Thứ tự thực hiện

1. **RBAC không-menu** (BE + FE + 2 migration cấp quyền + bump 2 số đếm + test parity)
2. Migration 2 bảng + seed config
3. Service ticket + SLA + endpoint đọc/ghi (chưa có đền bù)
4. **Đền bù** — service + transaction + trần + event (phần cần review kỹ nhất)
5. Nhánh `TICKET` vào timeline 360
6. Admin: `/crm-tickets` + khối ticket trên hồ sơ 360
7. Reviewer độc lập (bắt buộc, model mạnh) → vá → merge `dev`

Timestamp migration: **> `1793700200000`** (cao nhất hiện có). Dùng `1793800000000`,
`1793800100000`.

## 8. Cổng kiểm

- BE: `npx tsc --noEmit && npm test` + `npm run test:integration` (**bước riêng**)
- Admin: `npx tsc --noEmit && npx vitest run && npx next build` (**KHÔNG** `npm run build`)
- `grep -rn "^import {} from" src/` phải rỗng (§13.4)
- Test cấp trang cho `/crm-tickets` ngay từ đầu (§13.3 — đừng lặp lại lỗi ship màn không test)

## 9. Câu còn mở — cần user chốt

1. **Mật khẩu cấp 2 cho duyệt đền bù?** (đề xuất: không, nhưng chặn cứng khi vượt trần).
2. **Đền bù vào ví `USER` hay `USER_REFERRAL`?** Đề xuất `USER` — `USER_REFERRAL` là tiền
   hoa hồng, trộn vào sẽ làm hỏng đối soát affiliate.
3. **Khách chưa có ví thì sao?** Đề xuất: tạo ví `USER` số dư 0 rồi cấp — nhưng cần xác nhận
   vì nó đẻ hàng mới ở bảng ví.
4. **Ai đóng ticket?** Người xử lý tự đóng, hay cần giám sát duyệt? §14 không nói.
