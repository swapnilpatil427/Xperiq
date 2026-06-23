export type WidgetType =
  | 'kpi_nps' | 'kpi_csat' | 'kpi_responses' | 'kpi_active'
  | 'nps_trend' | 'response_volume' | 'nps_distribution'
  | 'topic_grid' | 'survey_health' | 'crystal_narrative'
  | 'recent_responses' | 'alert_feed';

export type WidgetColSpan = 3 | 4 | 6 | 8 | 12;
export type NpsSegment = 'all' | 'promoters' | 'passives' | 'detractors';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  colSpan: WidgetColSpan;
  config: Record<string, unknown>;
}

export interface DashboardFilters {
  dateRange: '7d' | '30d' | '90d' | '180d';
  surveyId: string | null;    // null = org-level aggregate
  tagId: string | null;       // null = all groups
  npsSegment?: NpsSegment;    // optional — 'all' or a specific tier
}

export interface SavedDashboardConfig {
  id?: string;
  name: string;
  widgets: WidgetConfig[];
  filters: DashboardFilters;
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'default-kpi-nps',    type: 'kpi_nps',           colSpan: 3,  config: {} },
  { id: 'default-kpi-csat',   type: 'kpi_csat',          colSpan: 3,  config: {} },
  { id: 'default-kpi-resp',   type: 'kpi_responses',     colSpan: 3,  config: {} },
  { id: 'default-kpi-active', type: 'kpi_active',        colSpan: 3,  config: {} },
  { id: 'default-nps-trend',  type: 'nps_trend',         colSpan: 8,  config: {} },
  { id: 'default-topic-grid', type: 'topic_grid',        colSpan: 4,  config: {} },
  { id: 'default-crystal',    type: 'crystal_narrative', colSpan: 12, config: {} },
];

export const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: '90d',
  surveyId: null,
  tagId: null,
  npsSegment: 'all',
};

export const DATE_RANGE_DAYS: Record<DashboardFilters['dateRange'], number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
};

export interface WidgetRegistryEntry {
  type: WidgetType;
  label: string;
  icon: string;
  description: string;
  defaultColSpan: WidgetColSpan;
  color: string;
  surveyRequired?: boolean;  // widget needs a surveyId filter to show data
}

export const WIDGET_REGISTRY: WidgetRegistryEntry[] = [
  { type: 'kpi_nps',           label: 'NPS Score',             icon: 'trending_up',           description: 'Net Promoter Score with period delta',                         defaultColSpan: 3,  color: '#6366f1' },
  { type: 'kpi_csat',          label: 'CSAT Score',            icon: 'sentiment_satisfied',   description: 'Customer Satisfaction score with period delta',                 defaultColSpan: 3,  color: '#10b981' },
  { type: 'kpi_responses',     label: 'Response Volume',       icon: 'bar_chart',             description: 'Total responses collected in the selected period',               defaultColSpan: 3,  color: '#f59e0b' },
  { type: 'kpi_active',        label: 'Active Surveys',        icon: 'assignment',            description: 'Number of currently active surveys',                            defaultColSpan: 3,  color: '#06b6d4' },
  { type: 'nps_trend',         label: 'NPS Trend',             icon: 'show_chart',            description: 'NPS over time with forecast line and anomaly markers',           defaultColSpan: 8,  color: '#6366f1' },
  { type: 'response_volume',   label: 'Response Volume Chart', icon: 'bar_chart_4_bars',      description: 'Daily response volume as a bar chart',                           defaultColSpan: 6,  color: '#f59e0b' },
  { type: 'nps_distribution',  label: 'NPS Distribution',      icon: 'donut_large',           description: 'Promoter, Passive and Detractor breakdown donut',                defaultColSpan: 4,  color: '#8b5cf6' },
  { type: 'topic_grid',        label: 'Top Topics',            icon: 'bubbles',               description: 'Top topics by urgency with NPS impact scores',                   defaultColSpan: 4,  color: '#10b981', surveyRequired: true },
  { type: 'survey_health',     label: 'Survey Health Matrix',  icon: 'health_and_safety',     description: 'Survey health overview with response rates',                     defaultColSpan: 12, color: '#ef4444' },
  { type: 'crystal_narrative', label: 'Crystal AI Brief',      icon: 'auto_awesome',          description: 'AI-generated narrative summary of your experience data',          defaultColSpan: 12, color: '#8b5cf6' },
  { type: 'recent_responses',  label: 'Recent Responses',      icon: 'forum',                 description: 'Latest responses with NPS score and sentiment — links to Data page', defaultColSpan: 6, color: '#06b6d4', surveyRequired: true },
  { type: 'alert_feed',        label: 'Active Alerts',         icon: 'notifications_active',  description: 'Recent anomalies and alerts that need attention',                 defaultColSpan: 6,  color: '#ef4444' },
];
