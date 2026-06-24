import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScimToken } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { ProvisioningPage } from '../../pages/settings/ProvisioningPage';

const token: ScimToken = {
  id: 'tk1', name: 'Okta Production', tokenPrefix: 'esc_ab12', provider: 'okta',
  lastUsedAt: null, lastSyncAt: null, syncStats: null, isActive: true,
  createdAt: '2026-01-01', revokedAt: null,
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue({
    listScimTokens: vi.fn().mockResolvedValue({ tokens: [token], scimBaseUrl: 'https://api.experient.ai/scim/v2' }),
    getSsoMappings: vi.fn().mockResolvedValue({ mappings: { title: 'job_title' } }),
    createScimToken: vi.fn(), revokeScimToken: vi.fn(), updateSsoMappings: vi.fn(),
  } as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ProvisioningPage', () => {
  it('renders the SCIM endpoint, tokens, and SSO mapping rows', async () => {
    render(<MemoryRouter><ProvisioningPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Okta Production')).toBeInTheDocument());
    expect(screen.getByText('https://api.experient.ai/scim/v2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('job_title')).toBeInTheDocument(); // mapping row loaded
    expect(screen.getByRole('button', { name: /generate token/i })).toBeInTheDocument();
  });
});
