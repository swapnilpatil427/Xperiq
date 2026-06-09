// Native report exporters — PDF (puppeteer) and PPTX (pptxgenjs).
//
// Both libraries are heavy + deploy-provisioned (puppeteer ships Chromium), so they
// are loaded lazily and degrade gracefully to { available:false } when absent — the
// caller then falls back to the printable HTML report. The module loader is
// injectable so both paths are unit-testable without the native deps installed.

const { buildReportHtml } = require('./visualReport');

function tryRequire(name) {
  try { return require(name); } catch { return null; }
}

/** Render the insight report to a PDF buffer via headless Chromium. */
async function renderPdf(data, deps = {}) {
  const load = deps.load || tryRequire;
  const puppeteer = load('puppeteer');
  if (!puppeteer) return { available: false, reason: 'puppeteer_not_installed' };

  const html = buildReportHtml(data);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
    return { available: true, buffer, contentType: 'application/pdf', ext: 'pdf' };
  } finally {
    await browser.close();
  }
}

/** Render the insight report to a PPTX (PowerPoint) buffer. */
async function renderPptx(data, deps = {}) {
  const load = deps.load || tryRequire;
  const PptxGenJS = load('pptxgenjs');
  if (!PptxGenJS) return { available: false, reason: 'pptxgenjs_not_installed' };

  const { survey = {}, metrics = {}, topics = [], summary = '' } = data;
  const pptx = new PptxGenJS();
  pptx.author = 'Experient Crystal';
  pptx.title = survey.title || 'Insight Report';

  // Title slide
  const title = pptx.addSlide();
  title.background = { color: 'FFFFFF' };
  title.addText('Experient · Crystal Report', { x: 0.5, y: 0.4, fontSize: 14, color: '2A4BD9', bold: true });
  title.addText(survey.title || 'Insight Report', { x: 0.5, y: 1.2, fontSize: 32, bold: true, color: '1A1A1A' });
  title.addText(`Generated ${new Date().toISOString().slice(0, 10)}`, { x: 0.5, y: 2.1, fontSize: 12, color: '888888' });
  if (summary) title.addText(summary, { x: 0.5, y: 2.8, w: 9, fontSize: 14, color: '333333' });

  // Metrics slide
  const kpis = pptx.addSlide();
  kpis.addText('Key metrics', { x: 0.5, y: 0.4, fontSize: 22, bold: true, color: '1A1A1A' });
  const cells = [
    ['NPS', metrics.nps], ['CSAT', metrics.csat], ['Responses', metrics.responseCount],
  ];
  cells.forEach(([label, val], i) => {
    const x = 0.5 + i * 3.1;
    kpis.addText(String(val == null ? '—' : val), { x, y: 1.5, w: 2.8, fontSize: 40, bold: true, color: '2A4BD9', align: 'center' });
    kpis.addText(String(label), { x, y: 2.6, w: 2.8, fontSize: 13, color: '666666', align: 'center' });
  });

  // Topics slide
  const topicsSlide = pptx.addSlide();
  topicsSlide.addText('Top topics', { x: 0.5, y: 0.4, fontSize: 22, bold: true, color: '1A1A1A' });
  const header = ['Topic', 'Sentiment', 'Volume'].map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: '2A4BD9' } }));
  const rows = topics.length
    ? topics.map((t) => [String(t.name ?? ''), String(t.sentiment ?? '—'), String(t.volume ?? '—')])
    : [['No topics yet.', '', '']];
  topicsSlide.addTable([header, ...rows], { x: 0.5, y: 1.2, w: 9, fontSize: 12, border: { type: 'solid', color: 'EEEEEE' } });

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return {
    available: true, buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx',
  };
}

module.exports = { renderPdf, renderPptx, tryRequire };
