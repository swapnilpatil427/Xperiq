// Survey category UI config — used for gallery filter tabs.
// Template data (questions, metrics, etc.) is served from the backend API.

export const SURVEY_CATEGORIES = [
  { id: 'all',         label: 'All Types',              shortLabel: 'All',         icon: 'grid_view',           color: '#2c2f31', bg: '#e5e9eb' },
  { id: 'cx',          label: 'Customer Experience',    shortLabel: 'CX',          icon: 'sentiment_satisfied', color: '#2a4bd9', bg: '#e0e7ff' },
  { id: 'ex',          label: 'Employee Experience',    shortLabel: 'EX',          icon: 'groups',              color: '#059669', bg: '#d1fae5' },
  { id: 'product',     label: 'Product',                shortLabel: 'Product',     icon: 'rocket_launch',       color: '#d97706', bg: '#fef3c7' },
  { id: 'financial',   label: 'Financial Services',     shortLabel: 'Financial',   icon: 'account_balance',     color: '#0891b2', bg: '#e0f7fa' },
  { id: 'retail',      label: 'Retail & E-Commerce',    shortLabel: 'Retail',      icon: 'shopping_bag',        color: '#f59e0b', bg: '#fef9c3' },
  { id: 'hospitality', label: 'Hospitality & Travel',   shortLabel: 'Hospitality', icon: 'hotel',               color: '#7c3aed', bg: '#f3e8ff' },
  { id: 'healthcare',  label: 'Healthcare',             shortLabel: 'Healthcare',  icon: 'health_and_safety',   color: '#b41340', bg: '#ffe0e6' },
  { id: 'education',   label: 'Education',              shortLabel: 'Education',   icon: 'school',              color: '#00647c', bg: '#f0fdfa' },
  { id: 'research',    label: 'Research',               shortLabel: 'Research',    icon: 'science',             color: '#8329c8', bg: '#f3e8ff' },
  { id: 'events',      label: 'Events & Training',      shortLabel: 'Events',      icon: 'event',               color: '#10b981', bg: '#d1fae5' },
  { id: 'nonprofit',   label: 'Non-Profit & Community', shortLabel: 'Non-Profit',  icon: 'volunteer_activism',  color: '#0f766e', bg: '#ccfbf1' },
  { id: 'operational', label: 'Operational',            shortLabel: 'Ops',         icon: 'settings',            color: '#595c5e', bg: '#e5e9eb' },
];

export const CATEGORY_MAP = Object.fromEntries(SURVEY_CATEGORIES.map((c) => [c.id, c]));
