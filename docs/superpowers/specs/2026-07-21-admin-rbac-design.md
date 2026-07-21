# Phân quyền admin theo function (RBAC) — Design

**Ngày:** 2026-07-21 · **Repos:** `vigo-backend` (rollout TRƯỚC) + `vigo-admin` · **Tác giả:** Vigo team

---

## 1. Mục tiêu & phạm vi

Cho phép chia quyền các tài khoản admin của **web app admin nội bộ** (`vigo-admin`, khu vực `(app)/*`)
theo **function** — mỗi function ≈ một mục ở menu trái hiện tại, cộng các nhóm trong trang Cài đặt.

- **Role** = một túi function, **đặt tên + sửa được** trong UI (vd "Vận hành", "Tài chính", "Quản lý HTX").
- **User có nhiều role** → quyền = **hợp** function của các role.
- **Admin tổng (super admin) thêm/bớt function per-user** qua override `GRANT`/`REVOKE`.
- **Enforcement 2 tầng:** backend **chặn thật** trên mọi endpoint admin (nguồn an ninh) + frontend **ẩn menu/route** (UX). Vì admin là static export (bundle JS public), che ở frontend chỉ là UX — an ninh phải nằm ở backend.

### Ngoài phạm vi (để sau)

- Quyền theo **action nhỏ** (create/read/update/delete) trong một function.
- Quyền theo **item cụ thể** (vd chỉ xem booking của 1 tỉnh).
- Các **portal riêng** (`htx/*`, `agent-portal/*`, `kol-portal/*`) — đã có role riêng (`TRANSPORT_COMPANY_OWNER`…), **không** đụng đợt này.
- App khách/tài xế — không liên quan.

---

## 2. Mô hình quyền

### 2.1 Function (đơn vị quyền)

- **Danh mục function nằm trong CODE** (nguồn chân lý ở cả BE lẫn FE), **không** cho tạo tự do trong DB — vì function ánh xạ tới route/endpoint có thật. Role/override tham chiếu function bằng `key` string.
- Suy trực tiếp từ menu thật (`src/app/(app)/layout.tsx` → `navItems`) + nhóm cấu hình (`settings/components/system-config-groups.ts` → `CONFIG_GROUPS`).

**Nhóm menu (25 function — mỗi mục menu = 1 function; verify trên nhánh build `feat/admin-rbac`←`origin/main`, `layout.tsx:56-81`):**

```
dashboard, users, drivers, transport-companies, bookings, referrals, kol,
agent, agent-orders, withdrawals, finance, acquisition, driver-cashflow,
htx-reconciliation, invoices, master-data, promotions, reports,
notifications, news, banners, app-popups, feedback,
leakage-review, driver-cancel-review
```

> `acquisition` (Nguồn khách) **có trên `main` nhưng KHÔNG có trên nhánh carpool cũ** — bằng chứng branch-drift: catalog phải chốt theo nhánh build. BE tương ứng: route `admin/acquisition`.

> **⚠️ NHÁNH NỀN = `main` (bắt buộc pin).** Trên `main`, `system-config-groups.ts` có **8** nhóm gồm `phone-reveal` (verify: `git show main:…` → `phone-reveal` dòng 32, match `PHONE_REVEAL_`). Nhánh checkout cũ `feat/admin-carpool-seat-discount` chỉ có **7** (thiếu `phone-reveal`) → **đừng đọc catalog từ nhánh đó**. RBAC **cắt từ `main`** (git workflow). **Plan bắt buộc:** pin base=`main`, và **verify lại `CONFIG_GROUPS.id` + `navItems` trên đúng nhánh sẽ build** trước khi khoá con số trong test đồng bộ. (Trên `main`, key `PHONE_REVEAL_*` khớp nhóm `phone-reveal`, **không** rơi vào `misc` → tính năng ẩn-SĐT **không** bị biến thành super-only.)

**Nhóm Cài đặt (8 function — khớp ĐÚNG 8 `CONFIG_GROUPS.id` trên `main`, `phone-reveal` @:32, `misc` @:35):**

