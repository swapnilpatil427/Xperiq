// Default connector catalog — used as the gallery fallback when the Prism service
// has not yet returned its registry (or is unreachable). Mirrors the UX spec §4.1
// (Survey & XM platforms / Reviews & public voice / Files). The live registry from
// GET /api/prism/connectors takes precedence when available.

import type { ConnectorMeta, ConnectorGroup, PrismAuthKind, Capability, LegalPostureBasis } from '../../types/prism';

interface CatalogEntry {
  platform: string;
  label: string;
  authKind: PrismAuthKind;
  capabilities: Capability[];
  group: ConnectorGroup;
  basis: LegalPostureBasis;
  /** UI-only: comma-separated accepted extensions for file_upload tiles. */
  accept?: string;
  /** UI-only: file_upload tiles that accept several files at once. */
  multiple?: boolean;
  /** UI-only: file_upload tiles that auto-detect format + platform per file. */
  autodetect?: boolean;
}

const RAW: CatalogEntry[] = [
  // Survey & XM platforms
  { platform: 'qualtrics',     label: 'Qualtrics',      authKind: 'api_key',         capabilities: ['survey_def', 'response', 'contact', 'distribution'], group: 'survey',  basis: 'first_party_owned' },
  { platform: 'medallia',      label: 'Medallia',       authKind: 'api_key',         capabilities: ['survey_def', 'response', 'topic'],                    group: 'survey',  basis: 'first_party_owned' },
  { platform: 'surveymonkey',  label: 'SurveyMonkey',   authKind: 'oauth2',          capabilities: ['survey_def', 'response'],                             group: 'survey',  basis: 'first_party_owned' },
  { platform: 'typeform',      label: 'Typeform',       authKind: 'oauth2',          capabilities: ['survey_def', 'response'],                             group: 'survey',  basis: 'first_party_owned' },
  { platform: 'google_forms',  label: 'Google Forms',   authKind: 'service_account', capabilities: ['survey_def', 'response'],                             group: 'survey',  basis: 'first_party_owned' },

  // Reviews & public voice
  { platform: 'google_business', label: 'Google Business', authKind: 'oauth2',  capabilities: ['review', 'continuous_sync'], group: 'reviews', basis: 'public_api_licensed' },
  { platform: 'yelp',            label: 'Yelp',            authKind: 'api_key', capabilities: ['review'],                    group: 'reviews', basis: 'public_api_licensed' },
  { platform: 'app_store',       label: 'App Store',       authKind: 'api_key', capabilities: ['review'],                    group: 'reviews', basis: 'public_api_licensed' },
  { platform: 'google_play',     label: 'Google Play',     authKind: 'service_account', capabilities: ['review'],            group: 'reviews', basis: 'public_api_licensed' },
  { platform: 'trustpilot',      label: 'Trustpilot',      authKind: 'api_key', capabilities: ['review'],                    group: 'reviews', basis: 'public_api_licensed' },

  // Files — single-format tiles only. Global auto-detect is the home uploader PANEL (above
  // the connector list), not a tile, so it doesn't appear here.
  { platform: 'csv',         label: 'CSV',              authKind: 'file_upload', capabilities: ['response'],               group: 'files', basis: 'first_party_owned', accept: '.csv' },
  { platform: 'spss',        label: 'SPSS .sav',        authKind: 'file_upload', capabilities: ['response'],               group: 'files', basis: 'first_party_owned', accept: '.sav' },
  { platform: 'qsf',         label: 'Qualtrics .qsf',   authKind: 'file_upload', capabilities: ['survey_def'],             group: 'files', basis: 'first_party_owned', accept: '.qsf' },
  { platform: 'json',        label: 'JSON',             authKind: 'file_upload', capabilities: ['response'],               group: 'files', basis: 'first_party_owned', accept: '.json' },
];

export const DEFAULT_CONNECTORS: ConnectorMeta[] = RAW.map((e) => ({
  platform: e.platform,
  label: e.label,
  authKind: e.authKind,
  capabilities: e.capabilities,
  group: e.group,
  accept: e.accept,
  multiple: e.multiple,
  autodetect: e.autodetect,
  legalPosture: {
    basis: e.basis,
    mayStoreContent: e.basis !== 'display_only',
    mayProcessWithAI: e.basis !== 'no_compliant_path',
    attributionRequired: e.group === 'reviews',
    requiresLicenseFlag: e.basis === 'public_api_licensed',
    notes: '',
  },
}));

export const GROUP_ORDER: ConnectorGroup[] = ['survey', 'reviews', 'files'];

/** Infer a UI group for a connector that arrived without one (live registry). */
export function inferGroup(meta: ConnectorMeta): ConnectorGroup {
  if (meta.group) return meta.group;
  if (meta.authKind === 'file_upload') return 'files';
  if (meta.capabilities.includes('review')) return 'reviews';
  return 'survey';
}

export function findConnector(platform: string, registry: ConnectorMeta[]): ConnectorMeta | undefined {
  return registry.find((c) => c.platform === platform) ?? DEFAULT_CONNECTORS.find((c) => c.platform === platform);
}

/** Map a file connector platform → its accepted extensions. Falls back for live
 *  registry entries that arrived without the UI-only `accept` field. */
/** Accepted extensions for the home global-import uploader panel (auto-detect, multi-file). */
export const GLOBAL_IMPORT_ACCEPT = '.csv,.sav,.json,.qsf,.xlsx';

const FILE_ACCEPT: Record<string, string> = {
  file_auto: '.csv,.sav,.json,.qsf,.xlsx',
  csv: '.csv',
  spss: '.sav',
  json: '.json',
  qsf: '.qsf',
};

/** Accepted extensions for a file_upload connector tile. */
export function acceptForConnector(meta: ConnectorMeta): string {
  return meta.accept ?? FILE_ACCEPT[meta.platform] ?? '.csv,.sav,.json,.qsf,.xlsx';
}

/** Whether a file_upload connector takes several files (global auto-detect). */
export function isMultiFileConnector(meta: ConnectorMeta): boolean {
  return meta.multiple ?? meta.platform === 'file_auto';
}
