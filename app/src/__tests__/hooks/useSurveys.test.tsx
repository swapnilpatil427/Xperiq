import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Survey } from '../../types';

// Mock useApi before importing anything that uses it
vi.mock('../../hooks/useApi', () => ({
  useApi: vi.fn(),
  default: vi.fn(),
}));

import { useApi } from '../../hooks/useApi';
import { useSurveys } from '../../hooks/useSurveys';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: 's1',
    org_id: 'org-1',
    title: 'Test Survey',
    status: 'active',
    questions: [],
    response_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const EMPTY_LIST_RESULT = {
  surveys: [],
  total: 0,
  page: 1,
  limit: 50,
  hasMore: false,
  stats: { total_surveys: 0, active_surveys: 0, total_responses: 0, avg_nps: null },
};

function makeListResult(surveys: Survey[]) {
  return { ...EMPTY_LIST_RESULT, surveys, total: surveys.length };
}

// ── Mock API setup ────────────────────────────────────────────────────────────

const mockListSurveys   = vi.fn();
const mockCreateSurvey  = vi.fn();
const mockUpdateSurvey  = vi.fn();
const mockDeleteSurvey  = vi.fn();
const mockPublishSurvey = vi.fn();

const mockApi = {
  listSurveys:   mockListSurveys,
  createSurvey:  mockCreateSurvey,
  updateSurvey:  mockUpdateSurvey,
  deleteSurvey:  mockDeleteSurvey,
  publishSurvey: mockPublishSurvey,
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(mockApi as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('useSurveys — initial loading state', () => {
  it('starts with loading = true before the API resolves', () => {
    // Never-resolving promise to freeze the hook in loading state
    mockListSurveys.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSurveys());
    expect(result.current.loading).toBe(true);
  });

  it('starts with an empty surveys array before the API resolves', () => {
    mockListSurveys.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSurveys());
    expect(result.current.surveys).toEqual([]);
  });

  it('starts with error = null', () => {
    mockListSurveys.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSurveys());
    expect(result.current.error).toBeNull();
  });
});

// ── Successful load ───────────────────────────────────────────────────────────

describe('useSurveys — successful API load', () => {
  it('sets loading = false after the API resolves', async () => {
    mockListSurveys.mockResolvedValue(makeListResult([]));
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('populates surveys from the API response', async () => {
    const surveys = [makeSurvey({ id: 's1' }), makeSurvey({ id: 's2', title: 'Second' })];
    mockListSurveys.mockResolvedValue(makeListResult(surveys));
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.surveys).toEqual(surveys);
  });

  it('keeps error = null on successful load', async () => {
    mockListSurveys.mockResolvedValue(makeListResult([]));
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('calls listSurveys exactly once on mount', async () => {
    mockListSurveys.mockResolvedValue(EMPTY_LIST_RESULT);
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListSurveys).toHaveBeenCalledTimes(1);
  });
});

// ── API failure fallback ──────────────────────────────────────────────────────

describe('useSurveys — API failure fallback', () => {
  it('falls back to MOCK data when the API throws', async () => {
    mockListSurveys.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.surveys.length).toBeGreaterThan(0);
  });

  it('keeps error = null even on API failure (graceful degradation)', async () => {
    mockListSurveys.mockRejectedValue(new Error('Timeout'));
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('MOCK fallback surveys all have required fields', async () => {
    mockListSurveys.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));
    result.current.surveys.forEach((s) => {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.status).toBeTruthy();
    });
  });
});

// ── createSurvey ──────────────────────────────────────────────────────────────