```
settings.app            → "Phiên bản App"
settings.pricing        → "Giá & Hoa hồng"
settings.dispatch       → "Điều phối & Tuyến"
settings.driver         → "Tài xế"
settings.growth         → "Giới thiệu & Hạng thành viên"
settings.cancel         → "Chống huỷ chuyến (khoá tài xế)"
settings.phone-reveal   → "Ẩn số điện thoại khách"
settings.misc           → "Tích hợp & Khác" (catch-all)
```

> **Yêu cầu user:** trang Cài đặt **bỏ** các tab "Hồ sơ", "Tích hợp API", "Thông báo" — **chỉ giữ** "Cấu hình hệ thống", chia theo 8 nhóm trên. Menu "Cài đặt" chỉ hiện nếu user có **≥1** function `settings.*`; mỗi tab nhóm hiện theo function tương ứng.

**Quản lý phân quyền:** trang `/roles` (list/CRUD role, gán role & override cho user) — **chỉ Super Admin** truy cập; không phát hành thành function gán được.

> **Đồng bộ catalog:** có **1 test** (BE và/hoặc FE) khẳng định tập function trong catalog **phủ đúng** tập `navItems` (mọi mục kể cả `dashboard`; trừ đúng mục `settings` vì nó nở thành 8 function con) và **đúng bằng** 8 phần tử `CONFIG_GROUPS.id`. Thêm menu mới hoặc thêm config-group mà quên khai báo function → **fail test** thay vì lọt lưới.

### 2.2 Role, gán, override

- **Role**: `{ id, key, name, description, isSystem, functions: string[] }`. `isSystem=true` cho role seed (không cho xoá; sửa function thì được).
- **User ↔ Role**: nhiều-nhiều.
- **Override per-user**: `{ userId, functionKey, effect: 'GRANT' | 'REVOKE' }`.

**Quyền hiệu lực (effective functions) của 1 user admin:**

```
effective = ( ∪ role.functions với mọi role user có )
            ∪ { fk : override(user, fk) = GRANT }
            \ { fk : override(user, fk) = REVOKE }
```

- **REVOKE thắng** GRANT và thắng role (đặt REVOKE sau cùng).
- Nếu cùng 1 function vừa GRANT vừa REVOKE cho 1 user → không hợp lệ (UI là toggle 3 trạng thái: mặc-định-theo-role / +GRANT / −REVOKE, nên không thể có cả hai).

### 2.3 Super Admin

- Cột mới `users.isSuperAdmin: boolean` (default false), **tách khỏi role/override**.
- **Super admin bỏ qua mọi kiểm tra function** + là người **duy nhất** vào `/roles` và quản lý role/gán/override/cờ super.
- **Chỉ 1 super admin:** `9111111174` (seed bằng migration).
- **Bảo vệ chống tự khoá:**
  - UI **không** cho hạ/xoá cờ super của **tài khoản seed** (`9111111174`).
  - Guard nghiệp vụ: **không cho hạ super-admin cuối cùng** (luôn còn ≥1 super trong hệ thống).

---

## 3. Bootstrap / migration (chống khoá nhầm)

Thứ tự trong 1 migration BE (idempotent):

1. Thêm cột `users.isSuperAdmin` (default false).
2. Tạo bảng `admin_role`, `admin_role_function`, `user_admin_role`, `user_function_override`.
3. **Bảo đảm luôn có ≥1 super (chống unbootstrappable):** tìm user phone `9111111174`.
   - Nếu **có** → set `isSuperAdmin=true`.
   - Nếu **chưa có** → **tạo mới** tài khoản đó (role `ADMIN`, `isSuperAdmin=true`). **KHÔNG** chỉ log-cảnh-báo rồi bỏ qua: thiếu super thì `/roles` không ai vào được → không thể tự khởi tạo phân quyền. (Xác minh: hiện **không** có seed nào tạo `9111111174` và **không** có cột `isSuperAdmin` — grep rỗng ở BE → net-new.)
   - **🔴 An ninh mật khẩu (plan phải CHỐT, không TBD):** tạo tài khoản toàn-quyền bằng migration **CẤM** mật khẩu hardcode/mặc-định. Chọn 1: **(a)** password lấy từ **ENV/secret** (`SUPERADMIN_SEED_PASSWORD`) + **buộc đổi mật khẩu lần đăng nhập đầu**; hoặc **(b)** không đặt password dùng được, đăng nhập qua **OTP** (`send-login-otp`/`login-otp` đã có) nếu số này nhận được SMS. Migration không được nhúng chuỗi bí mật vào lịch sử git.
