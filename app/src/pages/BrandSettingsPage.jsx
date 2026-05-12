import { useState } from 'react';
import { OrganizationProfile } from '@clerk/react';
import { SideNav } from '../components/SideNav';
import { BottomNav } from '../components/BottomNav';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { useAppAuth } from '../lib/auth.jsx';

const DEMO_TEAM_MEMBERS = [
  {
    initials: 'EM',
    name: 'Elena Marquet',
    email: 'elena@insightsense.ai',
    role: 'Administrator',
    statusActive: true,
    bg: '#d299ff',
    color: '#4c007d',
  },
  {
    initials: 'JS',
    name: 'Julian Schmidt',
    email: 'julian.s@insightsense.ai',
    role: 'Data Scientist',
    statusActive: true,
    bg: '#879aff',
    color: '#00176b',
  },
  {
    initials: 'MB',
    name: 'Marcus Bell',
    email: 'm.bell@brand.com',
    role: 'Viewer',
    statusActive: false,
    bg: '#d9dde0',
    color: '#595c5e',
  },
];

export function BrandSettingsPage({ onNavigate, currentPage }) {
  const { t } = useTranslation();
  const { orgId } = useAppAuth();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const [activeTab, setActiveTab] = useState('General');
  const [brandName, setBrandName] = useState('InsightSense Global');

  const tabs = [
    { key: 'General',      label: t('settings.tabs.general') },
    { key: 'Organization', label: 'Organization' },
    { key: 'API Keys',     label: t('settings.tabs.apiKeys') },
  ];

  const quickActions = [
    { label: t('settings.quickActions.downloadKit'), icon: 'download' },
    { label: t('settings.quickActions.viewProfile'), icon: 'open_in_new' },
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <SideNav currentPage={ROUTES.SETTINGS} onNavigate={onNavigate} />
      <BottomNav currentPage={ROUTES.SETTINGS} onNavigate={onNavigate} />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopBar
          title={t('settings.pageTitle')}
          currentPage={ROUTES.SETTINGS}
          onNavigate={onNavigate}
        />

        <div className="pt-20 pb-12 px-8 max-w-7xl mx-auto w-full space-y-8">

          {/* Tabs */}
          <div className="flex gap-8 border-b" style={{ borderColor: 'rgba(171,173,175,0.15)' }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="font-bold pb-3 text-sm uppercase tracking-widest transition-colors font-headline"
                style={{
                  color: activeTab === tab.key ? '#2a4bd9' : '#595c5e',
                  borderBottom: activeTab === tab.key ? '2px solid #2a4bd9' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── General Tab ── */}
          {activeTab === 'General' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

              {/* Brand Identity */}
              <div
                className="lg:col-span-8 p-8 relative overflow-hidden bg-white rounded-2xl"
                style={{ boxShadow: '0 40px 60px -10px rgba(44,47,49,0.06)' }}
              >
                <div className="relative z-10 space-y-10">
                  <div>
                    <h3 className="text-xl font-bold mb-2 font-headline text-on-surface">
                      {t('settings.general.heading')}
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      {t('settings.general.description')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest mb-2 px-1 text-on-surface-variant">
                          {t('settings.general.brandNameLabel')}
                        </label>
                        <input
                          className="w-full px-4 py-4 font-medium outline-none transition-all bg-surface-container text-on-surface rounded-xl"
                          type="text"
                          value={brandName}
                          onChange={(e) => setBrandName(e.target.value)}
                          onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px #2a4bd9'; }}
                          onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest mb-2 px-1 text-on-surface-variant">
                          {t('settings.general.themeLabel')}
                        </label>
                        <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container">
                          <div
                            className="h-12 w-12 rounded-full cursor-pointer active:scale-90 transition-transform"
                            style={{ background: 'linear-gradient(135deg, #2a4bd9, #879aff, #d299ff)',
                              boxShadow: '0 8px 20px rgba(42,75,217,0.2)' }}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-bold font-headline text-on-surface">
                              {t('settings.general.themeName')}
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              {t('settings.general.themeDescription')}
                            </div>
                          </div>
                          <Icon name="palette" size={20} className="text-primary" />
                        </div>
                      </div>
                    </div>

                    {/* Logo Preview */}
                    <div
                      className="relative flex flex-col items-center justify-center p-8 rounded-xl border bg-surface-container-low"
                      style={{ borderColor: 'rgba(171,173,175,0.15)', perspective: '1000px' }}
                    >
                      <label className="absolute top-4 left-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                        {t('settings.general.logoLabel')}
                      </label>
                      <div
                        className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center cursor-pointer transition-transform duration-500 hover:[transform:rotateX(0deg)]"
                        style={{ boxShadow: '0 40px 60px -10px rgba(0,0,0,0.2)', transform: 'rotateX(5deg)' }}
                      >
                        <Icon name="token" fill={1} size={48} className="text-primary" />
                        <div
                          className="absolute -bottom-6 rounded-full"
                          style={{ width: 96, height: 16, background: 'rgba(44,47,49,0.05)', filter: 'blur(16px)' }}
                        />
                      </div>
                      <button className="mt-10 text-xs font-bold flex items-center gap-2 transition-opacity hover:opacity-80 text-primary font-headline">
                        <Icon name="upload" size={16} />
                        {t('settings.general.replaceAsset').toUpperCase()}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none"
                  style={{ background: 'rgba(42,75,217,0.05)', filter: 'blur(48px)' }} />
              </div>

              {/* Side Stats */}
              <div className="lg:col-span-4 space-y-8">
                <div
                  className="p-8 text-white rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #00647c, #00576c)',
                    boxShadow: '0 20px 40px -10px rgba(0,100,124,0.3)' }}
                >
                  <h4 className="font-bold text-lg mb-4 font-headline">
                    {t('settings.brandHealth.heading')}
                  </h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-sm opacity-80">{t('settings.brandHealth.consistencyScore')}</span>
                      <span className="text-2xl font-bold font-headline">94%</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
                      <div className="h-full rounded-full bg-white" style={{ width: '94%' }} />
                    </div>
                    <p className="text-xs opacity-70 leading-relaxed mt-4">
                      {t('settings.brandHealth.description', { count: 12 })}
                    </p>
                  </div>
                </div>

                <div className="p-6 space-y-4 rounded-xl bg-surface-container">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    {t('settings.quickActions.heading')}
                  </h4>
                  <div className="space-y-2">
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        className="w-full flex items-center justify-between p-3 rounded-xl transition-all hover:translate-x-1 bg-white"
                      >
                        <span className="text-sm font-semibold text-on-surface">{action.label}</span>
                        <Icon name={action.icon} size={16} className="text-primary" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Organization Tab ── */}
          {activeTab === 'Organization' && (
            <div className="space-y-6">
              {clerkKey && orgId ? (
                <div className="flex justify-center">
                  <OrganizationProfile
                    appearance={{
                      elements: {
                        rootBox: 'w-full max-w-4xl',
                        card: 'shadow-none border rounded-2xl',
                      },
                    }}
                  />
                </div>
              ) : clerkKey && !orgId ? (
                <div
                  className="text-center py-16 rounded-2xl"
                  style={{ border: '2px dashed rgba(42,75,217,0.15)', background: 'rgba(42,75,217,0.02)' }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'rgba(42,75,217,0.08)' }}
                  >
                    <Icon name="business" size={28} className="text-primary" />
                  </div>
                  <p className="text-base font-bold mb-2 text-on-surface">No organization selected</p>
                  <p className="text-sm mb-6 text-on-surface-variant">
                    Select a workspace from the onboarding screen to manage your organization.
                  </p>
                  <button
                    onClick={() => onNavigate(ROUTES.ONBOARDING)}
                    className="px-6 py-3 text-white font-bold text-sm bg-gradient-primary font-headline rounded-xl"
                    style={{ boxShadow: '0 10px 25px -5px rgba(42,75,217,0.35)' }}
                  >
                    Select Workspace
                  </button>
                </div>
              ) : (
                /* Demo mode: show static team table */
                <div
                  className="overflow-hidden bg-white rounded-2xl"
                  style={{ boxShadow: '0 40px 60px -10px rgba(44,47,49,0.06)' }}
                >
                  <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="text-xl font-bold font-headline text-on-surface">
                        {t('settings.team.heading')}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        {t('settings.team.description')}
                      </p>
                    </div>
                    <button
                      className="px-8 py-4 font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] text-white font-headline rounded-xl bg-primary"
                      style={{ boxShadow: '0 20px 40px -10px rgba(42,75,217,0.2)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#173dcd')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#2a4bd9')}
                    >
                      <Icon name="person_add" size={20} />
                      {t('settings.team.inviteButton')}
                    </button>
                  </div>

                  <div className="px-8 pb-8 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr style={{ borderBottom: '1px solid #dfe3e6' }}>
                          {[
                            t('settings.team.tableHeaders.user'),
                            t('settings.team.tableHeaders.role'),
                            t('settings.team.tableHeaders.status'),
                            t('settings.team.tableHeaders.actions'),
                          ].map((h, i) => (
                            <th
                              key={h}
                              className="py-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                              style={{ textAlign: i === 3 ? 'right' : 'left' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DEMO_TEAM_MEMBERS.map((member) => (
                          <tr
                            key={member.email}
                            className="transition-colors"
                            style={{ borderBottom: '1px solid #eef1f3' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(245,247,249,0.5)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td className="py-5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm"
                                  style={{ background: member.bg, color: member.color }}
                                >
                                  {member.initials}
                                </div>
                                <div>
                                  <div className="font-bold text-sm text-on-surface">{member.name}</div>
                                  <div className="text-xs text-on-surface-variant">{member.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-5">
                              <span className="text-sm font-medium text-on-surface">{member.role}</span>
                            </td>
                            <td className="py-5">
                              <div
                                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full w-fit"
                                style={{
                                  color: member.statusActive ? '#00647c' : '#595c5e',
                                  background: member.statusActive ? 'rgba(0,100,124,0.1)' : '#e5e9eb',
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: member.statusActive ? '#00647c' : 'rgba(89,92,94,0.4)' }}
                                />
                                {member.statusActive
                                  ? t('settings.team.statusActive')
                                  : t('settings.team.statusPending')}
                              </div>
                            </td>
                            <td className="py-5 text-right">
                              <button
                                className="p-2 transition-colors text-on-surface-variant"
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#2a4bd9')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#595c5e')}
                              >
                                <Icon name="more_vert" size={20} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── API Keys Tab ── */}
          {activeTab === 'API Keys' && (
            <div
              className="p-8 bg-white rounded-2xl"
              style={{ boxShadow: '0 40px 60px -10px rgba(44,47,49,0.06)' }}
            >
              <h3 className="text-xl font-bold mb-2 font-headline text-on-surface">API Keys</h3>
              <p className="text-sm mb-8 text-on-surface-variant">
                Use these keys to authenticate requests to the Experient API.
              </p>
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: 'rgba(42,75,217,0.04)', border: '1px solid rgba(42,75,217,0.12)' }}
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1 text-on-surface-variant">
                    Secret Key
                  </p>
                  <p className="font-mono text-sm text-on-surface">sk_live_••••••••••••••••••••••••••••••</p>
                </div>
                <button className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Icon name="visibility" size={14} />
                  Reveal
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
