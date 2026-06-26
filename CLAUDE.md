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

## Git workflow
Mọi code đi qua `dev` trước khi vào `main`. Không merge feature→main, không deploy prod
từ feature branch.
