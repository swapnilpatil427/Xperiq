// Native report exporters — PDF (puppeteer) and PPTX (pptxgenjs).
//
// Both libraries are heavy + deploy-provisioned (puppeteer ships Chromium), so they
// are loaded lazily and degrade gracefully to { available:false } when absent — the
// caller then falls back to the printable HTML report. The module loader is
// injectable so both paths are unit-testable without the native deps installed.
import { buildReportHtml, ReportData, ReportTopic } from './visualReport';

export type LoadFn = (name: string) => unknown;

function tryRequire(name: string): unknown {
  try { return require(name); } catch { return null; }
}

export { tryRequire };

export interface ExportUnavailable {
  available: false;
  reason: string;
}

export interface ExportAvailable {
  available: true;
  buffer: Buffer;
  contentType: string;
  ext: string;
}

export type ExportResult = ExportUnavailable | ExportAvailable;

interface ExporterDeps {
  load?: LoadFn;
}

/** Render the insight report to a PDF buffer via headless Chromium. */
export async function renderPdf(data: ReportData, deps: ExporterDeps = {}): Promise<ExportResult> {
  const load = deps.load || tryRequire;
  const puppeteer = load('puppeteer') as {
    launch: (opts: unknown) => Promise<{
      newPage: () => Promise<{
        setContent: (html: string, opts: unknown) => Promise<void>;
        pdf: (opts: unknown) => Promise<Buffer>;
      }>;
      close: () => Promise<void>;
    }>;
  } | null;
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
export async function renderPptx(data: ReportData, deps: ExporterDeps = {}): Promise<ExportResult> {
  const load = deps.load || tryRequire;
  const PptxGenJSCtor = load('pptxgenjs') as (new () => unknown) | null;
  if (!PptxGenJSCtor) return { available: false, reason: 'pptxgenjs_not_installed' };

  const { survey = {}, metrics = {}, topics = [], summary = '' } = data;
  const pptx = new PptxGenJSCtor() as Record<string, unknown>;
  pptx['author'] = 'Experient Crystal';
  pptx['title'] = (survey as { title?: string }).title || 'Insight Report';

  type Slide = Record<string, (...args: unknown[]) => unknown>;
  const addSlide = () => (pptx['addSlide'] as () => Slide)();

  // Title slide
  const title = addSlide();
  (title['background'] as unknown) = { color: 'FFFFFF' };
  (title['addText'] as (...args: unknown[]) => void)('Experient · Crystal Report', { x: 0.5, y: 0.4, fontSize: 14, color: '2A4BD9', bold: true });
  (title['addText'] as (...args: unknown[]) => void)((survey as { title?: string }).title || 'Insight Report', { x: 0.5, y: 1.2, fontSize: 32, bold: true, color: '1A1A1A' });
  (title['addText'] as (...args: unknown[]) => void)(`Generated ${new Date().toISOString().slice(0, 10)}`, { x: 0.5, y: 2.1, fontSize: 12, color: '888888' });
  if (summary) (title['addText'] as (...args: unknown[]) => void)(summary, { x: 0.5, y: 2.8, w: 9, fontSize: 14, color: '333333' });

  // Metrics slide
  const kpis = addSlide();
  (kpis['addText'] as (...args: unknown[]) => void)('Key metrics', { x: 0.5, y: 0.4, fontSize: 22, bold: true, color: '1A1A1A' });
  const metricsData = metrics as { nps?: unknown; csat?: unknown; responseCount?: unknown };
  const cells: [string, unknown][] = [
    ['NPS', metricsData.nps], ['CSAT', metricsData.csat], ['Responses', metricsData.responseCount],
  ];
  cells.forEach(([label, val], i) => {
    const x = 0.5 + i * 3.1;
    (kpis['addText'] as (...args: unknown[]) => void)(String(val == null ? '—' : val), { x, y: 1.5, w: 2.8, fontSize: 40, bold: true, color: '2A4BD9', align: 'center' });
    (kpis['addText'] as (...args: unknown[]) => void)(String(label), { x, y: 2.6, w: 2.8, fontSize: 13, color: '666666', align: 'center' });
  });

  // Topics slide
  const topicsSlide = addSlide();
  (topicsSlide['addText'] as (...args: unknown[]) => void)('Top topics', { x: 0.5, y: 0.4, fontSize: 22, bold: true, color: '1A1A1A' });
  const header = ['Topic', 'Sentiment', 'Volume'].map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: '2A4BD9' } }));
  const topicsList = topics as ReportTopic[];
  const rows = topicsList.length
    ? topicsList.map((t) => [String(t.name ?? ''), String(t.sentiment ?? '—'), String(t.volume ?? '—')])
    : [['No topics yet.', '', '']];
  (topicsSlide['addTable'] as (...args: unknown[]) => void)([header, ...rows], { x: 0.5, y: 1.2, w: 9, fontSize: 12, border: { type: 'solid', color: 'EEEEEE' } });

  const buffer = await (pptx['write'] as (opts: unknown) => Promise<Buffer>)({ outputType: 'nodebuffer' });
  return {
    available: true, buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx',
  };
}
