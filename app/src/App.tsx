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
import { SurveyInsightsPage }    from './pages/SurveyInsightsPage';
import { SampleResponsesPage }  from './pages/SampleResponsesPage';
import { InsightsDashboardPage } from './pages/InsightsDashboardPage';
import { TopicsAnalysisPage } from './pages/insights/TopicsAnalysisPage';
import { AdvancedInsightsPage } from './pages/AdvancedInsightsPage';
import { InsightsBriefPage } from './pages/insights/InsightsBriefPage';
import { InsightsMetricsPage } from './pages/insights/InsightsMetricsPage';
import { InsightsFindingsPage } from './pages/insights/InsightsFindingsPage';
import { InsightsSurfacedPage } from './pages/insights/InsightsSurfacedPage';
import { ResponseCollectionPage } from './pages/ResponseCollectionPage';
import { BrandSettingsPage } from './pages/BrandSettingsPage';
import { UserDirectoryPage } from './pages/settings/UserDirectoryPage';
import { RolesPage } from './pages/settings/RolesPage';
import { DepartmentsPage } from './pages/settings/DepartmentsPage';
import { GroupsPage } from './pages/settings/GroupsPage';
import { ProvisioningPage } from './pages/settings/ProvisioningPage';
import { SeatsPage } from './pages/settings/SeatsPage';
import { AuditLogPage } from './pages/settings/AuditLogPage';
import { NotificationPreferencesPage } from './pages/settings/NotificationPreferencesPage';
import { TemplateLibraryPage } from './pages/TemplateLibraryPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';
import { WorkflowCanvasPage } from './pages/WorkflowCanvasPage';
import { AlertsPage } from './pages/AlertsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DataPage } from './pages/DataPage';
import { ExperienceHubPage } from './pages/experience/ExperienceHubPage';
import { SurveyIntelligencePage } from './pages/experience/SurveyIntelligencePage';
import { SurveyReportPage } from './pages/experience/SurveyReportPage';
import { TopicAnalysisHubPage } from './pages/experience/TopicAnalysisHubPage';
import { TopicDeepDivePage } from './pages/experience/TopicDeepDivePage';
import { SurveyTrendsPage } from './pages/experience/SurveyTrendsPage';
import { OrgTrendsPage } from './pages/experience/OrgTrendsPage';
import { GroupReportPage } from './pages/GroupReportPage';
import { TagsSettingsPage } from './pages/settings/TagsSettingsPage';
import { AdminCrystalSkillsPage } from './pages/admin/AdminCrystalSkillsPage';
import { AdminCrystalSkillDetailPage } from './pages/admin/AdminCrystalSkillDetailPage';
import { AdminCrystalQualityPage } from './pages/admin/AdminCrystalQualityPage';
import { AdminCrystalSignalsPage } from './pages/admin/AdminCrystalSignalsPage';
import { AdminCrystalDlqPage } from './pages/admin/AdminCrystalDlqPage';
import { AdminCrystalGapsPage } from './pages/admin/AdminCrystalGapsPage';
import { SignInPage } from './pages/SignInPage';
import { SurveyFillPage } from './pages/SurveyFillPage';
import { ErrorPage } from './pages/ErrorPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BrandProvider } from './contexts/brandContext';

