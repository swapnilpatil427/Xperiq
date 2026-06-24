# Hooks — Custom React Hooks

All hooks are TypeScript (`.ts`). **There is no Firestore** — every data hook is
Postgres-backed via REST through `useApi()` (which wraps `createApiClient()` in
`lib/api.ts` and injects the Clerk JWT). Hooks hold their own `useState` copy of
server data and expose a `reload`/`load` — there is no shared query cache (see the
DataBus note below).

## useApi.ts
Returns an API client with auth token pre-baked. Wraps `createApiClient()` from `lib/api.ts`.
```ts
const api = useApi();
const result = await api.listSurveys({ status: ['active'], limit: 20 });
```
All CRUD + AI operations available. See `lib/api.ts` for the full method list.

## useSidebarState.ts
Sidebar expanded/collapsed state with localStorage persistence (`'sidenav_expanded'`).
Returns `{ isExpanded, toggle, setExpanded }`.

## useBreakpoint.ts
ResizeObserver-based responsive hook. Returns `'mobile'` (<768px), `'tablet'` (768–1023px), `'desktop'` (≥1024px).

## Data hooks (REST + local state)
- **useSurveys.ts** — `api.listSurveys()`; optimistic create/update/delete/publish. Returns `{ surveys, loading, error, reload, createSurvey, updateSurvey, deleteSurvey, publishSurvey }`.
- **useInsights.ts** — `api.getInsights(surveyId)`; exports `computePageState()`/`PageState`. Subscribes to the DataBus (`useInvalidation('insights', load)`) so it re-fetches when Crystal triggers a re-run. Returns `{ insights, loading, generating, regenerate, reload }`.
- **useWorkflows.ts** — `api.listWorkflows()` (mock fallback on error). Subscribes to DataBus (`useInvalidation('workflows', load)`). Returns `{ workflows, loading, createWorkflow, toggleWorkflow, deleteWorkflow, reload }`.
- **useAlerts.ts** — alert rules + events via `api.list*`. Subscribes to DataBus (`useInvalidation('alerts', load)`). Returns `{ events, rules, loading, error, reload, act, createRule, deleteRule }`.
- Others: **useExperience, useNotifications, useAdminApi, useDepartments, useGroups, useRoles, useUsers** — same REST + local-state pattern.

## DataBus invalidation (`lib/dataBus.ts`)
Because there is no shared cache, when Crystal (the global panel) mutates data the
open pages won't know. `lib/dataBus.ts` is a tiny `window`-event bus:
- a mutation calls `invalidate('workflows' | 'alerts' | 'insights' | 'surveys')`
- a data hook subscribes via `useInvalidation(resource, reload)` to re-fetch.

**Rule:** any new data hook for a resource Crystal can mutate MUST subscribe via
`useInvalidation`, and the resource must be in the `DataResource` union in
`lib/dataBus.ts`. (`'surveys'` is declared but `useSurveys` does not yet subscribe —
fix when wiring Crystal-driven survey creation to refresh an open list.)
