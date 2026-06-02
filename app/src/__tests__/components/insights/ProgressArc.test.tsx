import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProgressArc } from '../../../components/insights/ProgressArc';

afterEach(cleanup);

describe('ProgressArc', () => {
  it('renders the collecting symbol ○ for collecting tier', () => {
    render(<ProgressArc tier="collecting" />);
    expect(screen.getByRole('img').textContent).toBe('○');
  });

  it('renders ◔ for first_voices tier', () => {
    render(<ProgressArc tier="first_voices" />);
    expect(screen.getByRole('img').textContent).toBe('◔');
  });

  it('renders ◑ for early_signals tier', () => {
    render(<ProgressArc tier="early_signals" />);
    expect(screen.getByRole('img').textContent).toBe('◑');
  });

  it('renders ◕ for growing_picture tier', () => {
    render(<ProgressArc tier="growing_picture" />);
    expect(screen.getByRole('img').textContent).toBe('◕');
  });

  it('renders ● for full_report tier', () => {
    render(<ProgressArc tier="full_report" />);
    expect(screen.getByRole('img').textContent).toBe('●');
  });

  it('includes tier name in aria-label', () => {
    render(<ProgressArc tier="early_signals" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('early signals');
  });

  it('includes response count in aria-label when provided', () => {
    render(<ProgressArc tier="first_voices" responseCount={15} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('15');
  });

  it('omits response count from aria-label when not provided', () => {
    render(<ProgressArc tier="collecting" />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).not.toMatch(/\d+ responses/);
  });
});
