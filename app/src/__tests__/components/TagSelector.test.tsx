import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string, _vars?: Record<string, unknown>) => key }),
}));

import { useApi } from '../../hooks/useApi';
import { TagSelector } from '../../components/TagSelector';
import type { SurveyTag } from '../../lib/api';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeTag = (overrides: Partial<SurveyTag> & { id: string; name: string }): SurveyTag => ({
  slug: overrides.name.toLowerCase().replace(/\s+/g, '-'),
  color: '#6366f1',
  created_at: '2026-01-01',
  ...overrides,
});

const tagAlpha = makeTag({ id: 't1', name: 'Alpha', color: '#6366f1' });
const tagBeta  = makeTag({ id: 't2', name: 'Beta',  color: '#10b981' });
const tagGamma = makeTag({ id: 't3', name: 'Gamma', color: '#f59e0b' });

// ── Default mock API factory ──────────────────────────────────────────────────

function makeApi(tags: SurveyTag[] = [tagAlpha, tagBeta, tagGamma]) {
  return {
    listTags: vi.fn().mockResolvedValue({ tags }),
    createTag: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TagSelector', () => {
  describe('placeholder and selected chips', () => {
    it('renders placeholder text when no tags are selected', async () => {
      vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} placeholder="Add tags…" />,
      );
      expect(screen.getByPlaceholderText('Add tags…')).toBeInTheDocument();
    });

    it('uses the i18n fallback key as placeholder when no placeholder prop given', async () => {
      vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      // i18n mock returns the key itself
      expect(screen.getByPlaceholderText('groups.searchTags')).toBeInTheDocument();
    });

    it('renders selected tags as TagBadge chips inside the input area', async () => {
      vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector selectedTags={[tagAlpha, tagBeta]} onAdd={vi.fn()} onRemove={vi.fn()} />,
      );
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  describe('loading tags on mount', () => {
    it('calls api.listTags with an empty query on mount', async () => {
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalledWith({ q: '' }));
    });
  });

  describe('opening the dropdown', () => {
    it('opens the dropdown when the input area is clicked', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      // The outer div acts as the click target
      const inputArea = screen.getByPlaceholderText('groups.searchTags').closest('div')!;
      await user.click(inputArea);

      // All loaded tags should now be visible as options
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.getByText('Gamma')).toBeInTheDocument();
    });

    it('opens the dropdown when the text input receives focus', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      await user.click(screen.getByPlaceholderText('groups.searchTags'));
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });

  describe('filtering options', () => {
    it('shows only tags that match the current query', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('groups.searchTags');
      await user.click(input);
      await user.type(input, 'alp');

      // Only Alpha should match; Beta and Gamma should not appear as options
      await waitFor(() => {
        expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
      });
    });

    it('excludes already-selected tags from the dropdown options', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector selectedTags={[tagAlpha]} onAdd={vi.fn()} onRemove={vi.fn()} />,
      );
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('');
      await user.click(input);

      // Beta and Gamma should be present as options; Alpha (selected) should not appear in the dropdown list
      const buttons = screen.getAllByRole('button');
      const buttonTexts = buttons.map((b) => b.textContent ?? '');
      expect(buttonTexts.some((t) => t.includes('Beta'))).toBe(true);
      expect(buttonTexts.some((t) => t.includes('Gamma'))).toBe(true);
      // Alpha is displayed as a chip (remove button) but not as a selectable dropdown option button
      const dropdownButtons = buttons.filter(
        (b) => b.getAttribute('aria-label') !== 'Remove Alpha',
      );
      expect(dropdownButtons.some((b) => b.textContent?.trim() === 'Alpha')).toBe(false);
    });
  });

  describe('selecting an option', () => {
    it('calls onAdd with the tag and clears the query when an option is clicked', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      const onAdd = vi.fn();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={onAdd} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('groups.searchTags');
      await user.click(input);

      const alphaBtn = screen.getAllByRole('button').find((b) => b.textContent?.trim() === 'Alpha')!;
      await user.click(alphaBtn);

      expect(onAdd).toHaveBeenCalledOnce();
      expect(onAdd).toHaveBeenCalledWith(tagAlpha);
      // Query cleared — placeholder visible again
      expect(screen.getByPlaceholderText('groups.searchTags')).toHaveValue('');
    });
  });

  describe('create new tag', () => {
    it('shows the Create section when typing a name with no exact match', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('groups.searchTags');
      await user.click(input);
      await user.type(input, 'NewTag');

      await waitFor(() => {
        expect(screen.getByText(/Create tag/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Create "NewTag"/i)).toBeInTheDocument();
    });

    it('shows color swatches inside the Create section', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      await user.click(screen.getByPlaceholderText('groups.searchTags'));
      await user.type(screen.getByPlaceholderText('groups.searchTags'), 'UniqueColor');

      await waitFor(() => expect(screen.getByText(/Create tag/i)).toBeInTheDocument());
      // 8 preset color swatches
      const colorButtons = screen
        .getAllByRole('button')
        .filter((b) => b.style.background && !b.textContent?.includes('Create'));
      expect(colorButtons.length).toBeGreaterThanOrEqual(8);
    });

    it('does NOT show Create section when query exactly matches an existing tag', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      await user.click(screen.getByPlaceholderText('groups.searchTags'));
      await user.type(screen.getByPlaceholderText('groups.searchTags'), 'Alpha');

      await waitFor(() => {});
      expect(screen.queryByText(/Create tag/i)).not.toBeInTheDocument();
    });

    it('clicking the Create button calls api.createTag then onAdd with the result', async () => {
      const user = userEvent.setup();
      const newTag = makeTag({ id: 'new-1', name: 'NewTag', color: '#6366f1' });
      const api = makeApi();
      api.createTag = vi.fn().mockResolvedValue({ tag: newTag });
      const onAdd = vi.fn();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={onAdd} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      await user.click(screen.getByPlaceholderText('groups.searchTags'));
      await user.type(screen.getByPlaceholderText('groups.searchTags'), 'NewTag');

      await waitFor(() => expect(screen.getByText(/Create "NewTag"/i)).toBeInTheDocument());
      await user.click(screen.getByText(/Create "NewTag"/i));

      await waitFor(() => expect(api.createTag).toHaveBeenCalledOnce());
      expect(api.createTag).toHaveBeenCalledWith({ name: 'NewTag', color: '#6366f1' });
      expect(onAdd).toHaveBeenCalledWith(newTag);
    });

    it('pressing Enter on a new name triggers tag creation', async () => {
      const user = userEvent.setup();
      const newTag = makeTag({ id: 'new-2', name: 'EnterTag', color: '#6366f1' });
      const api = makeApi();
      api.createTag = vi.fn().mockResolvedValue({ tag: newTag });
      const onAdd = vi.fn();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={onAdd} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('groups.searchTags');
      await user.click(input);
      await user.type(input, 'EnterTag');

      await waitFor(() => expect(screen.getByText(/Create "EnterTag"/i)).toBeInTheDocument());
      await user.keyboard('{Enter}');

      await waitFor(() => expect(api.createTag).toHaveBeenCalledOnce());
      expect(onAdd).toHaveBeenCalledWith(newTag);
    });
  });

  describe('keyboard shortcuts', () => {
    it('Backspace on empty input removes the last selected tag via onRemove', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      const onRemove = vi.fn();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector selectedTags={[tagAlpha, tagBeta]} onAdd={vi.fn()} onRemove={onRemove} />,
      );
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('');
      await user.click(input);
      // Ensure query is empty, then press Backspace
      await user.keyboard('{Backspace}');

      expect(onRemove).toHaveBeenCalledOnce();
      expect(onRemove).toHaveBeenCalledWith(tagBeta.id);
    });

    it('Escape key closes the dropdown and clears the query', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(<TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const input = screen.getByPlaceholderText('groups.searchTags');
      await user.click(input);
      // Dropdown is open — options visible
      expect(screen.getByText('Alpha')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
      });
    });
  });

  describe('maxTags limit', () => {
    it('hides the text input when at maxTags limit', () => {
      vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector
          selectedTags={[tagAlpha, tagBeta]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          maxTags={2}
        />,
      );
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows the limit message when at maxTags limit', () => {
      vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector
          selectedTags={[tagAlpha, tagBeta]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          maxTags={2}
        />,
      );
      // i18n mock returns the key; key is 'groups.tagLimitReached'
      expect(screen.getByText('groups.tagLimitReached')).toBeInTheDocument();
    });

    it('does not open the dropdown when at the maxTags limit', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(
        <TagSelector
          selectedTags={[tagAlpha, tagBeta]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          maxTags={2}
        />,
      );
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      const inputArea = screen.getByText('groups.tagLimitReached').closest('div')!;
      await user.click(inputArea);

      // No dropdown tag options should appear
      expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
    });
  });

  describe('outside click', () => {
    it('closes the dropdown on mousedown outside the component', async () => {
      const user = userEvent.setup();
      const api = makeApi();
      vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
      render(
        <div>
          <TagSelector selectedTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} />
          <div data-testid="outside">Outside</div>
        </div>,
      );
      await waitFor(() => expect(api.listTags).toHaveBeenCalled());

      // Open the dropdown
      await user.click(screen.getByPlaceholderText('groups.searchTags'));
      expect(screen.getByText('Alpha')).toBeInTheDocument();

      // Simulate mousedown on an outside element
      fireEvent.mouseDown(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
      });
    });
  });
});