function ProtectedRoute() {
  const { isSignedIn, isLoaded } = useAppAuth();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const location = useLocation();

  if (clerkKey && !isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', borderTopColor: 'var(--color-primary)' }} />
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
          <Route element={<BrandProvider><AppShell /></BrandProvider>}>
            <Route path={ROUTES.BUILDER}            element={<ErrorBoundary inline><SurveyBuilderPage /></ErrorBoundary>} />
            <Route path={ROUTES.SURVEYS}            element={<ErrorBoundary inline><SurveysListPage /></ErrorBoundary>} />
            <Route path={ROUTES.CREATE}             element={<ErrorBoundary inline><SurveyCreationPage /></ErrorBoundary>} />
            <Route path={ROUTES.RESPONSE_DASHBOARD} element={<ErrorBoundary inline><ResponseDashboardPage /></ErrorBoundary>} />
            <Route path={ROUTES.SURVEY_INSIGHTS}    element={<ErrorBoundary inline><SurveyInsightsPage /></ErrorBoundary>} />
            <Route path={ROUTES.SAMPLE_RESPONSES}   element={<ErrorBoundary inline><SampleResponsesPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS}           element={<ErrorBoundary inline><InsightsDashboardPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS_TOPICS}    element={<ErrorBoundary inline><TopicsAnalysisPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADVANCED_INSIGHTS}  element={<ErrorBoundary inline><AdvancedInsightsPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS_BRIEF}     element={<ErrorBoundary inline><InsightsBriefPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS_METRICS}   element={<ErrorBoundary inline><InsightsMetricsPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS_FINDINGS}  element={<ErrorBoundary inline><InsightsFindingsPage /></ErrorBoundary>} />
            <Route path={ROUTES.INSIGHTS_SURFACED}  element={<ErrorBoundary inline><InsightsSurfacedPage /></ErrorBoundary>} />
            <Route path={ROUTES.RESPONDENTS}        element={<ErrorBoundary inline><ResponseCollectionPage /></ErrorBoundary>} />
            <Route path={ROUTES.TEMPLATES}          element={<ErrorBoundary inline><TemplateLibraryPage /></ErrorBoundary>} />
            <Route path={ROUTES.TEMPLATE_EDITOR}    element={<ErrorBoundary inline><TemplateEditorPage /></ErrorBoundary>} />
            <Route path={ROUTES.WORKFLOWS}          element={<ErrorBoundary inline><WorkflowsPage /></ErrorBoundary>} />
            <Route path={ROUTES.WORKFLOW_BUILD}     element={<ErrorBoundary inline><WorkflowBuilderPage /></ErrorBoundary>} />
            <Route path={ROUTES.WORKFLOW_CANVAS}    element={<ErrorBoundary inline><WorkflowCanvasPage /></ErrorBoundary>} />
            <Route path={ROUTES.ALERTS}             element={<ErrorBoundary inline><AlertsPage /></ErrorBoundary>} />
            <Route path={ROUTES.DASHBOARD}          element={<ErrorBoundary inline><DashboardPage /></ErrorBoundary>} />
            <Route path={ROUTES.VISUAL_STUDIO}      element={<Navigate to={ROUTES.DASHBOARD} replace />} />
            <Route path={ROUTES.SETTINGS}           element={<ErrorBoundary inline><BrandSettingsPage /></ErrorBoundary>} />
            <Route path={ROUTES.NOTIFICATION_PREFS} element={<ErrorBoundary inline><NotificationPreferencesPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_USERS}     element={<ErrorBoundary inline><UserDirectoryPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_ROLES}     element={<ErrorBoundary inline><RolesPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_DEPARTMENTS} element={<ErrorBoundary inline><DepartmentsPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_GROUPS}    element={<ErrorBoundary inline><GroupsPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_PROVISIONING} element={<ErrorBoundary inline><ProvisioningPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_SEATS}     element={<ErrorBoundary inline><SeatsPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_AUDIT}     element={<ErrorBoundary inline><AuditLogPage /></ErrorBoundary>} />
            <Route path={ROUTES.DATA}               element={<ErrorBoundary inline><DataPage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE}              element={<ErrorBoundary inline><ExperienceHubPage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE_ORG_TRENDS}   element={<ErrorBoundary inline><OrgTrendsPage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE_SURVEY}       element={<ErrorBoundary inline><SurveyIntelligencePage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE_SURVEY_REPORT} element={<ErrorBoundary inline><SurveyReportPage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE_SURVEY_TOPICS} element={<ErrorBoundary inline><TopicAnalysisHubPage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE_SURVEY_TOPIC}  element={<ErrorBoundary inline><TopicDeepDivePage /></ErrorBoundary>} />
            <Route path={ROUTES.EXPERIENCE_SURVEY_TRENDS} element={<ErrorBoundary inline><SurveyTrendsPage /></ErrorBoundary>} />
            <Route path={ROUTES.GROUP_REPORT}        element={<ErrorBoundary inline><GroupReportPage /></ErrorBoundary>} />
            <Route path={ROUTES.GROUP_REPORT_LATEST} element={<ErrorBoundary inline><GroupReportPage /></ErrorBoundary>} />
            <Route path={ROUTES.SETTINGS_TAGS}       element={<ErrorBoundary inline><TagsSettingsPage /></ErrorBoundary>} />

            {/* Admin Crystal */}
            <Route path={ROUTES.ADMIN_CRYSTAL} element={<Navigate to={ROUTES.ADMIN_CRYSTAL_SKILLS} replace />} />
            <Route path={ROUTES.ADMIN_CRYSTAL_SKILLS}       element={<ErrorBoundary inline><AdminCrystalSkillsPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADMIN_CRYSTAL_SKILL_DETAIL} element={<ErrorBoundary inline><AdminCrystalSkillDetailPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADMIN_CRYSTAL_QUALITY}      element={<ErrorBoundary inline><AdminCrystalQualityPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADMIN_CRYSTAL_SIGNALS}      element={<ErrorBoundary inline><AdminCrystalSignalsPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADMIN_CRYSTAL_DLQ}          element={<ErrorBoundary inline><AdminCrystalDlqPage /></ErrorBoundary>} />
            <Route path={ROUTES.ADMIN_CRYSTAL_GAPS}         element={<ErrorBoundary inline><AdminCrystalGapsPage /></ErrorBoundary>} />
          </Route>

          <Route path="/app" element={<Navigate to={ROUTES.SURVEYS} replace />} />
        </Route>

        <Route path="*" element={<ErrorPage type="not-found" />} />
      </Routes>
    </ErrorBoundary>
  );
}
