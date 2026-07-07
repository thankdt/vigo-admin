# Vigo Admin — agent guide

## ⏰ Timezone: ALWAYS Vietnam Time (Asia/Ho_Chi_Minh, GMT+7 / UTC+7) — MANDATORY

Every date the user sees or filters by — date pickers, "today", chart axes/buckets,
report ranges, exported invoice dates — MUST be **Vietnam Time (UTC+7)**, independent
of the admin's browser timezone. This applies across the entire Vigo app (admin,
backend, driver/customer apps).

Rules:
- Date-range filters send **VN-local `YYYY-MM-DD`** to the API; the backend interprets
  them as VN dates (`+07:00`). Charts/buckets are bucketed in VN on the backend.
- Compute VN dates **browser-timezone-independently**:
  `new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)`.
  Do NOT use `new Date().toLocaleDateString()` or local `getFullYear/getMonth/getDate`
  for business dates — they reflect the browser TZ, not VN.
- For VN month/year boundaries, shift by +7h first, then use `setUTC*`/`getUTC*`.

Reference helpers (reuse these, don't hand-roll):
- `src/app/(app)/finance/components/finance-filter.tsx` — `todayVn`, `daysAgoVn`,
  `firstOfMonthVn`, `lastOfMonthVn`, `firstOfYearVn`, and the `PRESETS` array.

## Stack & cấu trúc
Next.js 15 (App Router, React 19, TS) — **static export** (`output: 'export'`) host trên S3.
Hai khu vực tách biệt trong `src/app/`:
- `(app)/*` — admin nội bộ (bookings, drivers, finance, invoices, htx-reconciliation…)
- `htx/*` — portal cho hợp tác xã, có `htx/login` riêng. ĐỪNG nhầm với admin.

Key files:
- `src/lib/api.ts` — API client tập trung (~1600 dòng). Base URL hardcode
  `https://api.vigogroup.vn`, token trong `localStorage`, có refresh-token flow.
  Dùng lại client này, đừng tự viết fetch wrapper mới.
- `src/lib/types.ts` — domain types dùng chung.
- `src/ai/flows/*` — Genkit (Google GenAI) cho executive summary.

## Commands
```bash
npm run dev        # dev server trên port 9002 (turbopack)
npm run typecheck  # tsc --noEmit — CỔNG KIỂM THẬT SỰ (xem gotcha bên dưới)
npm test           # vitest run
npm run lint       # next lint
npx next build     # compile/smoke check, KHÔNG deploy
```
Deploy cần `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` trong `.env` (xem `aws-config.template`).

## Deploy note
`npm run build` in vigo-admin **builds AND auto-syncs to the prod S3 bucket**. Use
`npx next build` for a compile/smoke check that does NOT deploy.

## Gotchas
- `next.config.ts` bật `ignoreBuildErrors` + `ignoreDuringBuilds` → **build KHÔNG chặn
  lỗi type/lint**. Luôn chạy `npm run typecheck` để kiểm trước khi tin là sạch.
- Có 2 test runner: vitest (`*.test.ts`) và `node:test` qua tsx (`*.node.test.ts`,
  chạy bằng `npm run test:invoice-utils` / `test:export`).

## Git workflow (cập nhật 2026-06-27 — THAY THẾ rule cũ "qua dev rồi PR dev→main")

`main` = production, LUÔN deploy được, nguồn chân lý duy nhất. `dev` = nhánh
tích hợp/test mà **môi trường DEV deploy từ đó** (được phép chứa feature đang
chờ). Nhánh feature/fix ngắn hạn, **cắt từ `main`** (không phải `dev`).

Mỗi feature/fix:
1. `git checkout -b feat/X main` — cắt từ main.
2. merge `feat/X` → `dev` → môi trường DEV deploy → **test trên DEV (cổng bắt buộc)**.
3. **PR `feat/X` → `main`** (review/CI) — KHÔNG phải PR `dev → main`.
4. merge → deploy PROD từ `main` (`npm run build`).
5. **resync: `git checkout dev && git merge main`**, rồi xoá `feat/X`.

Quy tắc cứng (vi phạm từng gây lệch dev/main + commit trùng):
- Promote bằng **merge ĐÚNG nhánh feature vào main**. KHÔNG cherry-pick (SHA
  mới → lệch), KHÔNG PR `dev → main` (kéo việc chưa sẵn sàng lên prod).
- **Luôn resync `main → dev` sau mỗi promote** → `dev ≈ main`, test DEV trung thực.
- Feature kẹt vì phụ thuộc (vd chờ backend) cứ nằm trên `dev` tới khi sẵn sàng.

> Môi trường DEV đã hoạt động (cập nhật 2026-07-06): merge `feat/X` → `dev` để
> deploy DEV và **test runtime trên DEV trước khi PR → main** (cổng bắt buộc).
> `npm run dev` (local) vẫn dùng để lặp nhanh khi code.

## Quy trình phát triển (BẮT BUỘC — mọi thành viên & agent follow)

Áp dụng cho MỌI thay đổi code (feature/fix). Không bỏ bước.

0. **Cắt nhánh `feat/*` hoặc `fix/*` từ `main`** (đã `git pull`). KHÔNG code trực tiếp trên `main`/`dev`.
0.5. **Chốt & review GIẢI PHÁP trước khi code — CỔNG CHẶN, BẮT BUỘC với thay đổi non-trivial:**
   - a. Viết plan/spec ngắn: mục tiêu, cách tiếp cận, file/đối tượng sẽ đụng, edge case, ảnh hưởng tương thích client cũ.
   - b. Nhờ 1 **sub-agent fresh-context, adversarial** review plan (không phải chỉ self-review).
   - c. Sửa plan theo review → **quay lại (b)**. KHÔNG code ngay sau khi chỉnh — xong plan vẫn phải ĐỢI review duyệt.
   - d. Chỉ chuyển sang bước 1 (code) khi plan đã qua review sạch.
1. **Code kèm test (TDD)** — viết test trước/cùng lúc, không để "test cho có" sau cùng.
2. **Vòng lặp chất lượng** (lặp tới khi sạch):
   - a. Self-review lại diff — altitude, edge case, đọc lại TỪNG site đã đổi.
   - b. Unit test pass + kiểm tĩnh sạch (xem "Lệnh kiểm" cuối mục).
   - c. Nhờ 1 **reviewer độc lập** (agent fresh-context, adversarial) review code.
   - d. Sửa theo review → quay lại (a).
3. **Commit sạch** — `git add` NGAY trước `git commit` (hoặc `git commit -a`) để đảm bảo phần staged == bản cuối (tránh commit sót do stage rồi mới sửa). Commit theo đơn vị hoàn chỉnh. Message kết bằng:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
4. **Kiểm tương thích ngược với CLIENT CŨ** (BẮT BUỘC trước mọi rollout — backend deploy trước app nên app cũ vẫn gọi API shape cũ):
   - Không xoá/đổi tên field response client cũ đang đọc (chỉ được THÊM — additive).
   - Giữ field `required` client cũ cần + field mirror/deprecated (vd giá trị hiển thị cũ).
   - Không để `disallowUnrecognizedKeys` (Flutter) phá vỡ khi thêm field.
   - Không đổi enum client map cứng; không đổi shape/required của REQUEST body.
   - Kiểm cả app tài xế nếu đụng endpoint dùng chung.
5. **Push nhánh feat**.
6. **Merge vào `dev` → test trên môi trường DEV** (verify runtime). Không PR→main khi chưa test DEV.
7. **PR `feature→main`** — review của người = cổng cuối → merge = deploy/build production.
8. **Resync `main→dev`**. KHÔNG PR `dev→main`, KHÔNG cherry-pick.

**Đa repo / đổi API contract:** chốt contract trước khi code FE/admin; rollout **backend TRƯỚC** app; điều phối PR các repo cùng đợt.

**Lệnh kiểm tĩnh theo repo:**
- backend (`vigo-backend`): `npx tsc --noEmit` + `npx jest`
- app khách/tài xế (`vigo`, `vigo-driver`): `dart analyze` (+ `dart run build_runner build` nếu đổi model/DTO)
- admin (`vigo-admin`): `npx tsc --noEmit` + `npx vitest run`