4. **Chống khoá nhầm admin cũ:** nếu còn tài khoản `role='ADMIN'` khác `9111111174`, tạo role hệ thống **"Toàn quyền (tạm)"** (`key='full-access-legacy'`, `isSystem=true`, `functions = TẤT CẢ`) và gán mọi admin-không-super vào role đó. Super admin tự hạ về role đúng sau.

> Nhờ bước 3, **luôn tồn tại đúng đường vào `/roles`**; nhờ bước 4, ngày đầu rollout **không admin cũ nào mất quyền**. Siết quyền là thao tác chủ động của super admin, không phải hệ quả của deploy.
> Migration phải **idempotent**: chạy lại không nhân đôi role/không tạo trùng user (guard theo phone + `key`).

---

## 4. Backend (`vigo-backend`) — rollout TRƯỚC

### 4.1 Cơ chế (đã có sẵn, tận dụng) — tính quyền LAZY, không nhét vào `validate()`

`JwtStrategy.validate()` (`jwt.strategy.ts:22,34`) **load user tươi từ DB mỗi request** và trả `{id, phone, role}` — nhưng nó chạy cho **MỌI** request có JWT của **toàn app** (khách, tài xế, portal), phần lớn không đụng admin. **KHÔNG** tính effective-functions ở đây (sẽ join 3 bảng RBAC trên mọi call mobile — lãng phí).

- `validate()` **giữ nguyên** `{id, phone, role}` — **KHÔNG** thêm `isSuperAdmin` vào đây (cột đặt `select:false`, xem §4.6 — tránh rò ra response mobile).
- **Cả `isSuperAdmin` LẪN effective functions tính LAZY trong `FunctionAccessGuard`**, chỉ khi route có `@RequireFunction` (tức chỉ admin): guard chạy 1 query `addSelect('isSuperAdmin')` + join role/override cho đúng user đó. → super check + thu quyền tức thì (đọc DB mỗi request), không stale, không phí cho mobile, và cột super không đi vào path mobile.

### 4.2 Guard & decorator

- Decorator mới `@RequireFunction('finance')` (hoặc nhiều: `@RequireFunction('bookings','agent-orders')` = cần **bất kỳ** trong tập).
- `FunctionAccessGuard`:
  - Query đúng user (`addSelect('isSuperAdmin')` + role + override). `isSuperAdmin === true` → pass.
  - Ngược lại: tính `effective` (từ role + override) → pass nếu giao với tập yêu cầu ≠ ∅; không thì `AppException('AUTH_003')` (403).
- **Giữ nguyên `@Roles(UserRole.ADMIN)`** làm chốt nền (phải là admin) — `@RequireFunction` **cộng thêm**, không thay. Client cũ / app tài xế / portal **không đổi shape** (thuần additive).

### 4.3 Ánh xạ endpoint → function

