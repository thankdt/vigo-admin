---
name: nextjs-app
description: Build, structure, test, and maintain Next.js + React web applications. Use this whenever working in a Next.js/React codebase — creating pages, routes, or components; deciding between Server and Client Components; wiring data fetching (server actions, route handlers, or client fetching); setting up state; handling rendering, hydration, or caching issues; or writing component/unit/e2e tests. Trigger even when the user just says "add a page", "fix this component", "make this a server action", or "set up the store" inside a Next/React project, not only when they say the words "Next" or "React".
---

# Next.js + React App

Guidance for this team's Next.js + React frontend: routing model, the Server/Client Component split, data fetching, state, and testing.

## Step 0 — Detect the conventions before writing code

Read these first and match what exists; the router and component model change the code fundamentally:

1. `package.json` → Next major version. Check for `app/` vs `pages/` directory to determine the **router**:
   - `app/` present → **App Router** (React Server Components by default). This is the modern default — read `references/data-fetching.md`.
   - only `pages/` → **Pages Router** (`getServerSideProps`/`getStaticProps`, all components client-rendered).
2. `package.json` for the **state/data libraries**: `zustand` / `@reduxjs/toolkit` / `jotai` for client state; `@tanstack/react-query` / `swr` for server-state caching. Match what's there; don't introduce a second one.
3. Styling: `tailwindcss` / CSS Modules / `styled-components` — match it. TypeScript is assumed unless the repo is plain JS.
4. `eslint`/`next lint` config and the existing folder layout — mirror exactly.

## App Router: the Server vs Client rule (most important)

In the App Router, components are **Server Components by default**. Keep them server-side unless they need interactivity.

- Add `'use client'` **only** when the component uses hooks (`useState`/`useEffect`), event handlers, or browser-only APIs. Push `'use client'` as far down the tree as possible — a leaf button, not a whole page.
- Fetch data in Server Components (async components that `await` directly) or in route handlers / server actions. Don't ship data-fetching waterfalls to the client when the server can do it.
- Never put secrets, tokens, or server-only logic in a Client Component — it ships to the browser. Server-only code stays in Server Components, route handlers, or files marked `import 'server-only'`.
- Pass data down as serializable props; you can't pass functions/classes from Server to Client Components.

## Project structure (App Router)

```
src/
├── app/
│   ├── layout.tsx            # root layout
│   ├── page.tsx
│   └── <segment>/
│       ├── page.tsx          # route UI (Server Component by default)
│       ├── loading.tsx       # suspense fallback
│       ├── error.tsx         # error boundary ('use client')
│       └── route.ts          # route handler (API) if needed
├── components/               # reusable; mark 'use client' only where needed
├── lib/                      # data access, server actions, utils, clients
├── hooks/                    # client hooks (use*)
├── stores/                   # zustand/jotai/redux store if used
└── types/
```

## Data & mutations

- **Reads**: prefer Server Components fetching directly. For client-side server-state (revalidation, caching, optimistic UI), use the existing TanStack Query / SWR setup.
- **Writes**: prefer **server actions** (`'use server'`) or route handlers over ad-hoc client fetches; revalidate with `revalidatePath`/`revalidateTag` or the query client.
- Be deliberate about caching: know whether a fetch is static, dynamic, or revalidated. Caching surprises are a top source of "why is my data stale" bugs in Next.
- Every data path handles loading and error states (`loading.tsx`/`error.tsx`, or query states). A page that only renders the success case is incomplete.

See `references/data-fetching.md` for concrete patterns.

## State

- Server state (data from the backend) lives in TanStack Query/SWR or is fetched server-side — not duplicated into a global client store.
- Client/UI state (modals, form state, toggles) stays local with `useState`, or in a small store (Zustand/Jotai) when shared across distant components. Don't reach for Redux unless the repo already uses it.

## Testing

- **Unit/component tests** with Vitest or Jest + **React Testing Library**: render, query by role/text, assert behavior and loading/error states. Test from the user's perspective (roles, labels), not implementation details.
- Test **Client Components** directly. For Server Components and server actions, test the underlying data functions in isolation, and cover the rendered output via e2e.
- **e2e** with **Playwright** for full flows (routing, server rendering, mutations).
- Run the project's test command and ensure green before finishing. Add tests in the same change, covering the error path.

## Definition of done

`next lint` + `tsc --noEmit` clean, tests green, no `console.log` noise, no secrets in client bundles, `'use client'` only where required, loading/error states handled, new logic covered by tests.

Note: for visual/aesthetic work, the `frontend-design` plugin/skill covers design tokens and styling direction — this skill covers structure, data, and correctness.

## Vigo conventions (filled-in TEAM-CONFIG)

The `vigo-admin` project (Next.js `15.5.9`, React `19`, TypeScript):

- **Router**: **App Router** under `src/app/`. Authenticated admin screens live in the `(app)` route group (`src/app/(app)/<segment>/`: bookings, drivers, finance, invoices, users, promotions, …). `src/` layout is used — folders: `app/`, `components/` (incl. `components/ui/` shadcn-style primitives), `hooks/`, `lib/`, `ai/`.
- **Data fetching**: this is a **client-heavy admin SPA**, not server-component-first. API calls go through a hand-rolled fetch wrapper in `src/lib/api.ts` (base `https://api.vigogroup.vn`, with `/auth/login` + `/auth/refresh` token-refresh handling). There is **no TanStack Query / SWR / axios** — don't introduce one without asking; reuse `src/lib/api.ts`.
- **State**: React **Context** + local `useState`/hooks (e.g. `src/hooks/`). No Zustand/Redux/Jotai.
- **Forms**: `react-hook-form` + `zod` via `@hookform/resolvers`.
- **Styling/UI**: Tailwind CSS + **Radix UI** primitives (shadcn-style: `clsx`, `tailwind-merge`, `tailwindcss-animate`, `lucide-react` icons) in `src/components/ui/`.
- **AI**: Genkit (`@genkit-ai/next`) flows live in `src/ai/` (`genkit.ts`, `flows/`); dev via `npm run genkit:dev`.
- **Commands**:
  - Dev: `npm run dev` (`next dev --turbopack -p 9002`) · Lint: `npm run lint` (`next lint`) · Typecheck: `npm run typecheck` (`tsc --noEmit`)
  - Tests: `npm test` (`vitest run`), watch `npm run test:watch` — Vitest + `@testing-library/react`. **No Playwright/e2e** is set up.
  - Build/deploy: `npm run build` runs `next build && npm run deploy:prod`, where `deploy:prod` (`tsx scripts/deploy-s3.ts`) ships the static build to the S3 bucket `vigo-admin` (region `ap-southeast-1`). See the `aws-deploy` skill.
