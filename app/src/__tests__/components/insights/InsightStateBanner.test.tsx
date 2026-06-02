import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InsightStateBanner } from '../../../components/insights/InsightStateBanner';

afterEach(cleanup);

const noop = () => {};

describe('InsightStateBanner', () => {
  it('renders null when pageState is ready and survey is active', () => {
    const { container } = render(
      <InsightStateBanner
        pageState="ready"
        surveyStatus="active"
        canManualRefresh={false}
        manualRefreshLimitReached={false}
        onGenerateInsight={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a banner when pageState is collecting', () => {
    const { container } = render(
      <InsightStateBanner
        pageState="collecting"
        surveyStatus="active"
        canManualRefresh={false}
        manualRefreshLimitReached={false}
        onGenerateInsight={noop}
      />
    );
    // Banner renders (not null) and has content
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does NOT show generate button when surveyStatus is paused', () => {
    render(
      <InsightStateBanner
        pageState="stale"
        surveyStatus="paused"
        canManualRefresh={true}
        manualRefreshLimitReached={false}
        onGenerateInsight={noop}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does NOT show generate button when surveyStatus is closed', () => {
    render(
      <InsightStateBanner
        pageState="stale"
        surveyStatus="closed"
        canManualRefresh={true}
        manualRefreshLimitReached={false}
        onGenerateInsight={noop}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does NOT show generate button when canManualRefresh is false', () => {
    render(
      <InsightStateBanner
        pageState="stale"
        surveyStatus="active"
        canManualRefresh={false}
        manualRefreshLimitReached={false}
        onGenerateInsight={noop}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows generate button when canManualRefresh is true and survey is active', () => {
    render(
      <InsightStateBanner
        pageState="stale"
        surveyStatus="active"
        canManualRefresh={true}
        manualRefreshLimitReached={false}
        onGenerateInsight={noop}
      />
    );
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('disables the button when manualRefreshLimitReached is true', () => {
    render(
      <InsightStateBanner
        pageState="stale"
        surveyStatus="active"
        canManualRefresh={true}
        manualRefreshLimitReached={true}
        onGenerateInsight={noop}
      />
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('calls onGenerateInsight when generate button is clicked', async () => {
    const handler = vi.fn();
    render(
      <InsightStateBanner
        pageState="stale"
        surveyStatus="active"
        canManualRefresh={true}
        manualRefreshLimitReached={false}
        onGenerateInsight={handler}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});
