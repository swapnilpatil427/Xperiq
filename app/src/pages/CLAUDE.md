# Pages — Route-Level Components

Each file = one route. Exported as named function, e.g. `export function SurveysListPage()`.

## Pattern
```jsx
export function SomePage() {
  const { t } = useTranslation();
  // ... state, hooks
  return (
    <div className="max-w-6xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.parent'), path: ROUTES.PARENT }, { label: t('page.title') }]}
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        actions={<Button>...</Button>}
      />
      {/* page content */}
    </div>
  );
}
```

## Rules
- **DO NOT** add `px-6 md:px-8` or `pb-24 md:pb-8` to page wrappers — AppShell provides both globally
- Pages only declare `max-w-X mx-auto w-full` to constrain content width
- Do NOT import SideNav, TopBar, or BottomNav — AppShell handles those
- Use `PageHeader` from `../components/PageHeader` for all page headings
- Breadcrumbs: pass 1 crumb for top-level pages (no trail shown), 2 crumbs for sub-pages (trail shown)
- All user-visible strings via `t()` from `useTranslation()`

## Max-width guide
All standard pages use `max-w-7xl mx-auto w-full` on the root container so content
left/right edges are uniform regardless of viewport size.

| max-w | Used by |
|-------|---------|
| max-w-7xl | ALL standard pages (Surveys, Data, Insights, AdvancedInsights, ResponseDashboard, ResponseCollection, BrandSettings, Workflows, Templates) |
| max-w-3xl (internal) | TemplateEditor form content — placed inside a max-w-7xl outer container, wrapping everything below PageHeader |

## Route map
| File | Route | Notes |
|------|-------|-------|
| SurveysListPage | /app/surveys | Survey library with server-side pagination/filter/search |
| SurveyCreationPage | /app/surveys/create | AI + manual survey creation wizard |
| SurveyBuilderPage | /app/surveys/:id/build | Full-screen builder — inside AppShell (isBuilder mode: no gutters, no footer) |
| InsightsDashboardPage | /app/insights | Topic-based AI analysis |
| AdvancedInsightsPage | /app/insights/advanced | Extended insights view |
| ResponseCollectionPage | /app/respondents | Survey distribution channels |
| ResponseDashboardPage | /app/surveys/:id/responses | Per-survey response view |
| DataPage | /app/data | Unified response feed across all surveys |
| TemplateLibraryPage | /app/templates | System + org template library |
| TemplateEditorPage | /app/templates/new | Create/edit custom templates |
| WorkflowsPage | /app/workflows | Automation rules with AI triggers |
| BrandSettingsPage | /app/settings | Org profile, branding, team management |
| SurveyFillPage | /s/:token | Public survey respondent view (no auth, no AppShell) |
| LandingPage | / | Public marketing page |
| SignInPage | /signin | Clerk auth |
| OnboardingPage | /onboarding | New user org setup |

## SurveyBuilderPage is special
It lives INSIDE AppShell (wired in App.jsx). AppShell detects `/surveys/:id/build` via `isBuilder` regex and skips gutters, footer, and BottomNav for it. The page uses `var(--sidebar-width)` (set by AppShell) to position its fixed panels. It returns a React Fragment `<>` — no outer div. Fixed panels: QuestionPalette (left) and PropertiesPanel (right), both at `top: 4rem`. Save/Launch/Settings buttons live in the PageHeader `actions` slot inside the page, not in TopBar.
