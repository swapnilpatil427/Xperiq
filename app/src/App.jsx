import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppAuth } from './lib/auth.jsx';
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
        {/* ── Public routes ── */}
        <Route path={ROUTES.LANDING}    element={<LandingPage />} />
        <Route path={ROUTES.SIGNIN}     element={<SignInPage />} />
        <Route path={ROUTES.ONBOARDING} element={<OnboardingPage />} />
        <Route path="/s/:token"         element={<SurveyFillPage />} />

        {/* ── Protected routes ── */}
        <Route element={<ProtectedRoute />}>

          {/* Builder: full-screen custom layout, manages its own SideNav */}
          <Route path={ROUTES.BUILDER} element={<SurveyBuilderPage />} />

          {/* All other app pages: wrapped in AppShell */}
          <Route element={<AppShell />}>
            <Route path={ROUTES.SURVEYS}            element={<SurveysListPage />} />
            <Route path={ROUTES.CREATE}             element={<SurveyCreationPage />} />
            <Route path={ROUTES.RESPONSE_DASHBOARD} element={<ResponseDashboardPage />} />
            <Route path={ROUTES.INSIGHTS}           element={<InsightsDashboardPage />} />
            <Route path={ROUTES.ADVANCED_INSIGHTS}  element={<AdvancedInsightsPage />} />
            <Route path={ROUTES.RESPONDENTS}        element={<ResponseCollectionPage />} />
            <Route path={ROUTES.TEMPLATES}          element={<TemplateLibraryPage />} />
            <Route path={ROUTES.TEMPLATE_EDITOR}    element={<TemplateEditorPage />} />
            <Route path={ROUTES.WORKFLOWS}          element={<WorkflowsPage />} />
            <Route path={ROUTES.SETTINGS}           element={<BrandSettingsPage />} />
            <Route path={ROUTES.DATA}               element={<DataPage />} />
          </Route>

          <Route path="/app" element={<Navigate to={ROUTES.SURVEYS} replace />} />
        </Route>

        <Route path="*" element={<ErrorPage type="not-found" />} />
      </Routes>
    </ErrorBoundary>
  );
}
