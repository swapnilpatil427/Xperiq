const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://support.xperiq.ai'

export function getArticleUrl(slug: string): string {
  return `${siteUrl}/guides/${slug}`
}

export function getCategoryUrl(category: string): string {
  return `${siteUrl}/guides?category=${encodeURIComponent(category)}`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateISO(dateString: string): string {
  return new Date(dateString).toISOString()
}

export const CATEGORIES = [
  { key: 'getting-started', label: 'Getting Started', icon: 'rocket_launch', color: 'secondary' },
  { key: 'ai-analysis', label: 'AI Analysis Engine', icon: 'model_training', color: 'primary' },
  { key: 'surveys', label: 'Surveys & Templates', icon: 'poll', color: 'tertiary' },
  { key: 'workflows', label: 'Workflows & Automation', icon: 'account_tree', color: 'primary' },
  { key: 'nps-automation', label: 'NPS Automation', icon: 'speed', color: 'tertiary' },
  { key: 'api-integrations', label: 'API & Integrations', icon: 'api', color: 'secondary' },
  { key: 'data-privacy', label: 'Data & Privacy', icon: 'security', color: 'primary' },
  { key: 'billing', label: 'Billing & Plans', icon: 'credit_card', color: 'secondary' },
  { key: 'troubleshooting', label: 'Troubleshooting', icon: 'build', color: 'error' },
]
