# Next.js (App Router) data-fetching & mutation patterns

## Read in a Server Component (default, preferred)
```tsx
// app/todos/page.tsx  — Server Component, no 'use client'
export default async function TodosPage() {
  const todos = await getTodos() // runs on the server; can hit DB/API directly
  return <TodoList todos={todos} />
}
```
- `getTodos` lives in `lib/` and may use server-only secrets.
- Control caching explicitly:
  - `fetch(url, { cache: 'force-cache' })` → static (default-ish)
  - `fetch(url, { cache: 'no-store' })` → always dynamic
  - `fetch(url, { next: { revalidate: 60 } })` → ISR, revalidate every 60s
  - tag + revalidate: `fetch(url, { next: { tags: ['todos'] } })` then `revalidateTag('todos')`

## Loading & error UI
- `app/todos/loading.tsx` → Suspense fallback shown while the server component streams.
- `app/todos/error.tsx` → must start with `'use client'`; receives `{ error, reset }`.

## Mutations with a Server Action
```tsx
// lib/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function addTodo(formData: FormData) {
  await db.todo.create({ data: { title: String(formData.get('title')) } })
  revalidatePath('/todos') // refresh the server-rendered list
}
```
```tsx
// a Client Component can call it
'use client'
import { addTodo } from '@/lib/actions'
export function AddForm() {
  return <form action={addTodo}><input name="title" /><button>Add</button></form>
}
```

## Client-side server state (when you need caching/optimistic UI)
```tsx
'use client'
import { useQuery } from '@tanstack/react-query'
export function useTodos() {
  return useQuery({ queryKey: ['todos'], queryFn: () => fetch('/api/todos').then(r => r.json()) })
}
```
Handle `isLoading` / `isError` / `data` explicitly in the component.

## Route handler (REST endpoint inside Next)
```ts
// app/api/todos/route.ts
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json(await getTodos())
}
```

## Common pitfalls
- Marking a whole page `'use client'` just to use one hook — push the boundary down to the interactive leaf instead.
- Forgetting a fetch is cached by default → stale data. Decide cache policy per fetch.
- Passing non-serializable values (functions, Dates as instances, class instances) from Server to Client Components.
- Putting secrets in Client Components — they ship to the browser.
