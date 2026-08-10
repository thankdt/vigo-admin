# Subdomain cổng phụ đang phục vụ khu admin — thiết kế bản vá

Ngày: 2026-08-10 · Trạng thái: **plan đã duyệt phần chẩn đoán, CHƯA code** ·
Quyết định còn treo: có gộp hạng mục (C) vào cùng đợt hay không.

## 1. Triệu chứng

Chủ HTX (tk `0972289998` — HTX Công Nghệ Vận Tải Thủ Đô Xanh, đã gán bằng
"Gán chủ" trên admin DEV, tài khoản hoàn toàn hợp lệ):

| URL | Kết quả |
|---|---|
| `https://htx.vigodev.online/dashboard/` | "Không tải được thông tin quyền tài khoản. Vui lòng thử lại hoặc đăng nhập lại." |
| `https://htx.vigodev.online/htx/dashboard/` | Vào bình thường |

KHÔNG phải lỗi tài khoản, KHÔNG phải lỗi đăng nhập.

## 2. Root cause

Cả 4 khu — admin (`/`), HTX (`/htx/*`), KOL (`/kol-portal/*`), đại lý
(`/agent-portal/*`) — là **một bản static export duy nhất, nằm chung một gốc web**.
Việc tách theo subdomain chỉ xử lý **đúng đường dẫn gốc `/`**:

- prod: CloudFront Function, `scripts/htx-rewrite-function.js:18-23` —
  `if (req.uri === '/') req.uri = '/htx/index.html'`
- DEV: `nginx.conf:20-25` — `location = / { if ($host ~* ^htx\.) rewrite ^ /htx/ last; ... }`

Mọi path khác rơi xuống `nginx.conf:31-33`
`location / { try_files $uri $uri/ $uri.html /index.html; }` → `htx.<domain>/dashboard/`
trả đúng file `dashboard/index.html` **của khu admin**. Khu admin gọi `/admin/me` bằng
token chủ HTX → backend chặn `@Roles(ADMIN)` → **403** → `src/app/(app)/layout.tsx:111-123`
hiện câu thông báo trên.

Hai lỗi tách bạch:

1. **Định tuyến** — tên miền cổng phụ phục vụ khu admin ở mọi URL ngoài `/`.
2. **Thông báo sai bản chất** — 403 (sai khu / không có quyền quản trị) bị gộp chung
   với lỗi mạng/500 thành một câu nói về "không tải được thông tin quyền".

Ghi chú: comment tại `scripts/htx-rewrite-function.js:14` ghi "`/<other>` → S3 404" là
**sai thực tế** — bucket bật SPA fallback (`scripts/deploy-s3.ts:27`,
`ErrorDocument: index.html`) nên URL lạ trả về trang login admin chứ không 404.
Sửa comment này luôn khi làm.

Cùng khuôn với `kol.` và `daily.` (`scripts/kol-rewrite-function.js`,
`scripts/agent-rewrite-function.js`).

### Tên miền thật (user xác nhận 2026-08-10)

| Cổng | prod | DEV |
|---|---|---|
| HTX | `htx.vigogroup.vn` | `htx.vigodev.online` |
| KOL | `kol.vigogroup.vn` | (theo cùng khuôn `kol.`) |
| Đại lý | `daily.vigogroup.vn` | (theo cùng khuôn `daily.`) |

Khớp đúng 3 nhánh `$host` trong `nginx.conf:21-23` → bảng map không hụt cổng nào.

## 3. Giải pháp

### (A) Guard theo hostname ở tầng app — FE, deploy kèm `npm run build`

Bảng map thuần trong `src/lib/portal-hosts.ts` (pure, test được):

| prefix hostname | đích |
|---|---|
| `htx.` | `/htx/` |
| `kol.` | `/kol-portal/login/` |
| `daily.` | `/agent-portal/login/` |

Đích khớp đúng cái nginx + CloudFront Function đang dùng; `trailingSlash: true`
(`next.config.ts:7`) nên đích phải có `/` cuối, tránh thêm một nhịp 301.

Guard là client component dùng chung, mount ở **CẢ HAI** chỗ:
`src/app/(app)/layout.tsx` **và** `src/app/page.tsx`.

Vì sao phải cả hai (reviewer bắt được, plan đầu của tôi hụt): `src/app/page.tsx`
là trang login admin ở `/` và **nằm ngoài route group `(app)`** → guard đặt trong
`(app)` không chạy ở đó. Mà SPA fallback lại trả đúng trang này cho mọi URL lạ trên
`htx.*`. Tệ hơn, `(app)/layout.tsx:85-92` khi không có token còn tự
`router.replace('/')` — đẩy thẳng chủ HTX vào cái trang không được canh.

Guard phải đặt **ngoài `AuthProvider`** để `refresh()` không kịp gọi `/admin/me` rồi
ăn 403 vô ích, và phải **chặn các effect còn lại** của `AppShell` (early-return), vì
`window.location.replace()` không dừng JS đang chạy — để nguyên sẽ đua với
`router.replace` sẵn có.

Nếu sau này chuyển guard lên root layout thì **bắt buộc** allowlist theo pathname
(`/htx`, `/kol-portal`, `/agent-portal`, `/_next`), nếu không thành vòng lặp
full-reload vô tận. Hiện tại không loop vì `/htx/*` không chạy layout của `(app)`.

