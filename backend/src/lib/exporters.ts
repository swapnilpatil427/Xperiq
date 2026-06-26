// Native report exporters — PDF (pdfmake, pure JS) and PPTX (pptxgenjs, pure JS).
// No native binaries needed — both work in any Node.js environment.
import { ReportData, ReportTopic, CitationEntry } from './visualReport';

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

/** Render the insight report to a PDF buffer via pdfmake (pure JS — no Chromium). */
export async function renderPdf(data: ReportData, deps: ExporterDeps = {}): Promise<ExportResult> {
  const load = deps.load || tryRequire;

  // pdfmake 0.3.x — singleton instance; vfs fonts are base64 strings that must be
  // decoded to Buffers and injected into virtualfs.storage before first use.
  const pdfmake = load('pdfmake') as {
    virtualfs: { storage: Record<string, Buffer> };
    addFonts: (f: Record<string, unknown>) => void;
    setLocalAccessPolicy: (fn: () => boolean) => void;
    setUrlAccessPolicy: (fn: () => boolean) => void;
    createPdf: (docDef: unknown) => { getBuffer: () => Promise<Buffer> };
  } | null;
  const pdfFonts = load('pdfmake/build/vfs_fonts') as Record<string, string> | null;

  if (!pdfmake) return { available: false, reason: 'pdfmake_not_installed' };

  // Inject fonts only once (storage keys already present after first call).
  if (pdfFonts && !pdfmake.virtualfs.storage['Roboto-Regular.ttf']) {
    for (const [key, b64] of Object.entries(pdfFonts)) {
      pdfmake.virtualfs.storage[key] = Buffer.from(b64, 'base64');
    }
    pdfmake.addFonts({
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf',
      },
    });
    pdfmake.setLocalAccessPolicy(() => false);
    pdfmake.setUrlAccessPolicy(() => false);
  }

  const {
    survey = {}, metrics = {}, topics = [], insights = [], summary = '',
  } = data;

  const execSummary = insights.find(i => i.category === 'report.executive_summary');
  const priorityActions = insights
    .filter(i => i.category === 'report.priority_action')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const themes = insights
    .filter(i => i.category === 'report.full_theme')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const topicsList = topics as ReportTopic[];

  const blue = '#2A4BD9';

  const reliabilityLabel = (trust?: number): string => {
    const t = trust ?? 0;
    if (t >= 80) return 'Reliable';
    if (t >= 60) return 'Indicative';
    return 'Low signal';
  };

  const content: unknown[] = [
    // Header
    { text: 'Experient · Crystal Report', fontSize: 10, color: blue, bold: true, margin: [0, 0, 0, 4] },
    { text: String((survey as { title?: string }).title || 'Insight Report'), fontSize: 24, bold: true, margin: [0, 0, 0, 4] },
    { text: `Generated ${new Date().toISOString().slice(0, 10)}`, fontSize: 11, color: '#888888', margin: [0, 0, 0, 20] },

    // KPI row
    {
      columns: [
        { text: [{ text: String(metrics.nps ?? '—'), fontSize: 32, bold: true, color: blue }, '\nNPS'], alignment: 'center', margin: [0, 0, 8, 0] },
        { text: [{ text: String(metrics.csat ?? '—'), fontSize: 32, bold: true, color: blue }, '\nCSAT'], alignment: 'center', margin: [0, 0, 8, 0] },
        { text: [{ text: String(metrics.responseCount ?? '—'), fontSize: 32, bold: true, color: blue }, '\nResponses'], alignment: 'center' },
      ],
      margin: [0, 0, 0, 24],
    },
  ];

  // Executive summary
  const narrativeText = execSummary?.narrative || execSummary?.headline || summary;
  if (narrativeText) {
    const execMeta = execSummary?.metric_json as Record<string, unknown> | null | undefined;
    const responseCount = execMeta?.response_count as number | undefined;
    const priorUsed = execMeta?.prior_insights_used as number | undefined;
    const crossTheme = execMeta?.cross_theme_patterns as string | undefined;

    const metaLine = [
      responseCount != null ? `${responseCount.toLocaleString()} responses` : null,
      priorUsed ? `${priorUsed} prior findings referenced` : null,
    ].filter(Boolean).join(' · ');

    content.push(
      { text: 'Executive Summary', fontSize: 11, bold: true, color: '#555555', margin: [0, 0, 0, 4] },
      ...(metaLine ? [{ text: metaLine, fontSize: 10, color: '#888888', margin: [0, 0, 0, 6] }] : []),
      {
        text: narrativeText,
        fontSize: 12,
        lineHeight: 1.65,
        margin: [0, 0, 0, crossTheme ? 8 : 20],
      },
    );
    if (crossTheme) {
      content.push(
        { text: 'Cross-theme patterns', fontSize: 9, bold: true, color: '#888888', margin: [0, 0, 0, 4] },
        { text: crossTheme, fontSize: 11, color: '#333333', lineHeight: 1.6, margin: [0, 0, 0, 20] },
      );
    }
  }

  // Priority actions
  if (priorityActions.length) {
    content.push({ text: 'Priority Actions', fontSize: 11, bold: true, color: '#555555', margin: [0, 0, 0, 8] });
    content.push({
      table: {
        widths: [70, '*', 80],
        body: [
          [
            { text: 'Priority', style: 'tableHeader' },
            { text: 'Action', style: 'tableHeader' },
            { text: 'Horizon', style: 'tableHeader' },
          ],
          ...priorityActions.map(a => [
            { text: (a.recommended_action?.priority ?? 'medium').toUpperCase(), fontSize: 9, bold: true, color: blue },
            {
              stack: [
                { text: a.headline, bold: true, fontSize: 11 },
                ...(a.narrative ? [{ text: a.narrative, fontSize: 10, color: '#666666', margin: [0, 2, 0, 0] }] : []),
              ],
            },
            { text: (a.recommended_action?.time_horizon ?? '').replace('_', ' '), fontSize: 10, color: '#666666' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20],
    });
  }

  // Themes — rich cards matching UI: badges, freq, sentiment, citations, biz impact, root cause
  if (themes.length) {
    content.push({ text: `${themes.length} Theme${themes.length !== 1 ? 's' : ''}`, fontSize: 11, bold: true, color: '#555555', margin: [0, 0, 0, 8] });
    themes.forEach(th => {
      const m = th.metric_json as Record<string, unknown> | null | undefined;
      const sentiment = String(m?.sentiment ?? 'neutral');
      const trend = String(m?.trend_direction ?? '');
      const freq = Number(m?.frequency_estimate ?? 0);
      const bizImpact = String(m?.business_impact ?? '');
      const rootCause = String(m?.root_cause_hypothesis ?? '');
      const isNew = Boolean(m?.is_new_theme);
      const confirmsPrior = Boolean(m?.confirms_prior);
      const rel = reliabilityLabel(th.trust_score);
      const citations = ((th.citations_json ?? []) as CitationEntry[]).slice(0, 2);

      const badgeLine = [
        isNew ? 'New finding' : null,
        confirmsPrior ? 'Confirmed ↑' : null,
        trend === 'improving' ? '↑ Improving' : trend === 'declining' ? '↓ Declining' : null,
        rel,
      ].filter(Boolean).join('  ·  ');

      const themeBlock: unknown[] = [
        ...(badgeLine ? [{ text: badgeLine, fontSize: 9, color: '#888888', margin: [0, 0, 0, 3] }] : []),
        { text: th.headline, bold: true, fontSize: 12, margin: [0, 0, 0, 3] },
        ...(freq > 0 ? [{ text: `${freq} mention${freq !== 1 ? 's' : ''} · ${sentiment} sentiment`, fontSize: 10, color: '#888888', margin: [0, 0, 0, 5] }] : []),
        ...(th.narrative ? [{ text: th.narrative, fontSize: 11, color: '#444444', lineHeight: 1.5, margin: [0, 0, 0, 6] }] : []),
        // Citation quotes
        ...citations.map(c => ({
          text: `"${String(c.quote ?? '').slice(0, 180)}"`,
          fontSize: 10,
          italics: true,
          color: '#555555',
          background: '#F8FAFC',
          margin: [0, 0, 0, 4],
        })),
        // Business impact + root cause
        ...(bizImpact ? [
          { text: 'Business impact', fontSize: 9, bold: true, color: '#888888', margin: [0, 4, 0, 1] },
          { text: bizImpact, fontSize: 10, color: '#444444', margin: [0, 0, 0, 3] },
        ] : []),
        ...(rootCause ? [
          { text: 'Root cause', fontSize: 9, bold: true, color: '#888888', margin: [0, 3, 0, 1] },
          { text: rootCause, fontSize: 10, color: '#444444', margin: [0, 0, 0, 3] },
        ] : []),
        ...(th.recommended_action?.label ? [
          { text: `→ ${th.recommended_action.label}`, fontSize: 10, color: blue, margin: [0, 4, 0, 0] },
        ] : []),
      ];
      content.push({ stack: themeBlock, margin: [0, 0, 0, 14], unbreakable: true });
    });
    content.push({ text: '', margin: [0, 0, 0, 8] });
  }

  // Topics table
  if (topicsList.length) {
    content.push({ text: 'Top Topics', fontSize: 11, bold: true, color: '#555555', margin: [0, 0, 0, 8] });
    content.push({
      table: {
        widths: ['*', 100, 80],
        body: [
          [
            { text: 'Topic', style: 'tableHeader' },
            { text: 'Sentiment', style: 'tableHeader' },
            { text: 'Volume', style: 'tableHeader' },
          ],
          ...topicsList.map(t => [
            { text: String(t.name ?? ''), fontSize: 11 },
            { text: String(t.sentiment ?? '—'), fontSize: 11, color: '#666666' },
            { text: String(t.volume ?? '—'), fontSize: 11, color: '#666666' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20],
    });
  }

  // Footer
  content.push({
    text: 'Generated by Experient Crystal · AI-assisted · Cite verbatims before sharing externally',
    fontSize: 9, color: '#AAAAAA', margin: [0, 20, 0, 0],
  });

  const docDef = {
    content,
    styles: {
      tableHeader: { fontSize: 10, bold: true, color: '#888888', fillColor: '#FAFAFA' },
    },
    defaultStyle: {
      font: 'Roboto',
    },
    pageMargins: [40, 40, 40, 40],
    info: {
      title: String((survey as { title?: string }).title || 'Insight Report'),
      author: 'Experient Crystal',
    },
  };

  const buffer = await pdfmake.createPdf(docDef).getBuffer();

  return { available: true, buffer, contentType: 'application/pdf', ext: 'pdf' };
}

/** Render the insight report to a PPTX (PowerPoint) buffer. */
export async function renderPptx(data: ReportData, deps: ExporterDeps = {}): Promise<ExportResult> {
  const load = deps.load || tryRequire;
  const PptxGenJSCtor = load('pptxgenjs') as (new () => unknown) | null;
  if (!PptxGenJSCtor) return { available: false, reason: 'pptxgenjs_not_installed' };

  const { survey = {}, metrics = {}, topics = [], insights = [] } = data;
  const topicsList = topics as ReportTopic[];

  const execSummary = insights.find(i => i.category === 'report.executive_summary');
  const priorityActions = insights
    .filter(i => i.category === 'report.priority_action')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 6);
  const themes = insights
    .filter(i => i.category === 'report.full_theme')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 8);

  const pptx = new PptxGenJSCtor() as Record<string, unknown>;
  pptx['author'] = 'Experient Crystal';
  pptx['title'] = String((survey as { title?: string }).title || 'Insight Report');

  type Slide = Record<string, unknown>;
  const addSlide = () => (pptx['addSlide'] as () => Slide)();

  const reliabilityLabel = (trust?: number): string => {
    const t = trust ?? 0;
    if (t >= 80) return 'Reliable';
    if (t >= 60) return 'Indicative';
    return 'Low signal';
  };

  // ── Title + Executive Summary slide ──────────────────────────────────────
  const title = addSlide();
  title['background'] = { color: 'FFFFFF' };
  (title['addText'] as (...a: unknown[]) => void)('Experient · Crystal Report', { x: 0.5, y: 0.4, fontSize: 11, color: '2A4BD9', bold: true });
  (title['addText'] as (...a: unknown[]) => void)(String((survey as { title?: string }).title || 'Insight Report'), { x: 0.5, y: 0.85, w: 9, fontSize: 26, bold: true, color: '1A1A1A' });
  (title['addText'] as (...a: unknown[]) => void)(`Generated ${new Date().toISOString().slice(0, 10)}`, { x: 0.5, y: 1.65, fontSize: 10, color: '888888' });
  if (execSummary) {
    const execMeta = execSummary.metric_json as Record<string, unknown> | null | undefined;
    const respCount = execMeta?.response_count as number | undefined;
    const priorUsed = execMeta?.prior_insights_used as number | undefined;
    const metaLine = [
      respCount != null ? `${respCount.toLocaleString()} responses` : null,
      priorUsed ? `${priorUsed} prior findings referenced` : null,
    ].filter(Boolean).join(' · ');
    if (metaLine) {
      (title['addText'] as (...a: unknown[]) => void)(metaLine, { x: 0.5, y: 2.05, w: 9, fontSize: 9, color: '888888' });
    }
    const narrative = execSummary.narrative ?? '';
    const short = narrative.length > 350 ? narrative.slice(0, 350) + '…' : narrative;
    (title['addText'] as (...a: unknown[]) => void)(short, { x: 0.5, y: 2.35, w: 9, h: 2.2, fontSize: 12, color: '333333', wrap: true, lineSpacingMultiple: 1.4 });
    const crossTheme = execMeta?.cross_theme_patterns as string | undefined;
    if (crossTheme) {
      const ct = crossTheme.length > 220 ? crossTheme.slice(0, 220) + '…' : crossTheme;
      (title['addText'] as (...a: unknown[]) => void)('Cross-theme patterns', { x: 0.5, y: 4.6, w: 9, fontSize: 8, bold: true, color: '888888' });
      (title['addText'] as (...a: unknown[]) => void)(ct, { x: 0.5, y: 4.85, w: 9, h: 0.8, fontSize: 10, color: '555555', wrap: true });
    }
  }

  // ── Metrics slide ─────────────────────────────────────────────────────────
  const kpis = addSlide();
  (kpis['addText'] as (...a: unknown[]) => void)('Key Metrics', { x: 0.5, y: 0.4, fontSize: 22, bold: true, color: '1A1A1A' });
  const kpiDefs: [string, unknown][] = [
    ['NPS', metrics.nps], ['CSAT', metrics.csat], ['Responses', metrics.responseCount],
  ];
  kpiDefs.forEach(([label, val], i) => {
    const x = 0.5 + i * 3.1;
    (kpis['addText'] as (...a: unknown[]) => void)(String(val == null ? '—' : val), { x, y: 1.4, w: 2.8, fontSize: 42, bold: true, color: '2A4BD9', align: 'center' });
    (kpis['addText'] as (...a: unknown[]) => void)(String(label), { x, y: 2.7, w: 2.8, fontSize: 13, color: '666666', align: 'center' });
  });

  // ── Priority actions slide ────────────────────────────────────────────────
  if (priorityActions.length) {
    const actSlide = addSlide();
    (actSlide['addText'] as (...a: unknown[]) => void)('Priority Actions', { x: 0.5, y: 0.4, fontSize: 20, bold: true, color: '1A1A1A' });
    const header = ['Priority', 'Action', 'Horizon'].map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: '2A4BD9', fontSize: 10 } }));
    const rows = priorityActions.map(a => [
      { text: String(a.recommended_action?.priority ?? 'medium').toUpperCase(), options: { bold: true, fontSize: 10 } },
      {
        text: [
          { text: a.headline + '\n', options: { bold: true, fontSize: 10 } },
          ...(a.narrative ? [{ text: a.narrative.slice(0, 120), options: { fontSize: 9, color: '666666' } }] : []),
        ],
      },
      { text: String(a.recommended_action?.time_horizon ?? '').replace('_', ' '), options: { fontSize: 10, color: '666666' } },
    ]);
    (actSlide['addTable'] as (...a: unknown[]) => void)(
      [header, ...rows],
      { x: 0.5, y: 1.0, w: 9, border: { type: 'solid', color: 'EEEEEE' }, rowH: 0.55 }
    );
  }

  // ── Theme slides (1 per slide for richer content) ─────────────────────────
  themes.forEach((th, idx) => {
    const slide = addSlide();
    const m = th.metric_json as Record<string, unknown> | null | undefined;
    const sentiment = String(m?.sentiment ?? 'neutral');
    const trend = String(m?.trend_direction ?? '');
    const freq = Number(m?.frequency_estimate ?? 0);
    const bizImpact = String(m?.business_impact ?? '');
    const rootCause = String(m?.root_cause_hypothesis ?? '');
    const isNew = Boolean(m?.is_new_theme);
    const confirmsPrior = Boolean(m?.confirms_prior);
    const rel = reliabilityLabel(th.trust_score);
    const citations = ((th.citations_json ?? []) as CitationEntry[]).slice(0, 2);

    const badges = [
      isNew ? 'New finding' : null,
      confirmsPrior ? 'Confirmed ↑' : null,
      trend === 'improving' ? '↑ Improving' : trend === 'declining' ? '↓ Declining' : null,
      rel,
    ].filter(Boolean).join('  ·  ');

    (slide['addText'] as (...a: unknown[]) => void)(`Theme ${idx + 1} of ${themes.length}`, { x: 0.5, y: 0.3, fontSize: 9, color: '888888' });
    if (badges) {
      (slide['addText'] as (...a: unknown[]) => void)(badges, { x: 0.5, y: 0.55, w: 9, fontSize: 8, color: '888888' });
    }
    (slide['addText'] as (...a: unknown[]) => void)(th.headline, { x: 0.5, y: 0.82, w: 9, fontSize: 16, bold: true, color: '1A1A1A' });
    let y = 1.35;
    if (freq > 0) {
      (slide['addText'] as (...a: unknown[]) => void)(`${freq} mention${freq !== 1 ? 's' : ''} · ${sentiment} sentiment`, { x: 0.5, y, w: 9, fontSize: 9, color: '888888' });
      y += 0.3;
    }
    if (th.narrative) {
      const short = th.narrative.length > 260 ? th.narrative.slice(0, 260) + '…' : th.narrative;
      (slide['addText'] as (...a: unknown[]) => void)(short, { x: 0.5, y, w: 9, h: 1.1, fontSize: 11, color: '333333', wrap: true, lineSpacingMultiple: 1.35 });
      y += 1.2;
    }
    citations.forEach(c => {
      const q = String(c.quote ?? '').slice(0, 160);
      (slide['addText'] as (...a: unknown[]) => void)(`"${q}"`, { x: 0.5, y, w: 9, h: 0.45, fontSize: 9, color: '555555', italic: true, wrap: true });
      y += 0.5;
    });
    if (bizImpact) {
      (slide['addText'] as (...a: unknown[]) => void)('BUSINESS IMPACT', { x: 0.5, y, w: 4.2, fontSize: 8, bold: true, color: '888888' });
      (slide['addText'] as (...a: unknown[]) => void)(bizImpact.slice(0, 140), { x: 0.5, y: y + 0.22, w: 4.2, h: 0.4, fontSize: 9, color: '444444', wrap: true });
    }
    if (rootCause) {
      (slide['addText'] as (...a: unknown[]) => void)('ROOT CAUSE', { x: 4.9, y, w: 4.6, fontSize: 8, bold: true, color: '888888' });
      (slide['addText'] as (...a: unknown[]) => void)(rootCause.slice(0, 140), { x: 4.9, y: y + 0.22, w: 4.6, h: 0.4, fontSize: 9, color: '444444', wrap: true });
    }
    if (bizImpact || rootCause) { y += 0.75; }
    if (th.recommended_action?.label) {
      (slide['addText'] as (...a: unknown[]) => void)(`→ ${th.recommended_action.label}`, { x: 0.5, y: Math.max(y, 5.1), w: 8, fontSize: 10, color: '2A4BD9', italic: true });
    }
  });

  // ── Topics slide ─────────────────────────────────────────────────────────
  if (topicsList.length) {
    const topicsSlide = addSlide();
    (topicsSlide['addText'] as (...a: unknown[]) => void)('Top Topics', { x: 0.5, y: 0.4, fontSize: 20, bold: true, color: '1A1A1A' });
    const header = ['Topic', 'Sentiment', 'Volume'].map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: '2A4BD9', fontSize: 11 } }));
    const rows = topicsList.map(t => [String(t.name ?? ''), String(t.sentiment ?? '—'), String(t.volume ?? '—')]);
    (topicsSlide['addTable'] as (...a: unknown[]) => void)(
      [header, ...rows],
      { x: 0.5, y: 1.1, w: 9, fontSize: 11, border: { type: 'solid', color: 'EEEEEE' }, rowH: 0.4 }
    );
  }

  const buffer = await (pptx['write'] as (opts: unknown) => Promise<Buffer>)({ outputType: 'nodebuffer' });
  return {
    available: true, buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx',
  };
}