- **Gate ở mức ROUTE, không phải mức controller.** Controller-level KHÔNG đủ và có chỗ **sai**: `master-data.controller` phục vụ **3 domain** cùng lúc — menu `master-data` (`admin-units`, `routes`, route-pricing), **settings** (`GET /system-config`, `POST /system-config` — `master-data.controller.ts:136-156`), **và route công khai/không-guard** (`GET app/config`, app-version). Gắn `@RequireFunction('master-data')` cả controller sẽ ép sai quyền lên endpoint settings và đụng route public. ⇒ **mapping phải per-route.**
- Với controller 1-domain thì mọi route dùng cùng 1 function (vd `drivers.controller → 'drivers'`, `referral.controller → 'referrals'`, `withdrawal → 'withdrawals'`, `leakage-admin → 'leakage-review'`, `cancel-rate-admin → 'driver-cancel-review'`), nhưng vẫn **khai báo trên từng route** để nhất quán + test phủ được (§4.5).
- **Lập bảng `function → danh sách route` ở giai đoạn plan** bằng cách đọc THẬT `src/lib/api.ts` (FE gọi gì) + controllers BE (không đoán). **Audit TẤT CẢ controller admin đa-domain** (không chỉ `master-data`): rà từng controller xem có phục vụ >1 menu-function / có route public lẫn lộn không → mọi trường hợp đa-domain phải gate per-route đúng.
- **Đọc chung (dashboard/report tổng hợp):** route read-only tổng hợp gate `@RequireFunction('dashboard', <function-liên-quan>)` (any-of); **mutation** gate chặt theo function sở hữu.
- **`system-config` — SỬA lại theo code thật:** endpoint là **`POST /system-config` một-key** `{ key, value, description }` (`master-data.controller.ts:151-156`; FE `updateSystemConfig(key,...)` `api.ts:909`) — **KHÔNG có** bulk-PATCH nhiều key. Vì mỗi request đúng 1 key → gate **chính key đó** theo `settings.<groupIdFor(key)>`. `groupIdFor` **hiện chỉ có ở FE** (`system-config-groups.ts:38`) → **phải port sang BE** (net-new: nhân đôi bảng prefix/label + test đồng bộ 2 phía). `GET /system-config` gate **any-of `settings.*`**.
  - **Chiều ĐỌC — quyết định (user chốt): KHÔNG lọc ở backend.** `GET /system-config` trả **toàn bộ** config cho ai có any-of `settings.*`; **frontend ẩn tab** theo quyền. Người có `settings.pricing` vẫn đọc được *giá trị* nhóm khác nhưng **không sửa** (write per-group chặn thật). Chấp nhận vì admin-only, không phải secret. Đơn giản, ít việc; chỉ chốt-chặn ở chiều sửa.
  - ⚠️ **`settings.misc` (catch-all) là nhóm nhạy cảm cao:** `misc` hốt **mọi key không khớp nhóm nào** (khoá tích hợp/bên-thứ-3) và **tự phình** khi thêm feature mới chưa khai nhóm. → mặc định chỉ super/kỹ thuật giữ `settings.misc`; key nhạy cảm mới nên **thêm nhóm riêng** thay vì để rơi vào misc. (Governance, không đổi code nhóm bây giờ.)
  - ⚠️ **Vì đọc không lọc:** ai có bất kỳ `settings.*` đều **đọc được giá trị `misc`**. → **credential/secret THẬT (API key, token bên-thứ-3) KHÔNG được nằm trong `system_config`** — phải ở biến môi trường / secret store. `system_config` chỉ chứa tham số vận hành (không phải bí mật) thì phát biểu "config không phải secret" mới đúng. (Nếu buộc phải để secret trong DB → lọc riêng `misc` ở chiều đọc; mặc định không.)
  - **✅ Hành động plan BẮT BUỘC (trước khi ship read-không-lọc):** **audit toàn bộ key `system_config` hiện có** (query DB / đọc seed) → xác nhận **không** key nào là credential. Nếu có → xử lý (dời ra env, hoặc bật lọc `misc` chiều đọc) **trước** khi rollout. Không giả định.

### 4.4 API cho frontend & quản trị

- **Endpoint quyền cho FE = `GET /admin/me` RIÊNG (admin-only), KHÔNG đụng `/users/profile`:** trả `{ id, fullName, phone, isSuperAdmin, functions: string[] }` (functions rỗng nếu super; FE hiểu super = thấy tất). Guard `@Roles(ADMIN)` → **chỉ admin gọi, mobile không bao giờ chạm**. Lý do không dùng lại `/users/profile`: endpoint đó **dùng chung** với app khách/tài xế → thêm field vào đó là rò `isSuperAdmin`/`functions` ra mobile. Tách endpoint riêng + cột `select:false` (§4.6) = **an toàn tuyệt đối cho client cũ/mới**. (Đây là đổi hướng có chủ đích so với "reuse profile" — ưu tiên an toàn client hơn việc gộp endpoint.)
- **CRUD role (super only, `@Roles(ADMIN)` + guard super):**
  - `GET /admin/roles`, `POST /admin/roles`, `PATCH /admin/roles/:id`, `DELETE /admin/roles/:id` (chặn xoá `isSystem`).
  - `GET /admin/functions` → catalog function (key + label + group) cho UI render.
  - `POST /admin/users/:id/roles` (set danh sách role), `PUT /admin/users/:id/overrides` (set override), `PATCH /admin/users/:id/super` (bật/tắt cờ super — có guard "không hạ super cuối").
  - *Ghi chú:* `roles`/`overrides` là **set-replace (last-write-wins)** — 2 super sửa đồng thời có thể mất update. Chấp nhận (volume super rất thấp, chỉ 1 người); không cần optimistic-lock đợt này.

