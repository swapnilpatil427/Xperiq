import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPdf, renderPptx } from '../lib/exporters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const VISUAL_PATH = _require.resolve(resolve(__dirname, '../lib/visualReport'));

const data = {
  survey: { title: 'Q3 Relationship Survey' },
  metrics: { nps: 42, csat: 4.3, responseCount: 1280 },
  topics: [{ name: 'Wait time', sentiment: 'negative', volume: 120 }],
  summary: 'NPS recovered 8 points this quarter.',
};

// ── renderPdf ─────────────────────────────────────────────────────────────────

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

  it('closes the browser even when page.pdf throws', async () => {
    const pdf = vi.fn(async () => { throw new Error('render failed'); });
    const setContent = vi.fn(async () => {});
    const newPage = vi.fn(async () => ({ setContent, pdf }));
    const close = vi.fn(async () => {});
    const launch = vi.fn(async () => ({ newPage, close }));

    await expect(renderPdf(data, { load: () => ({ launch }) })).rejects.toThrow('render failed');
    // browser must be closed in the finally block even on error
    expect(close).toHaveBeenCalled();
  });

  it('passes --no-sandbox and --disable-setuid-sandbox launch args', async () => {
    const pdf = vi.fn(async () => Buffer.from('fake'));
    const setContent = vi.fn(async () => {});
    const newPage = vi.fn(async () => ({ setContent, pdf }));
    const close = vi.fn(async () => {});
    const launch = vi.fn(async () => ({ newPage, close }));

    await renderPdf(data, { load: () => ({ launch }) });
    const launchOpts = launch.mock.calls[0][0];
    expect(launchOpts.args).toContain('--no-sandbox');
    expect(launchOpts.args).toContain('--disable-setuid-sandbox');
  });

  it('passes waitUntil networkidle0 to page.setContent', async () => {
    const pdf = vi.fn(async () => Buffer.from('fake'));
    const setContent = vi.fn(async () => {});
    const newPage = vi.fn(async () => ({ setContent, pdf }));
    const close = vi.fn(async () => {});
    const launch = vi.fn(async () => ({ newPage, close }));

    await renderPdf(data, { load: () => ({ launch }) });
    expect(setContent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ waitUntil: 'networkidle0' })
    );
  });
});

