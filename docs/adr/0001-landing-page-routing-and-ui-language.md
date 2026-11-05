# Landing page, routing and UI language for the frontend

Status: accepted

The frontend started as an untouched Vite scaffold (no router, no pages). For the first real feature — a Landing that presents the service and leads to booking — we decided:

- **The Landing lives at `/`** and is fully static (hero, "How it works" with the 3 guest steps, final CTA). It does **not** fetch Meeting Types from the API — dynamic data belongs to the Booking Page.
- **Routes**: guest booking flow at `/book`, Owner Dashboard at `/admin`. Both ship as minimal placeholder pages for now so no link on the Landing is dead.
- **Router**: `react-router` (library mode). Considered TanStack Router — rejected as overkill for a 3–4 page SPA.
- **UI language: English only**, no i18n framework. Product name: **Call Calendar** (already in `index.html` title).
- **Styling**: plain Tailwind (neutral theme, Geist font) plus the already-installed shadcn `Button`; no new shadcn components for the Landing.
- **Shared `Layout`** (header with product name + "Book a call" CTA, footer with a discreet "Calendar owner" link to `/admin`) wraps the Landing and both placeholders.
- **Tests are required**: Vitest + Testing Library smoke tests (Landing renders hero + CTA href, placeholders render at their routes).

## Consequences

- "Главная страница" was ambiguous in the spec: the owner-facing bookings list and the guest-facing entry were both called "main page". The glossary now pins **Landing**, **Booking Page** and **Owner Dashboard** as distinct terms — use them.
