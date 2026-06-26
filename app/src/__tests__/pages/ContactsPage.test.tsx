import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string | number>) => {
      if (vars) {
        return `${k}:${JSON.stringify(vars)}`;
      }
      return k;
    },
  }),
}));
vi.mock('../../lib/dataBus', () => ({ useInvalidation: vi.fn() }));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', rest, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { useApi } from '../../hooks/useApi';
import { ContactsPage } from '../../pages/ContactsPage';

const mockApi = {
  listContacts: vi.fn(async () => ({ contacts: [], total: 0 })),
  importContacts: vi.fn(),
};

describe('ContactsPage import', () => {
  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue(mockApi as ReturnType<typeof useApi>);
    mockApi.listContacts.mockResolvedValue({ contacts: [], total: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows per-row errors when import returns failures', async () => {
    mockApi.importContacts.mockResolvedValue({
      created: 0,
      updated: 0,
      errors: [
        { index: 0, message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' },
        { index: 1, message: 'duplicate key value violates unique constraint' },
      ],
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ContactsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByText('contacts.importCsv'));
    const textarea = screen.getByPlaceholderText('contacts.import.pastePlaceholder');
    fireEvent.change(textarea, { target: { value: 'Alice,alice@acme.com,Acme' } });
    await user.click(screen.getByText('contacts.import.importButton'));

    await waitFor(() => {
      expect(screen.getByText('contacts.import.allFailed')).toBeInTheDocument();
    });
    expect(screen.getByText(/contacts\.import\.errorsHeading/)).toBeInTheDocument();
    expect(screen.getByText('contacts.import.errorMigration')).toBeInTheDocument();
    expect(screen.getByText('contacts.import.errorDuplicate')).toBeInTheDocument();
    expect(screen.getByText('contacts.import.tryAgain')).toBeInTheDocument();
  });
});