describe('useSurveys — createSurvey', () => {
  it('returns the created survey from the API', async () => {
    const newSurvey = makeSurvey({ id: 'new-1', title: 'Brand New', status: 'draft' });
    mockListSurveys.mockResolvedValue(EMPTY_LIST_RESULT);
    mockCreateSurvey.mockResolvedValue({ survey: newSurvey });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: Survey | undefined;
    await act(async () => {
      created = await result.current.createSurvey({ title: 'Brand New' });
    });

    expect(created).toEqual(newSurvey);
    expect(mockCreateSurvey).toHaveBeenCalledWith({ title: 'Brand New' });
  });

  it('triggers a reload after a successful create', async () => {
    const newSurvey = makeSurvey({ id: 'new-2' });
    mockListSurveys.mockResolvedValue(EMPTY_LIST_RESULT);
    mockCreateSurvey.mockResolvedValue({ survey: newSurvey });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createSurvey({ title: 'Test' });
    });

    // Initial load + reload after create = 2 calls
    expect(mockListSurveys).toHaveBeenCalledTimes(2);
  });

  it('returns a mock survey when the API create fails', async () => {
    mockListSurveys.mockResolvedValue(EMPTY_LIST_RESULT);
    mockCreateSurvey.mockRejectedValue(new Error('API unavailable'));

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: Survey | undefined;
    await act(async () => {
      created = await result.current.createSurvey({ title: 'Fallback Survey', status: 'draft' });
    });

    expect(created).toBeDefined();
    expect(created?.title).toBe('Fallback Survey');
    expect(created?.status).toBe('draft');
    expect(created?.id).toBeTruthy();
  });

  it('adds fallback survey to the list when API create fails', async () => {
    mockListSurveys.mockResolvedValue(EMPTY_LIST_RESULT);
    mockCreateSurvey.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createSurvey({ title: 'Optimistic Survey' });
    });

    const titles = result.current.surveys.map((s) => s.title);
    expect(titles).toContain('Optimistic Survey');
  });
});

// ── updateSurvey ──────────────────────────────────────────────────────────────

describe('useSurveys — updateSurvey', () => {
  it('optimistically updates the survey in state', async () => {
    const survey = makeSurvey({ id: 's1', title: 'Original' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockUpdateSurvey.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSurvey('s1', { title: 'Updated Title' });
    });

    const updated = result.current.surveys.find((s) => s.id === 's1');
    expect(updated?.title).toBe('Updated Title');
  });

  it('calls the API with the correct id and payload', async () => {
    const survey = makeSurvey({ id: 's1' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockUpdateSurvey.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSurvey('s1', { status: 'paused' });
    });

    expect(mockUpdateSurvey).toHaveBeenCalledWith('s1', { status: 'paused' });
  });

  it('updates updated_at timestamp in the optimistic update', async () => {
    const survey = makeSurvey({ id: 's1', updated_at: '2026-01-01T00:00:00Z' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockUpdateSurvey.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const beforeUpdate = Date.now();
    await act(async () => {
      await result.current.updateSurvey('s1', { title: 'Changed' });
    });

    const updatedSurvey = result.current.surveys.find((s) => s.id === 's1');
    const updatedAt = new Date(updatedSurvey!.updated_at).getTime();
    expect(updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
  });

  it('does not remove other surveys when updating one', async () => {
    const surveys = [makeSurvey({ id: 's1' }), makeSurvey({ id: 's2', title: 'Other' })];
    mockListSurveys.mockResolvedValue(makeListResult(surveys));
    mockUpdateSurvey.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSurvey('s1', { title: 'Changed' });
    });

    expect(result.current.surveys).toHaveLength(2);
    expect(result.current.surveys.find((s) => s.id === 's2')?.title).toBe('Other');
  });

  it('keeps optimistic update even when API call fails', async () => {
    const survey = makeSurvey({ id: 's1', title: 'Old' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockUpdateSurvey.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSurvey('s1', { title: 'Optimistic' });
    });

    // The optimistic update is not rolled back on API failure
    expect(result.current.surveys.find((s) => s.id === 's1')?.title).toBe('Optimistic');
  });
});

// ── deleteSurvey ──────────────────────────────────────────────────────────────

describe('useSurveys — deleteSurvey', () => {
  it('removes the deleted survey from state immediately', async () => {
    const surveys = [makeSurvey({ id: 's1' }), makeSurvey({ id: 's2', title: 'Keep Me' })];
    mockListSurveys.mockResolvedValue(makeListResult(surveys));
    mockDeleteSurvey.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteSurvey('s1');
    });

    expect(result.current.surveys).toHaveLength(1);
    expect(result.current.surveys[0].id).toBe('s2');
  });

  it('calls the API with the correct survey id', async () => {
    const surveys = [makeSurvey({ id: 's1' })];
    mockListSurveys.mockResolvedValue(makeListResult(surveys));
    mockDeleteSurvey.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteSurvey('s1');
    });

    expect(mockDeleteSurvey).toHaveBeenCalledWith('s1');
  });

  it('still removes the survey from state even when API call fails', async () => {
    const surveys = [makeSurvey({ id: 's1' }), makeSurvey({ id: 's2' })];
    mockListSurveys.mockResolvedValue(makeListResult(surveys));
    mockDeleteSurvey.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteSurvey('s1');
    });

    expect(result.current.surveys.some((s) => s.id === 's1')).toBe(false);
  });
});

