import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { NotificationPreferencesPage } from '../../pages/settings/NotificationPreferencesPage';

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue({
    getNotificationPreferences: vi.fn().mockResolvedValue({
      preferences: [{ notificationType: 'score.nps_drop', inAppEnabled: true, emailEnabled: true, slackEnabled: false }],
    }),
    getNotificationDigest: vi.fn().mockResolvedValue({ period: 'week', total: 4, byPriority: { critical: 1, info: 3 }, byType: [], topItems: [] }),
    updateNotificationPreferences: vi.fn().mockResolvedValue({ updated: 1 }),
  } as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('NotificationPreferencesPage', () => {
  it('renders the per-type channel matrix', async () => {
    render(<MemoryRouter><NotificationPreferencesPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('score.nps_drop')).toBeInTheDocument());
    // Other taxonomy rows render too
    expect(screen.getByText('crystal.insight_ready')).toBeInTheDocument();
    expect(screen.getByText('system.pipeline_error')).toBeInTheDocument();
  });
});
