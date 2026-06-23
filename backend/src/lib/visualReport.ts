// Visual insight report generator — self-contained printable HTML and data model
// used by both the PDF (pdfmake) and PPTX (pptxgenjs) exporters.

export interface ReportTopic {
  name: string;
  sentiment?: string | null;
  volume?: number | null;
}

export interface CitationEntry {
  quote?: string;
  sentiment?: string;
  response_id?: string;
}

export interface ReportInsight {
  category: string;
  headline: string;
  narrative?: string | null;
  priority?: number;
  trust_score?: number;
  metric_json?: Record<string, unknown> | null;
  citations_json?: CitationEntry[] | null;
  recommended_action?: {
    label?: string;
    time_horizon?: string;
    priority?: string;
    estimated_impact?: string;
  } | null;
}

export interface ReportMetrics {
  nps?: number | null;
  csat?: number | null;
  responseCount?: number | null;
}

export interface ReportData {
  survey?: { title?: string };
  metrics?: ReportMetrics;
  topics?: ReportTopic[];
  insights?: ReportInsight[];
  summary?: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function reliabilityLabel(trust?: number): { label: string; color: string; bg: string } {
  const t = trust ?? 0;
  if (t >= 80) return { label: 'Reliable',   color: '#059669', bg: '#ecfdf5' };
  if (t >= 60) return { label: 'Indicative', color: '#d97706', bg: '#fffbeb' };
  return               { label: 'Low signal', color: '#94a3b8', bg: '#f8fafc' };
}

const SENTIMENT_BORDER: Record<string, string> = {
  positive: '#16a34a', negative: '#dc2626', neutral: '#94a3b8', mixed: '#d97706',
};

/** Self-contained printable HTML report (also the base rendered by pdfmake). */
export function buildReportHtml(data: ReportData): string {
  const { survey = {}, metrics = {}, topics = [], insights = [], summary = '' } = data;

  const execSummary = insights.find(i => i.category === 'report.executive_summary');
  const priorityActions = insights.filter(i => i.category === 'report.priority_action')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const themes = insights.filter(i => i.category === 'report.full_theme')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const crossTheme = (execSummary?.metric_json as Record<string,unknown> | null | undefined)?.cross_theme_patterns as string | undefined;
  const execResponseCount = (execSummary?.metric_json as Record<string,unknown> | null | undefined)?.response_count as number | undefined;
  const execPriorUsed = (execSummary?.metric_json as Record<string,unknown> | null | undefined)?.prior_insights_used as number | undefined;

  const kpi = (label: string, val: unknown) =>
    `<div class="kpi"><div class="kpi-v">${val == null ? '—' : esc(val)}</div><div class="kpi-l">${esc(label)}</div></div>`;

  const topicRows = topics.length
    ? topics.map(t =>
        `<tr><td>${esc(t.name)}</td><td>${esc(t.sentiment || '—')}</td><td>${t.volume ?? '—'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">No topics yet.</td></tr>';

  const actionRows = priorityActions.length
    ? priorityActions.map(a => {
        const priority = a.recommended_action?.priority ?? 'medium';
        const horizon = (a.recommended_action?.time_horizon ?? '').replace('_', ' ');
        return `<tr>
          <td><span class="priority-badge priority-${esc(priority)}">${esc(priority)}</span></td>
          <td><strong>${esc(a.headline)}</strong>${a.narrative ? `<br><span class="muted-sm">${esc(a.narrative)}</span>` : ''}</td>
          <td>${esc(horizon)}</td>
        </tr>`;
      }).join('')
    : '';

  const themeCards = themes.length
    ? themes.map(th => {
        const m = th.metric_json as Record<string,unknown> | null | undefined;
        const sentiment = String(m?.sentiment ?? 'neutral');
        const trend = String(m?.trend_direction ?? '');
        const freq = Number(m?.frequency_estimate ?? 0);
        const bizImpact = String(m?.business_impact ?? '');
        const rootCause = String(m?.root_cause_hypothesis ?? '');
        const isNew = Boolean(m?.is_new_theme);
        const confirmsPrior = Boolean(m?.confirms_prior);
        const rel = reliabilityLabel(th.trust_score);
        const accentColor = SENTIMENT_BORDER[sentiment] ?? '#94a3b8';
        const citations = (th.citations_json ?? []).slice(0, 2);

        const trendBadge = trend === 'improving'
          ? `<span class="badge" style="background:#f0fdf4;color:#15803d">↑ Improving</span>`
          : trend === 'declining'
          ? `<span class="badge" style="background:#fff1f2;color:#b41340">↓ Declining</span>`
          : '';

        const citationHtml = citations.map(c => {
          const q = String(c.quote ?? '').slice(0, 200);
          const bdr = SENTIMENT_BORDER[String(c.sentiment ?? 'neutral')] ?? '#94a3b8';
          return `<div class="quote" style="border-left-color:${bdr}">&ldquo;${esc(q)}${(c.quote?.length ?? 0) > 200 ? '…' : ''}&rdquo;</div>`;
        }).join('');

        const expandedDetails = (bizImpact || rootCause) ? `
          <div class="details-row">
            ${bizImpact ? `<div><span class="detail-label">Business impact</span><p class="detail-text">${esc(bizImpact)}</p></div>` : ''}
            ${rootCause ? `<div><span class="detail-label">Root cause</span><p class="detail-text">${esc(rootCause)}</p></div>` : ''}
          </div>` : '';

        return `
        <div class="theme-card" style="border-top:3px solid ${accentColor}">
          <div class="theme-badges">
            ${isNew ? `<span class="badge" style="background:#f0fdf4;color:#15803d">New finding</span>` : ''}
            ${confirmsPrior ? `<span class="badge" style="background:#eff6ff;color:#1d4ed8">Confirmed ↑</span>` : ''}
            ${trendBadge}
            <span class="badge" style="background:${rel.bg};color:${rel.color}">${esc(rel.label)}</span>
          </div>
          <div class="theme-headline">${esc(th.headline)}</div>
          ${freq > 0 ? `<p class="freq-line">${freq} mention${freq !== 1 ? 's' : ''} · ${esc(sentiment)} sentiment</p>` : ''}
          ${th.narrative ? `<p class="theme-narrative">${esc(th.narrative)}</p>` : ''}
          ${citationHtml}
          ${expandedDetails}
          ${th.recommended_action?.label ? `<div class="theme-action">💡 ${esc(th.recommended_action.label)}${th.recommended_action.time_horizon ? ` <span class="horizon-chip">${esc(th.recommended_action.time_horizon.replace('_',' '))}</span>` : ''}</div>` : ''}
        </div>`;
      }).join('')
    : '<p class="muted">No themes extracted yet.</p>';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(survey.title || 'Insight Report')} — Experient</title>
<style>
  *{box-sizing:border-box} body{font-family:Inter,system-ui,sans-serif;color:#1a1a1a;margin:0;padding:40px;background:#fff;max-width:900px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .mark{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#2a4bd9,#8329c8);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
  h1{font-size:26px;margin:4px 0;font-weight:800}
  h2{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:32px 0 12px}
  .sub{color:#666;font-size:13px;margin-bottom:24px}
  .exec-box{background:#f5f7f9;border:1px solid rgba(42,75,217,0.15);border-radius:10px;padding:18px 22px;margin-bottom:8px}
  .exec-meta{font-size:11px;color:#888;margin-bottom:8px}
  .exec-narrative{line-height:1.75;font-size:15px;font-weight:500;color:#1a1a1a}
  .cross-theme{margin-top:14px;padding-top:14px;border-top:1px solid #eee}
  .cross-theme-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#888;display:block;margin-bottom:4px}
  .cross-theme-text{font-size:13px;color:#333;line-height:1.6}
  .kpis{display:flex;gap:16px;margin-bottom:28px}
  .kpi{flex:1;background:#f5f7f9;border-radius:12px;padding:18px;text-align:center}
  .kpi-v{font-size:34px;font-weight:800;color:#2a4bd9} .kpi-l{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top}
  th{font-size:10px;text-transform:uppercase;color:#888;letter-spacing:.05em;background:#fafafa}
  .muted{color:#999;text-align:center} .muted-sm{color:#888;font-size:12px}
  .priority-badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px;letter-spacing:.05em}
  .priority-critical{background:#fff1f2;color:#b41340}
  .priority-high{background:#fffbeb;color:#d97706}
  .priority-medium{background:#eef2ff;color:#2a4bd9}
  .priority-low{background:#f8fafc;color:#64748b}
  .theme-card{border:1px solid #e8ecf4;border-radius:10px;padding:16px 18px;margin-bottom:14px;overflow:hidden}
  .theme-badges{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px}
  .badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.04em}
  .theme-headline{font-weight:700;font-size:14px;margin-bottom:4px;color:#1a1a1a}
  .freq-line{font-size:11px;color:#888;margin:0 0 8px}
  .theme-narrative{font-size:13px;color:#444;line-height:1.6;margin:0 0 10px}
  .quote{font-size:12px;font-style:italic;color:#333;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:0 6px 6px 0;padding:7px 10px;margin-bottom:5px;line-height:1.5}
  .details-row{margin:10px 0;padding:10px 0;border-top:1px solid #f0f0f0;display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .detail-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#888;display:block;margin-bottom:2px}
  .detail-text{font-size:11px;color:#444;margin:0}
  .theme-action{font-size:12px;color:#2a4bd9;background:#eef2ff;border-radius:6px;padding:6px 10px;margin-top:10px;display:flex;align-items:center;gap:6px}
  .horizon-chip{font-size:9px;font-weight:700;background:#fff;border-radius:4px;padding:1px 5px;color:#2a4bd9;margin-left:auto}
  .foot{margin-top:40px;padding-top:16px;border-top:1px solid #eee;color:#aaa;font-size:11px}
  @media print{body{padding:24px}.kpi-v{font-size:28px}.details-row{grid-template-columns:1fr}}
</style></head><body>
  <div class="brand"><span class="mark">◆</span><strong>Experient · Crystal Report</strong></div>
  <h1>${esc(survey.title || 'Insight Report')}</h1>
  <div class="sub">Generated ${esc(new Date().toISOString().slice(0, 10))}</div>

  <div class="kpis">
    ${kpi('NPS', metrics.nps)}
    ${kpi('CSAT', metrics.csat)}
    ${kpi('Responses', metrics.responseCount)}
  </div>

  ${execSummary ? `
  <h2>Executive Summary</h2>
  <div class="exec-box">
    <div class="exec-meta">${execResponseCount != null ? `${execResponseCount.toLocaleString()} responses` : ''}${execPriorUsed ? ` · ${execPriorUsed} prior findings referenced` : ''}</div>
    <p class="exec-narrative">${esc(execSummary.narrative || execSummary.headline)}</p>
    ${crossTheme ? `<div class="cross-theme"><span class="cross-theme-label">Cross-theme patterns</span><p class="cross-theme-text">${esc(crossTheme)}</p></div>` : ''}
  </div>
  ` : summary ? `<div class="exec-box"><p class="exec-narrative">${esc(summary)}</p></div>` : ''}

  ${priorityActions.length ? `
  <h2>Priority Actions</h2>
  <table><thead><tr><th>Priority</th><th>Action</th><th>Horizon</th></tr></thead>
  <tbody>${actionRows}</tbody></table>
  ` : ''}

  ${themes.length ? `
  <h2>${themes.length} Theme${themes.length !== 1 ? 's' : ''} <span style="font-size:11px;font-weight:400;color:#aaa;text-transform:none;letter-spacing:0">· mix of confirmed findings and new discoveries</span></h2>
  ${themeCards}
  ` : ''}

  ${topics.length ? `
  <h2>Top Topics</h2>
  <table><thead><tr><th>Topic</th><th>Sentiment</th><th>Volume</th></tr></thead>
  <tbody>${topicRows}</tbody></table>
  ` : ''}

  <div class="foot">Generated by Experient Crystal · AI-assisted · Cite verbatims before sharing externally</div>
</body></html>`;
}