// ── renderPptx ────────────────────────────────────────────────────────────────

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

  it('sets the correct contentType for pptx', async () => {
    function FakePptx() {
      this.addSlide = () => ({ addText: vi.fn(), addTable: vi.fn(), background: null });
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    const r = await renderPptx(data, { load: () => FakePptx });
    expect(r.available).toBe(true);
    expect(r.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
  });

  it('renders "No topics yet." placeholder row when topics is empty', async () => {
    let capturedTableArgs = null;
    function FakePptx() {
      this.addSlide = () => ({
        addText: vi.fn(),
        addTable: vi.fn((...args) => { capturedTableArgs = args[0]; }),
        background: null,
      });
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    await renderPptx({ ...data, topics: [] }, { load: () => FakePptx });
    // First element of the table arg array is the rows array (header + data rows)
    expect(capturedTableArgs).not.toBeNull();
    const dataRows = capturedTableArgs.slice(1); // skip header
    expect(dataRows[0][0]).toBe('No topics yet.');
  });

  it('uses survey title as the title slide text', async () => {
    const titleSlideTexts = [];
    let slideCount = 0;
    function FakePptx() {
      this.addSlide = () => {
        const idx = slideCount++;
        return {
          addText: vi.fn((text) => { if (idx === 0) titleSlideTexts.push(text); }),
          addTable: vi.fn(),
          background: null,
        };
      };
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    await renderPptx(data, { load: () => FakePptx });
    expect(titleSlideTexts.some((t) => t === 'Q3 Relationship Survey')).toBe(true);
  });

  it('falls back to "Insight Report" when survey has no title', async () => {
    const titleSlideTexts = [];
    let slideCount = 0;
    function FakePptx() {
      this.addSlide = () => {
        const idx = slideCount++;
        return {
          addText: vi.fn((text) => { if (idx === 0) titleSlideTexts.push(text); }),
          addTable: vi.fn(),
          background: null,
        };
      };
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    const r = await renderPptx({ ...data, survey: {} }, { load: () => FakePptx });
    expect(r.available).toBe(true);
    expect(titleSlideTexts.some((t) => String(t).includes('Insight Report'))).toBe(true);
  });

  it('renders all three metric labels on the metrics slide', async () => {
    const metricsSlideTexts = [];
    let slideCount = 0;
    function FakePptx() {
      this.addSlide = () => {
        const idx = slideCount++;
        return {
          addText: vi.fn((text) => { if (idx === 1) metricsSlideTexts.push(text); }),
          addTable: vi.fn(),
          background: null,
        };
      };
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    await renderPptx(data, { load: () => FakePptx });
    expect(metricsSlideTexts.some((t) => String(t) === 'NPS')).toBe(true);
    expect(metricsSlideTexts.some((t) => String(t) === 'CSAT')).toBe(true);
    expect(metricsSlideTexts.some((t) => String(t) === 'Responses')).toBe(true);
  });

  it('renders em-dash for null metric values', async () => {
    const metricsSlideTexts = [];
    let slideCount = 0;
    function FakePptx() {
      this.addSlide = () => {
        const idx = slideCount++;
        return {
          addText: vi.fn((text) => { if (idx === 1) metricsSlideTexts.push(text); }),
          addTable: vi.fn(),
          background: null,
        };
      };
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    await renderPptx(
      { ...data, metrics: { nps: null, csat: null, responseCount: null } },
      { load: () => FakePptx }
    );
    // All three metric value texts should be the em-dash
    const dashes = metricsSlideTexts.filter((t) => t === '—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });
});

// ── buildReportHtml ───────────────────────────────────────────────────────────

describe('buildReportHtml', () => {
  let buildReportHtml;

  beforeEach(() => {
    delete _require.cache[VISUAL_PATH];
    ({ buildReportHtml } = _require(VISUAL_PATH));
  });

  it('returns a string containing <html>, <head>, <body> tags', () => {
    const html = buildReportHtml(data);
    expect(typeof html).toBe('string');
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<head/i);
    expect(html).toMatch(/<body/i);
  });

  it('starts with <!doctype html>', () => {
    const html = buildReportHtml(data);
    expect(html.trimStart()).toMatch(/^<!doctype html>/i);
  });

  it('embeds the survey title in the output', () => {
    const html = buildReportHtml(data);
    expect(html).toContain('Q3 Relationship Survey');
  });

  it('puts the survey title in the <title> element', () => {
    const html = buildReportHtml(data);
    expect(html).toMatch(/<title>.*Q3 Relationship Survey.*<\/title>/i);
  });

  it('embeds all metric values', () => {
    const html = buildReportHtml(data);
    expect(html).toContain('42');   // nps
    expect(html).toContain('4.3');  // csat
    expect(html).toContain('1280'); // responseCount
  });

  it('embeds topic names and sentiments', () => {
    const html = buildReportHtml(data);
    expect(html).toContain('Wait time');
    expect(html).toContain('negative');
    expect(html).toContain('120'); // volume
  });

  it('embeds the summary text', () => {
    const html = buildReportHtml(data);
    expect(html).toContain('NPS recovered 8 points this quarter.');
  });

  it('omits the summary div when summary is empty string', () => {
    const html = buildReportHtml({ ...data, summary: '' });
    expect(html).not.toContain('class="summary"');
  });

  it('renders "No topics yet." when topics array is empty', () => {
    const html = buildReportHtml({ ...data, topics: [] });
    expect(html).toContain('No topics yet.');
  });

  it('renders "Insight Report" as fallback title when survey has no title', () => {
    const html = buildReportHtml({ survey: {}, metrics: {}, topics: [], summary: '' });
    expect(html).toContain('Insight Report');
  });

  it('escapes HTML-special characters in survey title to prevent XSS', () => {
    const html = buildReportHtml({ ...data, survey: { title: '<script>xss</script>' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML-special characters in topic names', () => {
    const html = buildReportHtml({
      ...data,
      topics: [{ name: '<b>bold</b>', sentiment: 'positive', volume: 10 }],
    });
    expect(html).not.toMatch(/<b>bold<\/b>/);
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('renders em-dash for null metric values', () => {
    const html = buildReportHtml({
      ...data,
      metrics: { nps: null, csat: null, responseCount: null },
    });
    // Each null metric should produce an em-dash in a kpi-v element
    const dashMatches = html.match(/—/g);
    expect(dashMatches).not.toBeNull();
    expect(dashMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('renders topic sentiment as em-dash when sentiment is null/undefined', () => {
    const html = buildReportHtml({
      ...data,
      topics: [{ name: 'Onboarding', sentiment: null, volume: 5 }],
    });
    expect(html).toContain('Onboarding');
    // Null sentiment should fall back to —
    expect(html).toContain('—');
  });
});
