import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: (p: React.ComponentProps<'div'>) => <div {...p} />,
    section: (p: React.ComponentProps<'section'>) => <section {...p} />,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...p }: React.ComponentProps<'button'>) => <button {...p}>{children}</button>,
}));

vi.mock('../../../components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

// ConnectorCard renders its connector's label so we can assert gallery groups.
vi.mock('../../../components/prism/ConnectorCard', () => ({
  ConnectorCard: ({ meta }: { meta: { label: string } }) => <div data-connector>{meta.label}</div>,
}));

vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn() }));
vi.mock('../../../hooks/usePrismConnections', () => ({ usePrismConnections: vi.fn() }));

import { useApi } from '../../../hooks/useApi';
import { usePrismConnections } from '../../../hooks/usePrismConnections';
import { PrismHomePage } from '../../../pages/prism/PrismHomePage';

function buildApiMock(overrides: Record<string, unknown> = {}) {
  return {
    listPrismConnectors: vi.fn().mockResolvedValue({ connectors: [] }), // keep default catalog
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

function buildConnectionsMock(overrides: Record<string, unknown> = {}) {
  return {
    connections: [],
    jobs: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    deleteConnection: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof usePrismConnections>;
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(buildApiMock());
  vi.mocked(usePrismConnections).mockReturnValue(buildConnectionsMock());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><PrismHomePage /></MemoryRouter>);
}

describe('PrismHomePage', () => {
  it('renders the page title and intro', () => {
    renderPage();
    expect(screen.getByText('prism.title')).toBeInTheDocument();
    expect(screen.getByText('prism.intro')).toBeInTheDocument();
  });

  it('renders the connector gallery groups from the default catalog', async () => {
    renderPage();
    // Group headings (survey / reviews / files) all render since the default catalog covers all.
    expect(screen.getByText('prism.gallery.surveysGroup')).toBeInTheDocument();
    expect(screen.getByText('prism.gallery.reviewsGroup')).toBeInTheDocument();
    expect(screen.getByText('prism.gallery.filesGroup')).toBeInTheDocument();
    // A representative connector from each group.
    await waitFor(() => expect(screen.getByText('Qualtrics')).toBeInTheDocument());
    expect(screen.getByText('Yelp')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('shows the recent-imports empty state when there are no jobs', () => {
    renderPage();
    expect(screen.getByText('prism.recent.title')).toBeInTheDocument();
    expect(screen.getByText('prism.recent.empty')).toBeInTheDocument();
  });

  it('renders recent jobs when present (connection label + status)', async () => {
    vi.mocked(usePrismConnections).mockReturnValue(
      buildConnectionsMock({
        connections: [{ id: 'c1', label: 'Acme Qualtrics' }],
        jobs: [{
          id: 'job1',
          connection_id: 'c1',
          status: 'complete',
          counts: { loaded: 1234 },
          updated_at: new Date().toISOString(),
        }],
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Acme Qualtrics')).toBeInTheDocument());
    // Recent-empty message should NOT be shown when a job exists.
    expect(screen.queryByText('prism.recent.empty')).not.toBeInTheDocument();
  });
});
