const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface SupportDoc {
  id: string
  doc_key: string
  title: string
  summary: string
  content: string
  category: string
  tags: string[]
  status: 'live' | 'pending_review' | 'auto_approved' | 'draft'
  ai_draft: boolean
  ai_reviewed_at: string | null
  human_reviewed_at: string | null
  published_at: string | null
  updated_at: string
  sections?: DocSection[]
}

export interface DocSection {
  id: string
  doc_id: string
  heading: string
  content: string
  order_index: number
  anchor: string
}

export interface ChangelogEntry {
  id: string
  version: string
  title: string
  body: string
  type: 'feature' | 'fix' | 'improvement' | 'breaking'
  published_at: string
}

export interface KnownIssue {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  affected_features: string[]
  created_at: string
  resolved_at: string | null
}

export interface RoadmapItem {
  id: string
  title: string
  description: string
  status: 'planned' | 'in_progress' | 'shipped'
  quarter: string
  category: string
  votes?: number
}

export interface SystemStatus {
  status: 'operational' | 'degraded' | 'outage'
  message: string
  components: {
    name: string
    status: 'operational' | 'degraded' | 'outage'
  }[]
  updated_at: string
}

export interface SupportTicket {
  id: string
  subject: string
  body: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
}

// --- Raw DB shapes returned by the backend ---

interface RawSupportDoc {
  id: string
  key: string
  title: string
  content: string
  category: string
  pipeline_status: string
  published_at: string | null
  updated_at: string
  sections?: DocSection[]
}

interface RawChangelogChange {
  type: string
  title: string
  description: string
}

interface RawChangelogEntry {
  id: string
  version: string
  released_at: string
  summary: string | null
  changes: RawChangelogChange[] | null
  source_sha: string | null
  created_at: string
}

interface RawSystemStatus {
  status: 'operational' | 'degraded' | 'outage'
  components: {
    database: string
    redis: string
  }
  openIssues: number
  timestamp: string
}

interface RawRoadmapSection {
  title: string
  items: {
    text: string
    done: boolean
    priority: string | null
  }[]
}

// --- Normalizers ---

function normalizeDoc(raw: RawSupportDoc): SupportDoc {
  const summaryText = raw.content
    .replace(/^#+\s+.*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  const summary = summaryText.slice(0, 280)

  const status: SupportDoc['status'] = raw.pipeline_status === 'live' ? 'live' : 'auto_approved'

  return {
    id: raw.id,
    doc_key: raw.key,
    title: raw.title,
    summary,
    content: raw.content,
    category: raw.category,
    tags: [],
    status,
    ai_draft: false,
    ai_reviewed_at: null,
    human_reviewed_at: null,
    published_at: raw.published_at,
    updated_at: raw.updated_at,
    sections: raw.sections,
  }
}

function normalizeChangelogEntry(raw: RawChangelogEntry): ChangelogEntry {
  const changes = raw.changes || []

  const title = raw.summary || `v${raw.version}`

  const body =
    changes.length > 0
      ? changes.map((c) => `**${c.title}**: ${c.description}`).join('\n\n')
      : (raw.summary || '')

  const validTypes = new Set<ChangelogEntry['type']>(['feature', 'fix', 'improvement', 'breaking'])
  const rawType = changes[0]?.type as ChangelogEntry['type'] | undefined
  const type: ChangelogEntry['type'] =
    rawType && validTypes.has(rawType) ? rawType : 'feature'

  return {
    id: raw.id,
    version: raw.version,
    title,
    body,
    type,
    published_at: raw.released_at,
  }
}

function mapComponentStatus(s: string): 'operational' | 'degraded' | 'outage' {
  if (s === 'operational') return 'operational'
  if (s === 'degraded') return 'degraded'
  if (s === 'not_configured') return 'operational'
  return 'outage'
}

function normalizeSystemStatus(raw: RawSystemStatus): SystemStatus {
  const messageMap: Record<string, string> = {
    operational: 'All systems operational',
    degraded: 'Partial service degradation',
    outage: 'Service disruption in progress',
  }

  return {
    status: raw.status,
    message: messageMap[raw.status] ?? 'Unknown status',
    components: [
      { name: 'API & Backend', status: mapComponentStatus(raw.components.database) },
      { name: 'Database', status: mapComponentStatus(raw.components.database) },
      { name: 'Redis Cache', status: mapComponentStatus(raw.components.redis) },
      { name: 'Crystal AI', status: raw.status },
    ],
    updated_at: raw.timestamp,
  }
}

function normalizeRoadmapItem(
  item: RawRoadmapSection['items'][number],
  index: number,
  category: string,
): RoadmapItem {
  let status: RoadmapItem['status']
  if (item.done) {
    status = 'shipped'
  } else if (item.priority === 'P1') {
    status = 'in_progress'
  } else {
    status = 'planned'
  }

  return {
    id: String(index),
    title: item.text.trim().slice(0, 80),
    description: '',
    status,
    quarter: '',
    category,
  }
}

// --- Fetch helper ---

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `API error: ${res.status}`)
  }

  return res.json()
}