// ── publishSurvey ─────────────────────────────────────────────────────────────

describe('useSurveys — publishSurvey', () => {
  it('returns the publishToken from the API', async () => {
    const survey = makeSurvey({ id: 's1', status: 'draft' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockPublishSurvey.mockResolvedValue({ publishToken: 'tok-abc', publishedAt: '2026-01-01T00:00:00Z' });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let published: { publishToken: string; publishedAt?: string } | undefined;
    await act(async () => {
      published = await result.current.publishSurvey('s1');
    });

    expect(published?.publishToken).toBe('tok-abc');
  });

  it('updates the survey status to "active" after publishing', async () => {
    const survey = makeSurvey({ id: 's1', status: 'draft' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockPublishSurvey.mockResolvedValue({ publishToken: 'tok-123', publishedAt: '2026-01-01T00:00:00Z' });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.publishSurvey('s1');
    });

    expect(result.current.surveys.find((s) => s.id === 's1')?.status).toBe('active');
  });

  it('returns a mock token and marks status "active" when API publish fails', async () => {
    const survey = makeSurvey({ id: 's1', status: 'draft' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockPublishSurvey.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let published: { publishToken: string } | undefined;
    await act(async () => {
      published = await result.current.publishSurvey('s1');
    });

    expect(published?.publishToken).toBe('mock-s1');
    expect(result.current.surveys.find((s) => s.id === 's1')?.status).toBe('active');
  });

  it('calls publishSurvey API with the correct survey id', async () => {
    const survey = makeSurvey({ id: 's1', status: 'draft' });
    mockListSurveys.mockResolvedValue(makeListResult([survey]));
    mockPublishSurvey.mockResolvedValue({ publishToken: 'tok', publishedAt: '2026-01-01T00:00:00Z' });

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.publishSurvey('s1');
    });

    expect(mockPublishSurvey).toHaveBeenCalledWith('s1');
    expect(mockPublishSurvey).toHaveBeenCalledTimes(1);
  });
});

// ── reload ────────────────────────────────────────────────────────────────────

describe('useSurveys — reload', () => {
  it('re-fetches surveys and updates state', async () => {
    const initial = [makeSurvey({ id: 's1' })];
    const reloaded = [makeSurvey({ id: 's1' }), makeSurvey({ id: 's2', title: 'New Survey' })];

    mockListSurveys
      .mockResolvedValueOnce(makeListResult(initial))
      .mockResolvedValueOnce(makeListResult(reloaded));

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.surveys).toHaveLength(1);

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.surveys).toHaveLength(2);
    expect(result.current.surveys[1].title).toBe('New Survey');
  });

  it('sets loading = true during reload', async () => {
    let resolveSecond!: (v: unknown) => void;
    const secondCall = new Promise((res) => { resolveSecond = res; });

    mockListSurveys
      .mockResolvedValueOnce(EMPTY_LIST_RESULT)
      .mockReturnValueOnce(secondCall);

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.reload();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveSecond(EMPTY_LIST_RESULT);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('increments listSurveys call count with each reload', async () => {
    mockListSurveys.mockResolvedValue(EMPTY_LIST_RESULT);

    const { result } = renderHook(() => useSurveys());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockListSurveys).toHaveBeenCalledTimes(3);
  });
});
