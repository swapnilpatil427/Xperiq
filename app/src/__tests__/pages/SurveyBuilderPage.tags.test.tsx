/**
 * SurveyBuilderPage — tag-related behaviour only.
 *
 * The settings panel lives inside an `aside.hidden.md:block` element.
 * In jsdom (mobile viewport), this aside is `display: none`, so ARIA queries
 * skip its content. We use `{ hidden: true }` on queries that target the panel.
 */

import { render, screen, waitFor, cleanup, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, type Location } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks (must precede page import) ──────────────────────────────────────────

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../hooks/useSurveys', () => ({ useSurveys: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
    useParams: vi.fn(),
  };
});
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../../contexts/pageTitle', () => ({
  useSetPageTitle: vi.fn(),
}));
// XperiqCopilot makes fetch calls — stub it out entirely
vi.mock('../../components/ExperientCopilot', () => ({
  XperiqCopilot: () => null,
}));
// PageHeader — render just the actions slot so settings button is accessible
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="page-header">{actions}</div>
  ),
}));

import { useApi } from '../../hooks/useApi';
import { useSurveys } from '../../hooks/useSurveys';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { SurveyBuilderPage } from '../../pages/SurveyBuilderPage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockTag = { id: 't1', name: 'Employee Exp', color: '#6366f1', slug: 'employee-exp' };

const SURVEY_ID = 'survey1';

function buildMockApi(overrides: Record<string, unknown> = {}) {
  return {
    addTagsToSurvey: vi.fn().mockResolvedValue({}),
    removeTagFromSurvey: vi.fn().mockResolvedValue({}),
    getSurvey: vi.fn().mockResolvedValue({
      survey: {
        id: SURVEY_ID,
        title: 'My Survey',
        status: 'draft',
        survey_type_id: null,
        description: '',
        intent: '',
        thank_you_message: '',
        template_id: null,
        tags: [],
        questions: [],
      },
    }),
    listTags: vi.fn().mockResolvedValue({ tags: [mockTag] }),
    createTag: vi.fn().mockResolvedValue({ tag: mockTag }),
    saveSurvey: vi.fn().mockResolvedValue({ id: SURVEY_ID }),
    createSurvey: vi.fn().mockResolvedValue({ id: SURVEY_ID }),
    updateSurvey: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

const mockNavigate = vi.fn();

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  configure({ defaultHidden: true });
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useParams).mockReturnValue({ surveyId: SURVEY_ID });
  vi.mocked(useLocation).mockReturnValue({
    pathname: `/app/surveys/${SURVEY_ID}/build`,
    search: '',
    hash: '',
    state: null,
    key: 'default',
  } as Location);

  vi.mocked(useSurveys).mockReturnValue({
    surveys: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    createSurvey: vi.fn().mockResolvedValue({ id: SURVEY_ID }),
    updateSurvey: vi.fn().mockResolvedValue(undefined),
    deleteSurvey: vi.fn(),
    publishSurvey: vi.fn(),
  } as ReturnType<typeof useSurveys>);
});

afterEach(() => {
  configure({ defaultHidden: false });
  cleanup();
  vi.clearAllMocks();
});

function renderBuilder(locationState: Record<string, unknown> | null = null) {
  vi.mocked(useLocation).mockReturnValue({
    pathname: `/app/surveys/${SURVEY_ID}/build`,
    search: '',
    hash: '',
    state: locationState,
    key: 'default',
  } as Location);

  const mockApi = buildMockApi();
  vi.mocked(useApi).mockReturnValue(mockApi as unknown as ReturnType<typeof useApi>);

  const utils = render(
    <MemoryRouter initialEntries={[`/app/surveys/${SURVEY_ID}/build`]}>
      <Routes>
        <Route path="/app/surveys/:surveyId/build" element={<SurveyBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );

  return { ...utils, mockApi };
}

/**
 * Open the settings panel by clicking the Settings button (rendered in the
 * PageHeader mock's actions slot).
 */
async function openSettingsPanel(user: ReturnType<typeof userEvent.setup>) {
  const settingsBtn = await screen.findByRole('button', {
    name: /builder\.settings\.settingsButton/i,
  });
  await user.click(settingsBtn);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SurveyBuilderPage — tag panel', () => {
  it('settings panel shows pre-populated tags when navigated with state.tags', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // Pass at least one question so needsDbLoad = false (edit mode requires questions.length > 0
    // to skip the getSurvey() call which would overwrite the state tags with the empty DB result).
    renderBuilder({
      title: 'My Survey',
      questions: [{ id: 'q1', type: 'nps', question: 'Test question' }],
      tags: [mockTag],
    });

    await openSettingsPanel(user);

    // TagBadge renders the tag name inside the settings panel (which lives inside
    // `aside.hidden.md:block` — use hidden:true to query into display:none containers).
    await waitFor(() => {
      const matches = screen.getAllByText('Employee Exp');
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('settings panel shows empty tag field when no tags in navigation state', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderBuilder({ title: 'My Survey', questions: [], tags: [] });

    await openSettingsPanel(user);

    // The TagSelector placeholder text comes from t('groups.searchTags')
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('groups.searchTags'),
      ).toBeInTheDocument();
    });

    // Tag name should NOT be present in the panel
    expect(screen.queryByText('Employee Exp')).not.toBeInTheDocument();
  });

  it('adding a tag via TagSelector calls api.addTagsToSurvey(surveyId, [tagId])', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { mockApi } = renderBuilder({ title: 'My Survey', questions: [], tags: [] });

    await openSettingsPanel(user);

    // Wait for TagSelector input to be ready (inside the hidden aside)
    const tagInput = await screen.findByPlaceholderText('groups.searchTags');
    await user.click(tagInput);

    // TagSelector loads existing tags from listTags on mount.
    // Wait for the available tag to appear in the dropdown.
    await waitFor(() => {
      expect(screen.getAllByText('Employee Exp').length).toBeGreaterThan(0);
    });

    // Click the tag in the dropdown list to add it
    const tagOption = screen.getAllByText('Employee Exp')[0];
    await user.click(tagOption);

    await waitFor(() => {
      expect(mockApi.addTagsToSurvey).toHaveBeenCalledWith(SURVEY_ID, ['t1']);
    });
  });

  it('removing a tag calls api.removeTagFromSurvey(surveyId, tagId)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { mockApi } = renderBuilder({
      title: 'My Survey',
      // Provide a question so needsDbLoad = false and state tags are preserved
      questions: [{ id: 'q1', type: 'nps', question: 'Test question' }],
      tags: [mockTag],
    });

    await openSettingsPanel(user);

    // Confirm tag is visible in the panel
    await waitFor(() => {
      expect(
        screen.getAllByText('Employee Exp').length,
      ).toBeGreaterThan(0);
    });

    // Click the remove button on the TagBadge rendered inside the TagSelector
    const removeButton = screen.getByRole('button', {
      name: /Remove Employee Exp/i,
    });
    await user.click(removeButton);

    await waitFor(() => {
      expect(mockApi.removeTagFromSurvey).toHaveBeenCalledWith(SURVEY_ID, 't1');
    });
  });
});