### 4.5 Kiểm thử BE (Jest)

- `effective functions`: union nhiều role; GRANT thêm; REVOKE thắng role & GRANT; super bypass.
- `FunctionAccessGuard`: pass/deny theo any-of; super pass.
- `system-config` per-key group: `POST /system-config` **một key** → pass ⇔ có `settings.<groupIdFor(key)>`; sai group → 403. Test `groupIdFor` BE khớp FE.
- Guard "không hạ super-admin cuối cùng".
- Test đồng bộ catalog (§2.1).
- **Test phủ route (chống lọt lưới) — tiêu chí chính xác:** enumerate mọi route **có `@Roles(UserRole.ADMIN)`** và assert route đó **PHẢI có `@RequireFunction`** (không định nghĩa mơ hồ "controller admin"; guard là per-controller, không global — `app.module.ts:163` APP_GUARD chỉ là Throttler). Route quên gắn → **fail test** thay vì âm thầm chỉ còn `@Roles(ADMIN)`.
  - **Allowlist tường minh cho endpoint super-only** cố tình KHÔNG gắn `@RequireFunction` (`/admin/me`, `/admin/roles*`, `/admin/users/:id/roles|overrides|super`, `/admin/functions`): liệt kê rõ trong test → nếu không, test **tự fail chính các endpoint quản trị**. Thêm super-only route mới phải cập nhật allowlist (buộc người viết ý thức).
- `GET /admin/me`: trả đúng `fullName/phone/isSuperAdmin/functions` (super → functions rỗng; thường → effective).
- **An toàn client (§4.6):** response `login` **và** `GET /users/profile` **không chứa** *bất kỳ* khoá nào trong `{ isSuperAdmin, roles, functions, adminRoles, overrides }`.

### 4.6 Cô lập cột `isSuperAdmin` + quan hệ RBAC khỏi mọi response cũ (an toàn client — user ưu tiên)

- Cột `users.isSuperAdmin` khai **`{ select: false }`** trong TypeORM → **không nạp** trong mọi `find/findById` mặc định → **không bao giờ** xuất hiện trong `login` (`auth.service.ts:518`) hay `GET /users/profile` (`users.controller.ts:28`). Đây là "không lấy ngay từ đầu", mạnh hơn "cắt sau khi lấy" — không có đường lọt.
- **`login` và `GET /users/profile` GIỮ NGUYÊN 100%** → app cũ & mới, khách & tài xế **không đổi 1 byte**, không cần đi kiểm từng model Flutter.
- Chỗ cần cột (đều phải `addSelect('user.isSuperAdmin')`): `FunctionAccessGuard`, `GET /admin/me`, **và query danh sách user admin ở màn gán quyền `/roles`** (§5.3 — để hiển thị/khoá toggle super mỗi user; thiếu addSelect thì super hiện thành `undefined/false`). COUNT "không hạ super cuối" dùng `where` nên **không** cần addSelect.
- **🔴 Cô lập cả QUAN HỆ, không chỉ cột:** `select:false` chỉ giấu **cột** `isSuperAdmin`. Các quan hệ mới `user_admin_role` / `user_function_override` gắn trên entity `User` — nếu ai đó lỡ khai **`{ eager: true }`**, chúng sẽ join vào **MỌI** `findById` (`users.service.ts:195` dùng chung khắp nơi) → (a) lọt vào `login`/`profile` mobile (vỡ cam kết byte-for-byte), (b) join thừa trên mọi request mobile qua `jwt.validate`. → **Bắt buộc: mọi quan hệ RBAC khai `eager:false`** (mặc định TypeORM, nhưng ghi rõ + cấm eager); guard/`/admin/me`/`/roles` **chủ động** load quan hệ khi cần.

---

## 5. Frontend (`vigo-admin`)

### 5.1 Auth context

- Sau login (và khi F5), gọi `GET /admin/me` (§4.4) → lưu `{ fullName, phone, isSuperAdmin, functions }` vào `AuthContext`.
- Helper `can(fn: string): boolean` = `isSuperAdmin || functions.includes(fn)`.
- Trong khi `me` đang load: hiện skeleton, **không** render menu (tránh chớp menu không có quyền).

