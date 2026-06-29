# Xperiq Brand Implementation Checklist

**Version 1.0 — June 2026**
**Purpose:** Track what has been done, what is in progress, and what requires manual action or external vendors.

---

## Legend
- ✅ Done — implemented in this session
- 🔧 Needs manual action — requires browser, vendor, or human steps
- 💰 Requires budget — needs a vendor, agency, or paid service
- 📅 Future — planned for a later milestone

---

## Code Rebrand — All Completed ✅

Every "Experient" string across all layers has been updated to "Xperiq".

| File | Change | Status |
|------|--------|--------|
| `app/src/locales/en.ts` | All 10 brand strings updated (name, tagline, footer, Crystal references, notifications, sentiment map, topic description, copilot labels) | ✅ |
| `app/index.html` | Page title: "Xperiq — Intelligence for Every Experience" | ✅ |
| `app/src/components/Logo.tsx` | aria-label, wordmark text, tagline text | ✅ |
| `app/src/lib/brandTheme.ts` | localStorage key: `xperiq_brand_theme`; comment updated | ✅ |
| `app/src/main.tsx` | Dev-mode console.warn message: `[Xperiq]` | ✅ |
| `app/src/components/ExperientCopilot.tsx` | Interface → `XperiqCopilotProps`; function → `XperiqCopilot`; greeting string updated | ✅ |
| `app/src/components/AppShell.tsx` | Comment referencing copilot component updated | ✅ |
| `app/src/pages/SurveyBuilderPage.tsx` | Import + JSX tag: `XperiqCopilot` | ✅ |
| `package.json` (root) | `"name": "xperiq"` | ✅ |
| `backend/package.json` | `"name": "xperiq-api"`, description updated | ✅ |
| `backend/src/lib/db.ts` | Default fallback DB URL: `.../xperiq` | ✅ |
| `backend/src/lib/agentsClient.ts` | JSDoc comment: "Xperiq Copilot Agents" | ✅ |
| `support/package.json` | `"name": "xperiq-support"` | ✅ |
| `support/next.config.mjs` | Remote image hostname + NEXT_PUBLIC_SITE_URL default → `xperiq.ai` | ✅ |
| `crystalos/main.py` | Module docstring updated | ✅ |
| `crystalos/lib/db.py` | Default fallback DB URL: `.../xperiq` | ✅ |
| `scripts/migrate.js` | Default fallback DB URL: `.../xperiq` | ✅ |
| `scripts/docker-compose.mjs` | `XPERIQ_DOCKER_PLATFORM` env var name | ✅ |
| `docker-compose.yml` | All container names, image names, POSTGRES_DB, DATABASE_URL defaults → `xperiq` | ✅ |
| `monitoring/prometheus.yml` | Job name: `xperiq-api` | ✅ |
| `monitoring/alertmanager.yml` | Example Slack channel: `#xperiq-alerts` | ✅ |
| `fly.toml` | App name: `xperiq-api` | ✅ |
| `supabase/migrations/20240101000000_initial.sql` | Comment header | ✅ |
| `supabase/migrations/20240514000000_agents.sql` | Comment header | ✅ |
| `supabase/migrations/20240516000000_insights.sql` | Comment header | ✅ |
| `docs/SURVEY_DATA_MODEL.md` | Heading updated | ✅ |
| `docs/ENV_VARS.md` | Description text updated | ✅ |
| `docs/TRACKER.md` | Heading updated | ✅ |
| `docs/PRODUCT_PLAN.md` | Heading updated | ✅ |
| `CLAUDE.md` (root) | Platform name + description updated | ✅ |
| `backend/CLAUDE.md` | Header updated | ✅ |
| `crystalos/CLAUDE.md` | Header updated | ✅ |

---

## Branding Documents — All Completed ✅

All documents created under `docs/branding/`.

