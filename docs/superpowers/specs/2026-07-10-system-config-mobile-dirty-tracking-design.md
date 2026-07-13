# Cấu hình hệ thống — Mobile responsive + Dirty-tracking + Save tổng

**Ngày:** 2026-07-10
**Phạm vi:** `src/app/(app)/settings/components/system-config-manager.tsx` (tab "Cấu hình hệ thống")
**Loại:** UI/UX, không đụng backend/API contract.

## Bối cảnh & vấn đề

Trang `/settings` → tab "Cấu hình hệ thống" (`SystemConfigManager`) render ~30+ config
dưới dạng bảng 4 cột (Khóa / Mô tả / Giá trị / Lưu) trong các nhóm accordion. Ba vấn đề
trên mobile web:

1. **Ô value "không hiện giá trị"** — bảng dùng width cố định (`w-[20%]` cho cột Giá trị),
   không có wrapper cuộn ngang. Trên điện thoại cột value bị bóp còn vài chục px → nhìn như
   trống. Phụ: input `value={config.value}` không có fallback `?? ''` — nếu API trả `null`
   thì controlled input cũng ra rỗng (và cảnh báo controlled→uncontrolled).
2. **Save từng ô** — mỗi field một nút gọi `updateSystemConfig` (1 POST/field). Không có
   cách lưu hàng loạt.
3. **Không phân biệt ô nào đã đổi** — không có dirty-tracking; `handleValueChange` ghi đè
   thẳng vào `configs`, mất bản gốc. Nút Save hiện ở **mọi** field kể cả field chưa đụng.

## Quyết định thiết kế (đã chốt với user)

- **Save UX = Option A:** thanh sticky "Lưu tất cả (N)" + "Hoàn tác" chỉ hiện khi có thay
  đổi; đồng thời field đã đổi được highlight và có nút `Lưu`/`↩` lẻ. Vừa lưu 1 ô vừa lưu
  hàng loạt.
- **Layout = Option A:** mobile (<md) xếp field thành card dọc; desktop (≥md) giữ bố cục
  dạng bảng như hiện tại. Desktop gần như không đổi trải nghiệm.

## Thiết kế

### 1. Mô hình state

Thay cách quản lý edit trong `SystemConfigManager`:

- `original: SystemConfig[]` — snapshot từ `getSystemConfigs()`, **không mutate**.
- `edits: Record<string, string>` — chỉ chứa key đã sửa (giá trị hiện hành khác gốc).
- Giá trị hiển thị mỗi input = `edits[key] ?? original.value ?? ''` → vá luôn lỗi
  "không hiện value" bằng fallback `?? ''`.
- `onChange(key, val)`:
  - nếu `val === originalValue(key)` → **xoá** `key` khỏi `edits` (tự hết dirty),
  - ngược lại → `edits[key] = val`.
  - Hệ quả: gõ sửa rồi gõ về đúng giá trị cũ thì field tự hết dirty, nút save biến mất.
- **Chuẩn hóa null khi so sánh (BẮT BUỘC):** giá trị hiển thị dùng `?? ''` nên hàm so sánh
  phải chuẩn hóa giống hệt — `originalValue(key)` trả `original.value ?? ''`. Nếu không,
  khi `original.value === null`, người dùng gõ rồi xóa về `''` sẽ **không bao giờ hết dirty**
  (`'' !== null`). `applyEdit` so `val === (original.value ?? '')`.
- `dirtyKeys = Object.keys(edits)` — điều khiển highlight, thanh sticky, và `beforeunload`.

Các state khác giữ nguyên: `isLoading`, `isSaving: Record<string, boolean>`, `query`, `open`.

### 2. Lưu

Không có API batch → **`Lưu tất cả` loop `updateSystemConfig` cho từng dirty key** bằng
`Promise.allSettled` (song song; N nhỏ). Sau khi settle:

- **Toàn bộ OK:** cập nhật `original` cho các key đã lưu; **clear `edits` theo hàm, CHỈ bỏ
  `okKeys`** — `setEdits(prev => { const n = {...prev}; okKeys.forEach(k => delete n[k]); return n })`.
  **KHÔNG wipe cả map** (`setEdits({})`): trong lúc `allSettled` bay, user có thể gõ vào một
  field **sạch** (không nằm trong batch) → nó vào `edits`; wipe cả map sẽ xoá luôn edit mới đó
  → đúng loại data-loss spec này sinh ra để chặn. Toast "Đã lưu N mục".
- **Fail một phần:** giữ lại đúng key fail trong `edits`; key thành công thì cập nhật
  `original` + xoá khỏi `edits` (cùng cách functional-clear trên). Toast destructive liệt kê
  key lỗi.
- **`Lưu` lẻ 1 field** (nút trên field dirty): rewrite `handleSave` cho 1 key theo model mới
  — thành công thì cập nhật `original[key]` + `delete edits[key]`. **BỎ `fetchConfigs()` ở
  path fail** (bản cũ dòng 50 gọi refetch → thổi bay MỌI edit đang dở của các field khác);
  thay bằng: fail thì **giữ nguyên `edits[key]`** + toast, không refetch.
- **`Hoàn tác`:** field lẻ xoá `edits[key]`; nút tổng xoá sạch `edits` (`setEdits({})` — chỗ
  này wipe cả map là ĐÚNG vì đây là hành động chủ đích của user, khác path save-all ở trên).

Trong lúc lưu, disable field/nút tương ứng qua `isSaving` (giữ cơ chế cũ, mở rộng cho
save-all: đánh dấu tất cả dirty key đang lưu).

**Correctness khi save-all (BẮT BUỘC):**
- **Chụp payload TRƯỚC `await`**: `const batch = keys.map(k => ({ key: k, value: edits[k],
  description: originalByKey[k].description }))` rồi mới `Promise.allSettled(batch.map(...))`.
  Không đọc lại `edits`/state sau `await`.
- `summarizeSaveResults(keys, settled)` dựa trên **tương ứng vị trí** `keys[i] ↔ settled[i]`
  → mảng promise phải fire đúng thứ tự `keys` và truyền chính `keys` đó vào summarizer.
- Cập nhật `original` cho ok-keys bằng **giá trị đã lưu** (`batch[i].value`), KHÔNG phải
  state hiện tại.

### 3. Layout responsive (1 markup, không nhân đôi DOM)

Bỏ `<table>` fixed-width. Mỗi field render bằng **CSS grid row** responsive, tách thành
component riêng:

- **`ConfigFieldRow`** (component mới, cùng thư mục) — nhiệm vụ duy nhất: render 1 field và
  báo trạng thái. Props: `config` (gốc), `value` (hiển thị), `dirty`, `saving`,
  `onChange`, `onSave`, `onRevert`.
- Container mỗi row:
  `grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(180px,240px)_96px] md:items-center gap-1 md:gap-3`.
  - Mobile: xếp dọc (key → mô tả → input full-width → hàng nút khi dirty).
  - Desktop: 4 cột thẳng hàng như bảng cũ (key mono, mô tả muted, input, actions).
- **Cột actions rộng CỐ ĐỊNH `96px` (BẮT BUỘC), KHÔNG dùng `auto`:** mỗi field là một grid
  container **riêng** → các track không share giữa row. Nếu track cuối là `auto`, nó = 0px ở
  row sạch (không nút) và = bề rộng nút ở row dirty → 3 cột đầu resolve khác nhau → **cột lệch
  hàng dọc** giữa row sạch/dirty/header. Cố định `96px` (đủ cho `↩` + `Lưu` icon) + luôn
  render cell actions (rỗng ở row sạch) → mọi grid cùng width resolve track y hệt → thẳng
  hàng. Header row (`hidden md:grid`) dùng đúng template này, cột cuối để trống.