### 5.2 Ẩn menu + chặn route

- `navItems.filter(i => can(i.functionKey))` — thêm `functionKey` cho mỗi mục trong `navItems`.
- **Route guard** (layout `(app)`): vào route không có quyền → redirect tới **trang "Chưa được cấp quyền" KHÔNG đòi quyền** (có nút Đăng xuất). **KHÔNG** redirect về `/dashboard`: `dashboard` cũng là 1 function; user không có nó → `/dashboard` lại redirect → **vòng lặp vô hạn**. Landing sau login = function **đầu tiên** user có quyền (hoặc trang "chưa cấp quyền" nếu rỗng). Bảo vệ cả khi gõ URL trực tiếp.
- Menu "Cài đặt" hiện nếu `can('settings.*')` bất kỳ; trong trang, mỗi tab nhóm render theo `can('settings.<group>')`.
- Thêm mục menu **"Phân quyền"** (`/roles`) chỉ hiện khi `isSuperAdmin`.

### 5.3 Trang `/roles` (thay mock hiện tại)

- Thay `mockRoles` / `allPermissions` (`src/lib/data.ts`, `src/lib/types.ts`) bằng dữ liệu thật từ API.
- **Nới type `Role`:** `types.ts:69-75` đang `name: 'Admin' | 'Editor' | 'Viewer'` (union đóng) — phải đổi `name: string` để đặt tên role tuỳ ý; `permissions: Permission[]` → `functions: string[]`.
- Màn 1 — **Role**: list role, tạo/sửa (tên, mô tả, tick function theo nhóm), xoá (chặn `isSystem`).
- Màn 2 — **Gán cho user**: chọn user admin → tick role → xem function mặc định (union) → toggle **+GRANT / −REVOKE** per function → lưu override. Hiển thị rõ effective cuối cùng.
- Bật/tắt cờ super (chỉ super thao tác, tuân guard "không hạ super cuối").

### 5.4 Dọn UI (gộp vào đợt này vì đằng nào cũng có `GET /admin/me`)

- **Footer sidebar (`layout.tsx`):** **bỏ avatar**; hiển thị **tên động** (`me.fullName`) + **SĐT đăng nhập** (`me.phone`) thay cho "Quản trị viên" / "admin@vigo.com" hardcode; **thêm nút Đăng xuất** ngay tại footer.
- **Logout làm ĐÚNG:** `UserNav.handleLogout` hiện chỉ `removeItem('access_token')` (`user-nav.tsx:24-27`) — thiếu. Bản footer phải: gọi `POST /auth/logout` (đã có, `auth.controller.ts:115-120`), xoá **cả** `access_token` **và** `refresh_token`, rồi `router.push('/')`.
- **Góc trên phải:** **xoá hẳn** `UserNav` (avatar placeholder + dropdown) khỏi `Header` (`header.tsx:9` — đây là **logout duy nhất** hiện tại, nên phải chuyển xong xuống footer TRƯỚC khi xoá). Logout gộp về footer → không còn chia 2 bên. `src/components/user-nav.tsx` xoá; `Header` giữ phần còn lại (sidebar trigger/tiêu đề).
- **Trang Cài đặt (`settings/page.tsx`):** bỏ 3 tab mock (`profile`/`api`/`notifications`, chỉ là UI giả — "Alex Johnson", switch Stripe…, `page.tsx:28-128`) → đổi `<Tabs defaultValue="profile">` thành `"system"` và `grid-cols-4` → phù hợp số tab còn lại (nếu chỉ còn cấu-hình-hệ-thống thì bỏ luôn `TabsList` hoặc để 1 tab). Không đổi `defaultValue` sẽ mở vào tab không tồn tại.

### 5.5 Kiểm thử FE (vitest)

- `can()`: super = true mọi function; thường = đúng theo tập; REVOKE ẩn dù role có.
- `navItems.filter`: chỉ mục có quyền hiện.
- Route guard: route thiếu quyền → redirect.
- Settings: tab nhóm ẩn/hiện theo quyền.
- Footer: render tên + SĐT từ `me`, có nút logout; không còn chuỗi hardcode.

---

## 6. Tương thích ngược (client cũ)