| Document | Contents | Status |
|----------|----------|--------|
| `BRAND_GUIDE.md` | Name, pronunciation, colors, typography, voice, logo brief, Crystal sub-brand | ✅ |
| `BRAND_STRATEGY.md` | Purpose, mission, vision, 5 brand values, positioning statement, messaging hierarchy, photography style, naming conventions, brand health metrics | ✅ |
| `BRAND_GOVERNANCE.md` | Trademark filing plan, domain portfolio, social handle protection, approval process, co-branding rules, asset management, crisis playbook | ✅ |
| `ASSETS_CHECKLIST.md` | Every visual asset needed, prioritised by launch milestone | ✅ |
| `GO_TO_MARKET.md` | 90-day launch plan: Day 0 foundations → Day 30 → Day 60 → Day 90 | ✅ |
| `MARKETING_STRATEGY.md` | ICP, competitive positioning, 3 content pillars, channels, SEO, paid ads, email | ✅ |
| `SOCIAL_MEDIA_PLAYBOOK.md` | Platform-by-platform guide, handles to register, posting cadence, content calendar | ✅ |
| `SALES_PLAYBOOK.md` | 3 buyer personas, 5-step demo script, objection handling, HubSpot CRM setup | ✅ |
| `PR_COMMUNICATIONS.md` | 100-word boilerplate, press release template, 10 target publications, ProductHunt checklist | ✅ |
| `TEAM.md` | Brand management team, roles to hire, external partners, decision rights matrix | ✅ |
| `IMPLEMENTATION_CHECKLIST.md` | This file | ✅ |

---

## Figma Brand Board — Completed ✅

A FigJam board showing brand hierarchy, logo directions, color system, and Crystal sub-brand positioning has been generated.

| Item | Status | Link |
|------|--------|------|
| Figma brand concept board | ✅ Live | https://www.figma.com/board/7VXvj7rUHMGn0LA0AV99jZ |

---

## Must Complete Before Launch 🚨

These are blocking items — the product should not publicly launch without them.

### 1. Trademark Filing — File NOW ($1,500–$3,000) ⚠️ TIME-SENSITIVE
**Why it's blocking:** Once you launch publicly, anyone can file a conflicting trademark. The USPTO application date locks your priority — filing after launch means someone else can claim the name first. Do this before any press, ProductHunt, or public announcement.
- [ ] Choose your filing path:
  - **DIY via USPTO TEAS Plus** — $250/class at `teas.uspto.gov`. Slower but cheaper. Risk: errors cause abandonment.
  - **Attorney-assisted (recommended)** — $1,500–$2,500 total. Use LegalZoom, Clerky.com, or a startup IP attorney via Stripe Atlas.
- [ ] File "Xperiq" word mark — International Class **42** (SaaS / software services) + Class **35** (data analytics services)
- [ ] File "Crystal by Xperiq" word mark — Class 42
- [ ] Save your USPTO serial number once filed (proof of priority from that date)
- [ ] Set a calendar reminder for the 6-month Office Action response window
- **Timeline:** Filing to registration takes 8–18 months, but legal protection begins at filing date
- **Cost:** $250–$350 USPTO filing fee per class + optional attorney fee

### 2. Domain — Partially Done ✅ / Needs Completion 🔧

- [x] `xperiq.com` — **purchased** (parked, no site yet)
- [ ] `xperiq.ai` — primary product domain (buy at Cloudflare Registrar or Porkbun, ~$80–$120/year for .ai)
- [ ] Set up redirect: `xperiq.com` → `xperiq.ai` once .ai is purchased
- [ ] `getxperiq.com` — campaign fallback (~$10/year)
- [ ] `crystalbyxperiq.com` — Crystal sub-brand protection (~$10/year)
- **Where:** Cloudflare Registrar (`cloudflare.com/products/registrar`) or Porkbun (`porkbun.com`)

### Social Media Handle Registration (Do Today — 1 hour)
Register `@xperiq` on every platform. Even ones you won't use yet.
- [ ] LinkedIn Company Page: `linkedin.com/company/xperiq`
- [ ] X (Twitter): `x.com/xperiq`
- [ ] Instagram: `instagram.com/xperiq`
- [ ] YouTube: `youtube.com/@xperiq`
- [ ] TikTok: `tiktok.com/@xperiq`
- [ ] GitHub org: `github.com/xperiq`
- [ ] ProductHunt: claim page at `producthunt.com`
- [ ] G2: claim business profile at `g2.com`
- [ ] Capterra: claim profile at `capterra.com`
- [ ] Crunchbase: claim company profile at `crunchbase.com`

### Google Workspace Email (Do This Week)
- [ ] Set up `@xperiq.ai` business email via Google Workspace ($6/user/month)
- [ ] Create: `swapnil@xperiq.ai`, `hello@xperiq.ai`, `brand@xperiq.ai`, `press@xperiq.ai`

