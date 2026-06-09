# Vigo Admin — agent guide

## ⏰ Timezone: ALWAYS Vietnam Time (Asia/Ho_Chi_Minh, UTC+7) — MANDATORY

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

## Deploy note
`npm run build` in vigo-admin **builds AND auto-syncs to the prod S3 bucket**. Use
`npx next build` for a compile/smoke check that does NOT deploy.
