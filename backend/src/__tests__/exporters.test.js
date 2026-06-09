import { describe, it, expect, vi } from 'vitest';
import { renderPdf, renderPptx } from '../lib/exporters.js';

const data = {
  survey: { title: 'Q3 Relationship Survey' },
  metrics: { nps: 42, csat: 4.3, responseCount: 1280 },
  topics: [{ name: 'Wait time', sentiment: 'negative', volume: 120 }],
  summary: 'NPS recovered 8 points this quarter.',
};

describe('renderPdf', () => {
  it('degrades gracefully when puppeteer is not installed', async () => {
    const r = await renderPdf(data, { load: () => null });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('puppeteer_not_installed');
  });

  it('renders a PDF buffer via headless Chromium when available', async () => {
    const pdf = vi.fn(async () => Buffer.from('%PDF-1.7 fake'));
    const setContent = vi.fn(async () => {});
    const newPage = vi.fn(async () => ({ setContent, pdf }));
    const close = vi.fn(async () => {});
    const launch = vi.fn(async () => ({ newPage, close }));
    const fakePuppeteer = { launch };

    const r = await renderPdf(data, { load: () => fakePuppeteer });
    expect(r.available).toBe(true);
    expect(r.contentType).toBe('application/pdf');
    expect(r.ext).toBe('pdf');
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining('Q3 Relationship Survey'), expect.any(Object));
    expect(close).toHaveBeenCalled(); // browser always closed
  });
});

describe('renderPptx', () => {
  it('degrades gracefully when pptxgenjs is not installed', async () => {
    const r = await renderPptx(data, { load: () => null });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('pptxgenjs_not_installed');
  });

  it('builds a PPTX buffer with title, metrics and topic slides when available', async () => {
    const slides = [];
    function FakePptx() {
      this.addSlide = () => { const s = { addText: vi.fn(), addTable: vi.fn(), background: null }; slides.push(s); return s; };
      this.write = vi.fn(async () => Buffer.from('PK fake-pptx'));
    }
    const r = await renderPptx(data, { load: () => FakePptx });
    expect(r.available).toBe(true);
    expect(r.ext).toBe('pptx');
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
    expect(slides).toHaveLength(3); // title + metrics + topics
    expect(slides[2].addTable).toHaveBeenCalled();
  });
});