### Brand Monitoring (Do This Week — Free)
- [ ] Set up Google Alerts for "Xperiq" at `alerts.google.com`
- [ ] Set up Google Alerts for "Crystal by Xperiq"
- [ ] Set up Mention.com free account

---

## Requires Budget 💰

These require spending money. Prioritised by importance.

### Logo Design — Hire Immediately ($1,500–$5,000)
The app has a crystal facet SVG logo mark already coded. A designer needs to:
- [ ] Polish the existing crystal mark into a production-quality SVG
- [ ] Create the full wordmark: crystal mark + "Xperiq" in Manrope Bold
- [ ] Deliver all variants listed in `ASSETS_CHECKLIST.md`
- **Where to find designer:** Contra (`contra.com`), Dribbble (`dribbble.com/jobs`), or 99designs
- **Brief for designer:** `docs/branding/BRAND_GUIDE.md` + `docs/branding/ASSETS_CHECKLIST.md`

### Website (xperiq.ai) — Month 1 ($500–$3,000)
- [ ] Design and launch `xperiq.ai` marketing site
- [ ] Pages: Homepage, Pricing, About, Contact, Blog
- **Recommended tool:** Webflow (no-code, easy updates) or Next.js if team has frontend capacity
- **Cost:** Webflow $23/month; custom dev $1,500–$3,000 if outsourced

### HubSpot CRM Setup — This Week (Free to start)
- [ ] Create HubSpot free account at `app.hubspot.com`
- [ ] Set up pipeline stages (Lead → Qualified → Demo → Proposal → Closed Won/Lost)
- [ ] Import existing contacts/leads
- [ ] Connect to `@xperiq.ai` email

### Email Newsletter Platform — This Week (Free to start)
- [ ] Create Beehiiv account (`beehiiv.com`) — free up to 2,500 subscribers
- [ ] Set up "Xperiq Intelligence Weekly" newsletter
- [ ] Design newsletter header image (use Canva)

---

## Future Milestones 📅

Not urgent today, but planned.

### Month 1
- [ ] Hire Brand Designer (full-time or freelance)
- [ ] Launch `xperiq.ai` website
- [ ] Record first Crystal AI demo video (60 seconds)
- [ ] Post first LinkedIn content (founder personal account)
- [ ] Set up Buffer for social scheduling

### Month 2
- [ ] Run first Google Ads campaign ($500 test budget)
- [ ] Publish first 4 blog posts
- [ ] Send first email newsletter
- [ ] Book first 5 sales discovery calls

### Month 3
- [ ] Plan ProductHunt launch (target Month 2–3)
- [ ] Draft first 3 customer case studies
- [ ] Apply to G2 for listing + ask first customers for reviews
- [ ] Consider PR agency for ProductHunt launch support

### Month 4–6
- [ ] Hire Head of Marketing
- [ ] Launch LinkedIn Ads campaign
- [ ] Submit award applications (G2, SaaS awards, CX Today)
- [ ] First press release + media outreach

### Year 1
- [ ] Consider brand refresh / logo evolution (not rebrand — just maturation)
- [ ] Commission professional photography shoot
- [ ] Launch brand ambassador program for early customers
- [ ] Consider WIPO international trademark filing

---

## Not Changed (Internal Code Names Preserved)

These deliberately kept their original names — they are internal technical identifiers, not user-visible brand strings.

| Item | Why kept |
|------|---------|
| `crystalos/` directory name | CrystalOS is the internal tech name for the Python agents service |
| Database table names (`surveys`, `insights`, etc.) | Schema migration would require downtime |
| API route paths (`/api/surveys`, etc.) | Breaking change for any existing integrations |
| Environment variable names (e.g. `DATABASE_URL`, `AGENTS_URL`) | Changing env var names would break all deployments |
| Git history and commit messages | Immutable |

---

## Verification Commands

Run these after pulling the latest changes to confirm the rebrand is clean:

```bash
# Should return 0 results — all user-visible brand strings
grep -r "Experient" app/src/locales/
grep -r "Experient" app/src/components/Logo.tsx
grep "Experient" app/index.html

# Confirm new brand is in place
grep "Xperiq" app/src/locales/en.ts | head -10
grep "Xperiq" app/index.html
```

---

*Last updated: June 2026. Update this file as items are completed.*