// Authenticated fetch — passes Clerk session token for protected endpoints.
// Must only be called from server components / Route Handlers.
export async function fetchAPIAuth<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `API error: ${res.status}`)
  }

  return res.json()
}

// --- Public API functions ---

export async function getDocs(category?: string): Promise<SupportDoc[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : ''
  const data = await fetchAPI<{ docs: RawSupportDoc[] }>(`/api/support/docs${params}`, {
    next: { revalidate: 3600, tags: ['support-docs'] },
  } as RequestInit)
  return data.docs.map(normalizeDoc)
}

export async function getDoc(key: string): Promise<SupportDoc> {
  const data = await fetchAPI<{ doc: RawSupportDoc }>(
    `/api/support/docs/${encodeURIComponent(key)}`,
    { next: { revalidate: 3600, tags: ['support-docs', `doc-${key}`] } } as RequestInit,
  )
  return normalizeDoc(data.doc)
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
  const data = await fetchAPI<{ entries: RawChangelogEntry[] }>('/api/support/changelog', {
    next: { revalidate: 3600, tags: ['support-changelog'] },
  } as RequestInit)
  return data.entries.map(normalizeChangelogEntry)
}

export async function getKnownIssues(): Promise<KnownIssue[]> {
  const data = await fetchAPI<{ issues: KnownIssue[] }>('/api/support/known-issues', {
    next: { revalidate: 3600, tags: ['support-issues'] },
  } as RequestInit)
  return data.issues
}

export async function getRoadmap(): Promise<RoadmapItem[]> {
  const data = await fetchAPI<{ sections: RawRoadmapSection[] }>('/api/support/roadmap', {
    next: { revalidate: 3600, tags: ['support-roadmap'] },
  } as RequestInit)
  const items: RoadmapItem[] = []
  let idx = 0
  for (const section of data.sections) {
    const category = section.title.replace(/^#+\s*/, '').split(/[:—]/)[0].trim()
    for (const item of section.items) {
      items.push(normalizeRoadmapItem(item, idx, category))
      idx++
    }
  }
  return items
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const raw = await fetchAPI<RawSystemStatus>('/api/support/status', {
    next: { revalidate: 60, tags: ['support-status'] },
  } as RequestInit)
  return normalizeSystemStatus(raw)
}

// Mutations and dynamic searches always bypass cache.

export async function createTicket(data: {
  name?: string
  email?: string
  subject: string
  body: string
  severity?: string
}): Promise<SupportTicket> {
  return fetchAPI<SupportTicket>('/api/support/contact', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(data),
  })
}

export async function submitFeedback(data: {
  doc_key: string
  type: 'helpful' | 'not_helpful' | 'outdated' | 'error'
  comment?: string
}): Promise<void> {
  await fetchAPI('/api/support/public-feedback', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(data),
  })
}

export async function searchDocs(query: string): Promise<SupportDoc[]> {
  const data = await fetchAPI<{ docs: RawSupportDoc[] }>(
    `/api/support/docs?q=${encodeURIComponent(query)}`,
    { cache: 'no-store' },
  )
  return data.docs.map(normalizeDoc)
}