- Header cột: một row `hidden md:grid` với cùng grid-template, nhãn Khóa/Mô tả/Giá trị/"".
- Input luôn `w-full` → value luôn hiện đủ trên mọi màn.
- **Chống tràn ngang (BẮT BUỘC):** ô Khóa dùng font mono, chuỗi key dài (vd
  `pricing.airport_base_fee`) sẽ đẩy tràn ngang **dù** track cho phép co. Cell key phải
  `min-w-0` + `break-all` (hoặc `truncate` kèm `title`). `minmax(0,1fr)` cho track co được;
  `min-w-0` cho item bên trong co được — thiếu 1 trong 2 là tái hiện đúng bug cũ.
- **Field dirty:** nền `bg-amber-50 dark:bg-amber-950/30`, viền/`ring` nhẹ, dấu • + nhãn
  "đã đổi", nút inline `↩ Hoàn tác` + `Lưu`. **Field sạch: không nút.**

Accordion + nhóm (`CONFIG_GROUPS`, `groupIdFor`) và search giữ nguyên; chỉ đổi phần render
bên trong mỗi `AccordionContent` từ `<Table>` sang list `ConfigFieldRow`.

### 4. Thanh Save nổi (sticky)

- Render **chỉ khi `dirtyKeys.length > 0`**.
- `sticky bottom-0` đặt trong `CardContent` (ngoài `<Accordion>`), `z` cao, nền
  `bg-background/95 backdrop-blur` + border-top.
- **Full-bleed + padding (BẮT BUỘC):** `CardContent` = `p-6 pt-0` → `sticky bottom-0` sẽ
  dính ở đáy padding-box, để hở khoảng trống dưới bar và nền/border không phủ hết bề ngang.
  Kéo bar tràn mép: `-mx-6 px-6 -mb-6 pb-6` (bù lại padding của CardContent) và
  `pb-[env(safe-area-inset-bottom)]` cho safe-area mobile.
- **Đã xác nhận không bị clip:** `Card`/`CardContent` không đặt `overflow-hidden`
  (chỉ `rounded-lg border bg-card shadow-sm`); bar nằm **ngoài** `AccordionContent`
  (Radix set `overflow-hidden` cho animation) nên không bị cắt.
- Nội dung: `● {N} thay đổi chưa lưu` bên trái; `[Hoàn tác]` (ghost) + `[Lưu tất cả]`
  (primary, spinner khi đang lưu) bên phải.
- **A11y:** phần đếm `aria-live="polite"`; nút Lưu tất cả `aria-busy` khi đang lưu. Sau khi
  save-all thành công, bar (đang giữ focus) unmount → focus rơi về `<body>`; đưa focus về
  đầu danh sách/CardHeader để không mất mạch bàn phím. Bo góc dưới `rounded-b-lg` cho khớp
  mép `Card` (Card `rounded-lg` không `overflow-hidden`).

### 5. Chống mất dữ liệu & tương tác search

Có **3 đường mất dữ liệu**, mức độ dễ xảy ra giảm dần. Spec xử theo đúng thứ tự đó,
KHÔNG oversell:

**(a) Đổi tab trong /settings — đường DỄ NHẤT, phải chặn triệt để.**
`page.tsx` render `<TabsContent value="system">` **không** `forceMount`. Radix mặc định
unmount tab không active → bấm từ "Cấu hình hệ thống" sang "Hồ sơ" là `SystemConfigManager`
bị hủy → mất sạch `edits`, và `beforeunload` cũng không kích hoạt.
→ **Fix:** thêm `forceMount` cho **đúng** `TabsContent value="system"` (chỉ tab này).
Radix giữ component mounted (chỉ set `hidden` khi inactive) → `edits` **sống nguyên** qua
mọi lần đổi tab; quay lại thấy nguyên trạng, không cần confirm. Đây là fix chính, rẻ, đủ.
- Đánh đổi chấp nhận được: forceMount khiến `getSystemConfigs()` chạy ngay khi mở trang
  `/settings` (thay vì lúc mở tab). 1 request thừa, không đáng kể.
- Lưu ý: khi đang ở tab khác, thanh sticky nằm trong tab bị `hidden` nên không hiển thị —
  chấp nhận được vì **dữ liệu không mất**, mở lại tab system là thấy lại bar.

