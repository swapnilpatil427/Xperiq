# Hooks — Custom React Hooks

## useApi.js
Returns an API client with auth token pre-baked. Wraps `createApiClient()` from `lib/api.js`.
```js
const api = useApi();
const result = await api.listSurveys({ status: ['active'], limit: 20 });
```
All CRUD + AI operations available. See `lib/api.js` for full method list.

## useSidebarState.js
Manages sidebar expanded/collapsed state with localStorage persistence.
Returns `{ isExpanded, toggle, setExpanded }`.
Key: `'sidenav_expanded'` in localStorage.

## useBreakpoint.js
ResizeObserver-based responsive hook.
Returns: `'mobile'` (<768px), `'tablet'` (768-1023px), `'desktop'` (>=1024px).

## useSurveys.js
Firestore real-time subscription to surveys for the current org. Returns `{ surveys, loading, error }`.

## useInsights.js
Firestore subscription to insights/AI analysis data.

## useWorkflows.js
Firestore subscription to workflow automation rules.
