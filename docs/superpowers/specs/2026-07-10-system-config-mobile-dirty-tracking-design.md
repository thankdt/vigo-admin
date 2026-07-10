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
- `dirtyKeys = Object.keys(edits)` — điều khiển highlight, thanh sticky, và `beforeunload`.

Các state khác giữ nguyên: `isLoading`, `isSaving: Record<string, boolean>`, `query`, `open`.

### 2. Lưu

Không có API batch → **`Lưu tất cả` loop `updateSystemConfig` cho từng dirty key** bằng
`Promise.allSettled` (song song; N nhỏ). Sau khi settle:

- **Toàn bộ OK:** cập nhật `original` cho các key đã lưu, xoá sạch `edits`,
  toast "Đã lưu N mục".
- **Fail một phần:** giữ lại đúng key fail trong `edits`; key thành công thì cập nhật
  `original` + xoá khỏi `edits`; toast destructive liệt kê key lỗi.
- **`Lưu` lẻ 1 field** (nút trên field dirty): dùng lại cùng path cho 1 key (tái dùng
  `handleSave` hiện có, có cập nhật `original` + clear `edits[key]` khi thành công).
- **`Hoàn tác`:** field lẻ xoá `edits[key]`; nút tổng xoá sạch `edits` (input tự về gốc).

Trong lúc lưu, disable field/nút tương ứng qua `isSaving` (giữ cơ chế cũ, mở rộng cho
save-all: đánh dấu tất cả dirty key đang lưu).

### 3. Layout responsive (1 markup, không nhân đôi DOM)

Bỏ `<table>` fixed-width. Mỗi field render bằng **CSS grid row** responsive, tách thành
component riêng:

- **`ConfigFieldRow`** (component mới, cùng thư mục) — nhiệm vụ duy nhất: render 1 field và
  báo trạng thái. Props: `config` (gốc), `value` (hiển thị), `dirty`, `saving`,
  `onChange`, `onSave`, `onRevert`.
- Container mỗi row:
  `grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(180px,240px)_auto] md:items-center gap-1 md:gap-3`.
  - Mobile: xếp dọc (key → mô tả → input full-width → hàng nút khi dirty).
  - Desktop: 4 cột thẳng hàng như bảng cũ (key mono, mô tả muted, input, actions).
- Header cột: một row `hidden md:grid` với cùng grid-template, nhãn Khóa/Mô tả/Giá trị/"".
- Input luôn `w-full` → value luôn hiện đủ trên mọi màn.
- **Field dirty:** nền `bg-amber-50 dark:bg-amber-950/30`, viền/`ring` nhẹ, dấu • + nhãn
  "đã đổi", nút inline `↩ Hoàn tác` + `Lưu`. **Field sạch: không nút.**

Accordion + nhóm (`CONFIG_GROUPS`, `groupIdFor`) và search giữ nguyên; chỉ đổi phần render
bên trong mỗi `AccordionContent` từ `<Table>` sang list `ConfigFieldRow`.

### 4. Thanh Save nổi (sticky)

- Render **chỉ khi `dirtyKeys.length > 0`**.
- `sticky bottom-0` trong vùng cuộn của CardContent, `z` cao, nền
  `bg-background/95 backdrop-blur` + border-top + padding safe-area
  (`pb-[env(safe-area-inset-bottom)]`) cho mobile.
- Nội dung: `● {N} thay đổi chưa lưu` bên trái; `[Hoàn tác]` (ghost) + `[Lưu tất cả]`
  (primary, spinner khi đang lưu) bên phải.

### 5. Chống mất dữ liệu & tương tác search

- **`beforeunload`**: khi `dirtyKeys.length > 0`, gắn listener cảnh báo trước khi
  đóng tab/reload; gỡ khi hết dirty (cleanup trong `useEffect`).
- **Search** vẫn lọc theo key/description. `edits` keyed theo `config.key` (không theo
  hàng hiển thị) → **edit không mất khi lọc**; thanh sticky đếm tổng dirty toàn cục, kể cả
  field đang bị ẩn bởi filter. (Nếu save-all mà có dirty key đang ẩn, vẫn lưu bình thường.)

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

Kiểm tĩnh: `npx tsc --noEmit` + `npx vitest run` phải sạch.

## Phạm vi KHÔNG đụng / tương thích ngược

- **Không đổi backend / API contract.** Vẫn gọi `updateSystemConfig(key, value, description)`
  với body y hệt (`POST /master-data/system-config`). Chỉ đổi UI phía admin.
- Không đụng 3 tab mock còn lại (profile/api/notifications), không đụng logic nhóm
  accordion / search.
- Không thêm/bớt field response client khác đang đọc.

## Rollout

Theo quy trình chuẩn: feat branch → merge `dev` test DEV → PR `feat → main` → deploy.
Đây là thay đổi UI thuần, không cần điều phối đa repo.