**(A) là rào UX, KHÔNG phải rào bảo mật.** Chặn thật vẫn nằm ở guard backend. Trên
`htx.*` vẫn mở được `/kol-portal/login/` — chỉ (C) mới bịt hẳn.

### (B) Thông báo nói đúng bản chất

`fetchWithAuth` hiện ném `Error(JSON.stringify(body))` **không kèm status**
(`src/lib/api.ts:135-136`), và `AuthProvider` bắt bằng `catch {}` không có biến
(`src/lib/auth-context.tsx:36`) → **không thể** phân biệt 403. Nên phải:

1. `src/lib/api.ts` — gắn `status` vào Error, giữ nguyên `message` (mọi call-site chỉ
   đọc `.message`: `src/app/page.tsx:60`, `src/app/htx/login/page.tsx:59` → không đổi
   hành vi).
2. `src/lib/auth-context.tsx` — thêm `error: 'forbidden' | 'network' | null` (additive).
   **Không có status ⇒ `'network'`** (mặc định an toàn, không vu cho user là thiếu quyền).
3. `src/app/(app)/layout.tsx` — 403 hiện "Tài khoản này không có quyền quản trị";
   lỗi khác giữ nguyên câu cũ + nút Thử lại / Đăng xuất.

Lưu ý: từ một mã 403 của `/admin/me` **không suy ra được** user thuộc cổng nào —
response không nói. Nên hoặc liệt kê cả 3 link cổng, hoặc bỏ nút và chỉ để "Đăng xuất".

### (C) Chặn ở tầng cạnh — CHƯA chốt, chờ user quyết

`nginx.conf` (DEV) + 3 CloudFront Function (prod): với host cổng phụ, path không thuộc
`/htx|/kol-portal|/agent-portal|/_next|asset` → **302** về gốc cổng tương ứng.

Phải **302 chứ không rewrite ngầm**: bundle static-export mã hoá path trên đĩa, rewrite
ngầm làm `window.location` lệch với path trong bundle → lỗi hydrate (đã có tiền lệ, xem
comment `scripts/htx-rewrite-function.js:3-7`).

Lý do đề nghị tách đợt: deploy CloudFront Function **không** nằm trong `npm run build`,
phải thao tác tay trên AWS console.

## 4. File đụng (cho (A)+(B))

- `src/lib/portal-hosts.ts` — mới, pure
- `src/lib/portal-hosts.test.ts` — mới
- `src/app/(app)/layout.tsx`
- `src/app/page.tsx`
- `src/lib/auth-context.tsx`
- `src/lib/api.ts`
- `src/lib/auth-context.test.tsx` — đã tồn tại, phải cập nhật (case
  `mockRejectedValue(new Error('401'))` ở dòng 67-75 không có status → phải assert
  `'network'`; thêm case `status: 403` → `'forbidden'`)
- `scripts/htx-rewrite-function.js` — sửa comment sai ở dòng 14

## 5. Edge case bắt buộc kiểm

- `admin.vigogroup.vn` / `admin.vigodev.online` KHÔNG được dính redirect.
- `localhost:9002`, truy cập bằng IP, domain CloudFront gốc → không dính.
- Đang ở `/htx/*` thì layout `(app)` không chạy → không tự đá lộn.
- Chống loop: đích redirect không thuộc route group `(app)`.
- Admin THẬT bị 403 vì thiếu function trên `admin.*` → phải thấy "không có quyền quản
  trị", không bị đá đi đâu.
- Static export không có `window` lúc build → mọi thứ trong `useEffect`.

## 6. Tương thích ngược

Không đụng API/backend, không đổi shape request/response, không đổi enum. Chỉ FE điều
hướng + chữ hiển thị. `AuthContextValue` thêm field là additive — 3 consumer hiện tại
(`settings/components/system-config-manager.tsx:24`,
`drivers/components/driver-reputation-section.tsx:82`, `dashboard/page.tsx:65`) chỉ
destructure `me`/`can` nên không vỡ.

## 7. Việc đã biết nhưng CỐ Ý để ngoài phạm vi

- `src/lib/api.ts:78` bỏ qua xử lý 401 khi `pathname === '/'`. Trên prod `htx.*`
  pathname vẫn là `/` dù nội dung là cổng HTX → 401 ở màn đó không refresh token.
  Lỗi có sẵn, không do bản vá này sinh ra.
- Nếu backend đổi mã wrong-role từ 403 sang 401, nhánh refresh
  (`src/lib/api.ts:78-125`) sẽ refresh → retry → 401 → refresh… lặp vô hạn. Hiện không
  xảy ra vì backend trả 403.
- Rò chéo cổng (`htx.*` mở được `/kol-portal/login/`) — chỉ (C) xử lý.

## 8. Quy trình

Phân loại rủi ro: **CAO** (đụng đường guard của layout admin + luồng lỗi auth) → đã qua
1 lượt review đối kháng bằng sub-agent fresh-context (report lưu ở scratchpad, ngoài
git). Review trả PASS-WITH-FINDINGS, các finding đã gộp vào bản này. Hết cap 1 lượt.

Khi code: cắt nhánh `fix/portal-host-routing` từ `main`, TDD, `npx tsc --noEmit` +
`npx vitest run`, merge `dev` → test DEV → PR `feature → main`.
