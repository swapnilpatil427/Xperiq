import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppAuth } from './lib/auth.tsx';
import { ROUTES } from './constants/routes';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SurveysListPage } from './pages/SurveysListPage';
import { SurveyCreationPage } from './pages/SurveyCreationPage';
import { SurveyBuilderPage } from './pages/SurveyBuilderPage';
import { ResponseDashboardPage } from './pages/ResponseDashboardPage';
import { InsightsDashboardPage } from './pages/InsightsDashboardPage';
import { AdvancedInsightsPage } from './pages/AdvancedInsightsPage';
import { ResponseCollectionPage } from './pages/ResponseCollectionPage';
import { BrandSettingsPage } from './pages/BrandSettingsPage';
import { TemplateLibraryPage } from './pages/TemplateLibraryPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { DataPage } from './pages/DataPage';
import { SignInPage } from './pages/SignInPage';
import { SurveyFillPage } from './pages/SurveyFillPage';
import { ErrorPage } from './pages/ErrorPage';
import { ErrorBoundary } from './components/ErrorBoundary';

function ProtectedRoute() {
  const { isSignedIn, isLoaded } = useAppAuth();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const location = useLocation();

  if (clerkKey && !isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(42,75,217,0.2)', borderTopColor: '#2a4bd9' }} />
      </div>
    );
  }
  if (clerkKey && !isSignedIn) {
    return <Navigate to={ROUTES.SIGNIN} state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* ── Public routes — each page gets its own full-screen boundary ── */}
        <Route path={ROUTES.LANDING}    element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
        <Route path={ROUTES.SIGNIN}     element={<ErrorBoundary><SignInPage /></ErrorBoundary>} />
        <Route path={ROUTES.ONBOARDING} element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />
        <Route path="/s/:token"         element={<ErrorBoundary><SurveyFillPage /></ErrorBoundary>} />

        {/* ── Protected routes ── */}
        <Route element={<ProtectedRoute />}>

          {/* All app pages: wrapped in AppShell + inline boundary per page
              so a single page crash never breaks the nav or other pages */}
          <Route element={<AppShell />}>
            <Route path={ROUTES.BUILDER}            element={<ErrorBoundary inline><SurveyBuilderPage /></ErrorBoundary>} />
            <Route path={ROUTES.SURVEYS}            element={<ErrorBoundary inline><SurveysListPage /></ErrorBoundary>} />
            <Route path={ROUTES.CREATE}             element={<ErrorBoundary inline><SurveyCreationPage /></ErrorBoundary>} />
            <Route path={ROUTES.RESPONSE_DASHBOARD} element={<ErrorBoundary inline><ResponseDashboardPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS}           element={<ErrorBoundary inline><InsightsDashboardPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADVANCED_INSIGHTS}  element={<ErrorBoundary inline><AdvancedInsightsPage /></ErrorBoundary>} />
            <Route path={ROUTES.RESPONDENTS}        element={<ErrorBoundary inline><ResponseCollectionPage /></ErrorBoundary>} />
            <Route path={ROUTES.TEMPLATES}          element={<ErrorBoundary inline><TemplateLibraryPage /></ErrorBoundary>} />
            <Route path={ROUTES.TEMPLATE_EDITOR}    element={<ErrorBoundary inline><TemplateEditorPage /></ErrorBoundary>} />
            <Route path={ROUTES.WORKFLOWS}          element={<ErrorBoundary inline><WorkflowsPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS}           element={<ErrorBoundary inline><BrandSettingsPage /></ErrorBoundary>} />
            <Route path={ROUTES.DATA}               element={<ErrorBoundary inline><DataPage /></ErrorBoundary>} />
          </Route>

          <Route path="/app" element={<Navigate to={ROUTES.SURVEYS} replace />} />
        </Route>

        <Route path="*" element={<ErrorPage type="not-found" />} />
      </Routes>
    </ErrorBoundary>
  );
}
