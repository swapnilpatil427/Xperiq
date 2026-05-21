import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyStatusBanner } from '../../../components/insights/SurveyStatusBanner';

afterEach(cleanup);

describe('SurveyStatusBanner — paused', () => {
  it('renders amber styling for paused status', () => {
    const { container } = render(
      <SurveyStatusBanner status="paused" responseCount={50} />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('amber');
  });

  it('shows the resume button when onResume is provided', () => {
    render(
      <SurveyStatusBanner status="paused" responseCount={50} onResume={() => {}} />
    );
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('does NOT show resume button when onResume is not provided', () => {
    render(<SurveyStatusBanner status="paused" responseCount={50} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onResume when the resume button is clicked', async () => {
    const handler = vi.fn();
    render(
      <SurveyStatusBanner status="paused" responseCount={50} onResume={handler} />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('SurveyStatusBanner — closed', () => {
  it('renders gray styling for closed status', () => {
    const { container } = render(
      <SurveyStatusBanner status="closed" responseCount={200} />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('gray');
  });

  it('does NOT show resume button for closed surveys even with onResume', () => {
    render(
      <SurveyStatusBanner status="closed" responseCount={200} onResume={() => {}} />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not throw when response count is 0', () => {
    expect(() =>
      render(<SurveyStatusBanner status="closed" responseCount={0} />)
    ).not.toThrow();
  });
});