**(b) Đóng tab trình duyệt / reload / rời domain.**
→ **Fix:** `beforeunload` khi `dirtyKeys.length > 0`. **Bắt buộc** `e.preventDefault();
e.returnValue = '';` (trình duyệt hiện **bỏ qua message tùy biến**, chỉ hiện dialog mặc
định). Gắn/gỡ listener theo dirty trong `useEffect` cleanup.

**(c) Điều hướng SPA trong app (bấm menu sidebar → `router.push`) — KNOWN LIMIT.**
Next App Router không kích hoạt `beforeunload`; chặn triệt để cần intercept `<Link>`/router
(xâm lấn, dễ vỡ). **Phạm vi hiện tại KHÔNG chặn case này** — ghi rõ là hạn chế đã biết.
Giảm nhẹ: thanh sticky "N thay đổi chưa lưu" luôn nổi rõ khi còn ở trang → user thấy được
trước khi rời. Guard route-change để lại làm follow-up nếu cần (không gộp vào đợt này).

**Search** vẫn lọc theo key/description. `edits` keyed theo `config.key` (không theo hàng
hiển thị) → **edit không mất khi lọc**; thanh sticky đếm tổng dirty toàn cục, kể cả field
đang bị ẩn bởi filter. Save-all vẫn lưu cả dirty key đang bị ẩn.

**File đụng thêm:** §5(a) cần sửa `src/app/(app)/settings/page.tsx` (thêm `forceMount` cho
1 `TabsContent`). Đây là thay đổi thêm ngoài `SystemConfigManager`, additive, không ảnh
hưởng 3 tab còn lại.

### 6. Sửa lỗi "không hiện value"

Nguyên nhân chính là layout bóp cột trên mobile (đã xử ở §3). Phòng hờ thêm: fallback
`?? ''` ở §1 chặn trường hợp API trả `null`/thiếu field.

## Test (vitest)

Tách logic thuần ra khỏi component để test không cần DOM (theo style
`system-config-groups.test.ts`):

- `applyEdit(edits, original, key, val)` → trả `edits` mới; **auto-clear** khi `val` bằng
  giá trị gốc.
- `summarizeSaveResults(keys, settled)` → `{ okKeys, failKeys }` từ mảng
  `PromiseSettledResult`.

Case bắt buộc:
1. Sửa field → dirty (`edits` có key).
2. Sửa rồi gõ về đúng giá trị gốc → hết dirty (`edits` rỗng).
3. `applyEdit` nhiều key độc lập, không lẫn.
4. `summarizeSaveResults` all-ok → `failKeys` rỗng.
5. `summarizeSaveResults` partial-fail → đúng `okKeys`/`failKeys`.
6. Hoàn tác toàn bộ → `edits` rỗng.
7. **Null-normalize:** `original.value === null` → gõ vào rồi xóa về `''` → **hết dirty**
   (verify `applyEdit` so với `original.value ?? ''`).

Kiểm tĩnh: `npx tsc --noEmit` + `npx vitest run` phải sạch.

## Phạm vi KHÔNG đụng / tương thích ngược

- **Không đổi backend / API contract.** Vẫn gọi `updateSystemConfig(key, value, description)`
  với body y hệt (`POST /master-data/system-config`). Chỉ đổi UI phía admin.
- **Đụng 2 file admin:** `system-config-manager.tsx` (viết lại phần render + state) và
  `page.tsx` (thêm `forceMount` cho 1 `TabsContent`, §5a). Thêm component
  `ConfigFieldRow` + helper thuần (`applyEdit`, `summarizeSaveResults`) + test.
- Không đụng 3 tab mock còn lại (profile/api/notifications), không đụng logic nhóm
  accordion / search.
- Không thêm/bớt field response client khác đang đọc.

## Rollout

Theo quy trình chuẩn: feat branch → merge `dev` test DEV → PR `feat → main` → deploy.
Đây là thay đổi UI thuần, không cần điều phối đa repo.
