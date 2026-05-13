# Pages — Route-Level Components

Each file = one route. Exported as named function, e.g. `export function SurveysListPage()`.

## Pattern
```jsx
export function SomePage() {
  const { t } = useTranslation();
  useSetPageTitle(t('some.pageTitle'), t('some.pageSubtitle')); // Sets TopBar title
  // ... state, hooks
  return <div className="px-6 md:px-8 py-6 pb-24 md:pb-8">...</div>;
}
```

## Rules
- Import `useSetPageTitle` from `../contexts/pageTitle` to set the TopBar title
- Do NOT import SideNav, TopBar, or BottomNav — AppShell handles those
- Bottom padding: always include `pb-24 md:pb-8` to avoid content hiding behind mobile BottomNav
- All user-visible strings via `t()` from `useTranslation()`

## Route map
| File | Route | Notes |
|------|-------|-------|
| SurveysListPage | /app/surveys | Survey library with server-side pagination/filter/search |
| SurveyCreationPage | /app/surveys/create | AI + manual survey creation wizard |
| SurveyBuilderPage | /app/surveys/:id/build | Full-screen builder — has its OWN SideNav, outside AppShell |
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
It lives outside AppShell and manages its own SideNav via `useSidebarState()`. It uses `const SIDENAV_W = isExpanded ? 256 : 56` to position panels.