- `@RequireFunction` **cộng thêm** sau `@Roles(ADMIN)`; role `USER/DRIVER/TRANSPORT_COMPANY_OWNER` và mọi endpoint không gắn decorator **không đổi hành vi**.
- App tài xế/khách không gọi endpoint admin → không ảnh hưởng.
- ✅ **Cột `isSuperAdmin` KHÔNG chạm mobile (an toàn tuyệt đối, §4.6):** cột `select:false` → `login` (`auth.service.ts:518`) và `GET /users/profile` (`users.controller.ts:28`) **giữ nguyên byte-for-byte**; `functions`/`isSuperAdmin` chỉ ở `GET /admin/me` (admin-only). ⇒ app khách/tài xế cũ & mới **không ảnh hưởng**, không phụ thuộc việc kiểm model Flutter (nhưng plan vẫn thêm test khẳng định 2 payload đó không chứa `isSuperAdmin`).
- **Rollout:** BE deploy trước (migration + guard + `GET /admin/me` + CRUD) — lúc này mọi admin vẫn full quyền nhờ role "Toàn quyền (tạm)"; sau đó deploy FE; cuối cùng super admin mới siết quyền.

---

## 7. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Deploy khoá nhầm admin đang vận hành | Role "Toàn quyền (tạm)" gán mọi admin cũ (§3.4) |
| `9111111174` chưa tồn tại → 0 super, `/roles` bất khả nhập | Migration **tạo** tài khoản này nếu thiếu (§3.3) — luôn có ≥1 super |
| Cột `isSuperAdmin` rò vào login/profile → vỡ Flutter | Cột `select:false` + endpoint `/admin/me` riêng → 2 payload mobile giữ nguyên (§4.6); test assert không chứa field |
| Route admin quên gắn `@RequireFunction` → bypass | Test enumerate route admin assert có metadata (§4.5) |
| Super admin tự hạ mình → mất lối quản trị | UI khoá cờ super của tài khoản seed + guard "không hạ super cuối" |
| FE ẩn menu nhưng BE quên chặn → bypass qua devtools | BE là nguồn an ninh; mọi endpoint admin phải gắn `@RequireFunction`; checklist per-controller ở plan |
| Thêm menu mới quên khai báo function | Test đồng bộ catalog fail (§2.1) |
| Sửa `system-config` không đúng vai | `POST /system-config` một-key, gate theo `settings.<group>` của key đó |
| Sai lệch mapping endpoint↔function | Lập bảng từ `src/lib/api.ts` thật ở plan, không đoán; audit mọi controller đa-domain |
| Branch drift → đọc catalog nhầm nhánh (7 vs 8 nhóm) | Pin base=`main`; verify lại `CONFIG_GROUPS`/`navItems` trên đúng nhánh build (§2.1) |
| Quan hệ RBAC `eager:true` → lọt vào login/profile + phí mobile | Bắt buộc `eager:false`; test assert 2 payload không chứa roles/functions/overrides (§4.6) |
| Redirect loop khi user thiếu function `dashboard` | Redirect về trang "chưa cấp quyền" không đòi quyền, không phải `/dashboard` (§5.2) |
| Seed super bằng mật khẩu hardcode | Password từ ENV/secret + buộc đổi lần đầu, hoặc OTP-login (§3.3) |
| Secret nằm trong `system_config` + đọc không lọc | Audit key `system_config` trước rollout; secret thật dời ra env (§4.3) |

---

## 8. Việc theo repo (tóm tắt cho plan)

**vigo-backend (trước):** migration (cột `isSuperAdmin` **select:false** + 4 bảng + seed/tạo super `9111111174` + role "Toàn quyền tạm"); entity + service tính effective; `FunctionAccessGuard` (query `addSelect` super + role/override) + `@RequireFunction`; gắn decorator **per-route** toàn bộ admin; port `groupIdFor` sang BE + gate `POST /system-config`; endpoint mới `GET /admin/me`; CRUD role/gán/override/super; Jest (gồm test 2 payload mobile không lộ field).

**vigo-admin (sau):** `AuthContext` + `GET /admin/me` + `can()`; `functionKey` cho `navItems` + filter + route guard; trang `/roles` thật (bỏ mock, nới type `Role`); ẩn/hiện tab settings; dọn footer (tên/SĐT động + logout đúng) + xoá `UserNav`; sửa `settings/page.tsx` defaultValue; vitest.
