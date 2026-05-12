import { useState, useLayoutEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
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
import { WorkflowsPage } from './pages/WorkflowsPage';
import { SignInPage } from './pages/SignInPage';
import { SurveyFillPage } from './pages/SurveyFillPage';
import { useAppAuth } from './lib/auth.jsx';
import { ROUTES } from './constants/routes';

const PAGE_MAP = {
  [ROUTES.LANDING]:            LandingPage,
  [ROUTES.ONBOARDING]:         OnboardingPage,
  [ROUTES.SURVEYS]:            SurveysListPage,
  [ROUTES.CREATE]:             SurveyCreationPage,
  [ROUTES.BUILDER]:            SurveyBuilderPage,
  [ROUTES.RESPONSE_DASHBOARD]: ResponseDashboardPage,
  [ROUTES.INSIGHTS]:           InsightsDashboardPage,
  [ROUTES.ADVANCED_INSIGHTS]:  AdvancedInsightsPage,
  [ROUTES.COLLECTION]:         ResponseCollectionPage,
  [ROUTES.RESPONDENTS]:        ResponseCollectionPage,
  [ROUTES.WORKFLOWS]:          WorkflowsPage,
  [ROUTES.SETTINGS]:           BrandSettingsPage,
};

// Pages that require authentication
const APP_PAGES = [
  ROUTES.SURVEYS,
  ROUTES.CREATE,
  ROUTES.BUILDER,
  ROUTES.RESPONSE_DASHBOARD,
  ROUTES.INSIGHTS,
  ROUTES.ADVANCED_INSIGHTS,
  ROUTES.COLLECTION,
  ROUTES.RESPONDENTS,
  ROUTES.WORKFLOWS,
  ROUTES.SETTINGS,
];

function AppRouter() {
  const [page, setPage] = useState(ROUTES.LANDING);
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const { isSignedIn, isLoaded } = useAppAuth();
  // eslint-disable-next-line no-unused-vars
  const routerNavigate = useNavigate();
  const autoRedirectDone = useRef(false);

  const navigate = (target) => {
    if (PAGE_MAP[target]) {
      setPage(target);
      window.scrollTo(0, 0);
    } else {
      console.warn('Unknown page:', target);
    }
  };

  // After Clerk resolves a session (page reload from sign-in redirect), send
  // already-signed-in users straight to the app instead of showing the landing page.
  // useLayoutEffect fires before paint, preventing a flash of LandingPage.
  useLayoutEffect(() => {
    if (!autoRedirectDone.current && clerkKey && isLoaded && isSignedIn && page === ROUTES.LANDING) {
      autoRedirectDone.current = true;
      setPage(ROUTES.SURVEYS);
    }
  }, [isLoaded, isSignedIn]);

  const PageComponent = PAGE_MAP[page] || LandingPage;

  // Show global spinner while Clerk is resolving the session
  if (clerkKey && !isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(42,75,217,0.2)', borderTopColor: '#2a4bd9' }}
        />
      </div>
    );
  }

  // Guard authenticated app pages
  if (APP_PAGES.includes(page) && clerkKey && !isSignedIn) {
    return <SignInPage onNavigate={navigate} />;
  }

  return <PageComponent onNavigate={navigate} currentPage={page} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/s/:token" element={<SurveyFillPage />} />
      <Route path="*" element={<AppRouter />} />
    </Routes>
  );
}
