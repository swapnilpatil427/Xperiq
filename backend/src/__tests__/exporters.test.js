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
  insights: [],
};

// ── renderPdf ─────────────────────────────────────────────────────────────────

describe('renderPdf', () => {
  function makeFakePdfmake() {
    return {
      virtualfs: { storage: {} },
      addFonts: vi.fn(),
      setLocalAccessPolicy: vi.fn(),
      setUrlAccessPolicy: vi.fn(),
      createPdf: vi.fn(() => ({ getBuffer: vi.fn(async () => Buffer.from('%PDF-1.7 fake')) })),
    };
  }

  it('degrades gracefully when pdfmake is not installed', async () => {
    const r = await renderPdf(data, { load: () => null });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('pdfmake_not_installed');
  });

  it('renders a PDF buffer when pdfmake is available', async () => {
    const fake = makeFakePdfmake();
    const r = await renderPdf(data, { load: (name) => name === 'pdfmake' ? fake : null });
    expect(r.available).toBe(true);
    expect(r.contentType).toBe('application/pdf');
    expect(r.ext).toBe('pdf');
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
    expect(fake.createPdf).toHaveBeenCalled();
  });

  it('injects fonts on first call and skips injection on second', async () => {
    const fake = makeFakePdfmake();
    const fakeFonts = { 'Roboto-Regular.ttf': Buffer.from('fakefont').toString('base64') };
    const load = (name) => name === 'pdfmake' ? fake : name === 'pdfmake/build/vfs_fonts' ? fakeFonts : null;
    await renderPdf(data, { load });
    expect(fake.addFonts).toHaveBeenCalledTimes(1);
    // Second call: storage key already present, skip injection
    fake.virtualfs.storage['Roboto-Regular.ttf'] = Buffer.from('already');
    await renderPdf(data, { load });
    expect(fake.addFonts).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('sets local and url access policies to deny', async () => {
    const fake = makeFakePdfmake();
    // Must provide fonts so the injection block (which sets policies) actually runs
    const fakeFonts = { 'Roboto-Regular.ttf': Buffer.from('fakefont').toString('base64') };
    const load = (name) => name === 'pdfmake' ? fake : name === 'pdfmake/build/vfs_fonts' ? fakeFonts : null;
    await renderPdf(data, { load });
    expect(fake.setLocalAccessPolicy).toHaveBeenCalled();
    expect(fake.setUrlAccessPolicy).toHaveBeenCalled();
    // Policies should deny access (return false)
    const localPolicy = fake.setLocalAccessPolicy.mock.calls[0][0];
    const urlPolicy = fake.setUrlAccessPolicy.mock.calls[0][0];
    expect(localPolicy()).toBe(false);
    expect(urlPolicy()).toBe(false);
  });

  it('passes survey title as docDef info.title', async () => {
    const fake = makeFakePdfmake();
    await renderPdf(data, { load: (name) => name === 'pdfmake' ? fake : null });
    const docDef = fake.createPdf.mock.calls[0][0];
    expect(docDef.info.title).toBe('Q3 Relationship Survey');
  });

  it('includes exec summary narrative in PDF content', async () => {
    const fake = makeFakePdfmake();
    const richData = {
      ...data,
      insights: [{
        category: 'report.executive_summary',
        headline: 'Exec headline',
        narrative: 'NPS climbed 8 points driven by onboarding improvements.',
        priority: 100,
        trust_score: 85,
        metric_json: { response_count: 200, prior_insights_used: 2, cross_theme_patterns: 'Both bugs and slow support overlap.' },
        citations_json: [],
        recommended_action: null,
      }],
    };
    await renderPdf(richData, { load: (name) => name === 'pdfmake' ? fake : null });
    const docDef = fake.createPdf.mock.calls[0][0];
    const allText = JSON.stringify(docDef.content);
    expect(allText).toContain('NPS climbed 8 points');
    expect(allText).toContain('Both bugs and slow support overlap.');
    expect(allText).toContain('200');
  });

  it('includes theme headline, trend badge, frequency and citations in PDF', async () => {
    const fake = makeFakePdfmake();
    const richData = {
      ...data,
      insights: [{
        category: 'report.full_theme',
        headline: 'Onboarding friction blocks activation',
        narrative: 'Multiple users report setup confusion.',
        priority: 80,
        trust_score: 72,
        metric_json: {
          sentiment: 'negative',
          frequency_estimate: 18,
          trend_direction: 'declining',
          business_impact: 'Increases churn in first 7 days.',
          root_cause_hypothesis: 'Missing onboarding checklist.',
          is_new_theme: false,
          confirms_prior: true,
        },
        citations_json: [
          { quote: 'Setup was confusing and slow', sentiment: 'negative', response_id: 'r1' },
        ],
        recommended_action: { label: 'Add onboarding checklist', time_horizon: 'short_term', priority: 'high' },
      }],
    };
    await renderPdf(richData, { load: (name) => name === 'pdfmake' ? fake : null });
    const docDef = fake.createPdf.mock.calls[0][0];
    const allText = JSON.stringify(docDef.content);
    expect(allText).toContain('Onboarding friction blocks activation');
    expect(allText).toContain('Declining');
    expect(allText).toContain('18');
    expect(allText).toContain('Setup was confusing and slow');
    expect(allText).toContain('Increases churn in first 7 days');
    expect(allText).toContain('Missing onboarding checklist');
    expect(allText).toContain('Add onboarding checklist');
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

  it('does not add a topics slide when topics array is empty', async () => {
    const slides = [];
    function FakePptx() {
      this.addSlide = () => { const s = { addText: vi.fn(), addTable: vi.fn(), background: null }; slides.push(s); return s; };
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    await renderPptx({ ...data, topics: [], insights: [] }, { load: () => FakePptx });
    // title + metrics = 2; no topics slide
    expect(slides).toHaveLength(2);
    slides.forEach(s => expect(s.addTable).not.toHaveBeenCalled());
  });

  it('adds one slide per theme when insights contain report.full_theme', async () => {
    const slides = [];
    function FakePptx() {
      this.addSlide = () => { const s = { addText: vi.fn(), addTable: vi.fn(), background: null }; slides.push(s); return s; };
      this.write = vi.fn(async () => Buffer.from('PK'));
    }
    const themeData = {
      ...data,
      insights: [
        { category: 'report.full_theme', headline: 'Theme A', narrative: 'desc A', priority: 80, trust_score: 75, metric_json: null, citations_json: [], recommended_action: null },
        { category: 'report.full_theme', headline: 'Theme B', narrative: 'desc B', priority: 70, trust_score: 65, metric_json: null, citations_json: [], recommended_action: null },
      ],
    };
    await renderPptx(themeData, { load: () => FakePptx });
    // title(1) + metrics(1) + 2 themes(2) + topics(1) = 5
    expect(slides).toHaveLength(5);
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

  it('starts with <\!doctype html>', () => {
    const html = buildReportHtml(data);
    expect(html.trimStart()).toMatch(/^<\!doctype html>/i);
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

  it('omits the exec summary box when no exec insight and empty summary', () => {
    const html = buildReportHtml({ ...data, summary: '', insights: [] });
    expect(html).not.toContain('class="exec-box"');
  });

  it('hides topics section entirely when topics array is empty', () => {
    const html = buildReportHtml({ ...data, topics: [] });
    expect(html).not.toContain('Top Topics');
    expect(html).not.toContain('<table');
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

  it('renders exec-box with narrative when executive summary insight is present', () => {
    const html = buildReportHtml({
      ...data,
      insights: [{
        category: 'report.executive_summary',
        headline: 'H',
        narrative: 'Satisfaction improved significantly.',
        priority: 100,
        trust_score: 90,
        metric_json: null,
        citations_json: [],
        recommended_action: null,
      }],
    });
    expect(html).toContain('class="exec-box"');
    expect(html).toContain('Satisfaction improved significantly.');
  });

  it('renders cross-theme-patterns section when metric_json has cross_theme_patterns', () => {
    const html = buildReportHtml({
      ...data,
      insights: [{
        category: 'report.executive_summary',
        headline: 'H',
        narrative: 'Main narrative.',
        priority: 100,
        trust_score: 85,
        metric_json: {
          response_count: 150,
          prior_insights_used: 3,
          cross_theme_patterns: 'Bugs and support failures amplify each other.',
        },
        citations_json: [],
        recommended_action: null,
      }],
    });
    expect(html).toContain('Cross-theme patterns');
    expect(html).toContain('Bugs and support failures amplify each other.');
    expect(html).toContain('150');
    expect(html).toContain('3 prior findings');
  });

  it('renders theme card with sentiment accent, badges, frequency, citations, and business impact', () => {
    const html = buildReportHtml({
      ...data,
      insights: [{
        category: 'report.full_theme',
        headline: 'Checkout abandonment rising',
        narrative: 'Users drop off at payment step.',
        priority: 85,
        trust_score: 78,
        metric_json: {
          sentiment: 'negative',
          frequency_estimate: 22,
          trend_direction: 'declining',
          business_impact: 'Lost revenue at checkout.',
          root_cause_hypothesis: 'Too many payment fields.',
          is_new_theme: true,
          confirms_prior: false,
        },
        citations_json: [
          { quote: 'The payment page is awful', sentiment: 'negative', response_id: 'r1' },
        ],
        recommended_action: { label: 'Streamline payment form', time_horizon: 'short_term', priority: 'high' },
      }],
    });
    expect(html).toContain('Checkout abandonment rising');
    expect(html).toContain('Users drop off at payment step.');
    expect(html).toContain('New finding');
    expect(html).toContain('↓ Declining');
    expect(html).toContain('22 mentions');
    expect(html).toContain('The payment page is awful');
    expect(html).toContain('Lost revenue at checkout.');
    expect(html).toContain('Too many payment fields.');
    expect(html).toContain('Streamline payment form');
  });

  it('renders priority actions table with priority badge and horizon', () => {
    const html = buildReportHtml({
      ...data,
      insights: [{
        category: 'report.priority_action',
        headline: 'Fix login bugs immediately',
        narrative: 'Auth errors block 12% of users.',
        priority: 90,
        trust_score: 88,
        metric_json: null,
        citations_json: [],
        recommended_action: { label: 'Patch auth service', time_horizon: 'immediate', priority: 'critical' },
      }],
    });
    expect(html).toContain('Priority Actions');
    expect(html).toContain('Fix login bugs immediately');
    expect(html).toContain('priority-critical');
    expect(html).toContain('critical');
    expect(html).toContain('immediate');
  });

  it('escapes XSS in insight narrative', () => {
    const html = buildReportHtml({
      ...data,
      insights: [{
        category: 'report.executive_summary',
        headline: '<img onerror=alert(1)>',
        narrative: '<script>alert("xss")</script>',
        priority: 100,
        trust_score: 80,
        metric_json: null,
        citations_json: [],
        recommended_action: null,
      }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
