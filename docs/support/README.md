# Experient Support System
## Design Index — Enterprise-Scale, Zero-Human-Intervention

**Status:** Design Complete — Implementation Ready (Sprint 8)  
**Owner:** Product + Design + Engineering + CrystalOS  
**Target URL:** `support.experient.ai`  
**North Star:** Crystal Support Resolution Rate (CSRR) ≥ 85% within 6 months

---

## One-Sentence Summary

A fully automated, AI-first support system where Crystal answers every question, docs write themselves from code on every git push, and the roadmap updates live — no human touches a tier-1 ticket, ever.

---

## Design Documents

| Document | What it covers | Words |
|----------|---------------|-------|
| [DESIGN.md](./DESIGN.md) | 14-person war room: vivid bios, 7 debates with real disagreement, 7 design principles, 6 north star metrics. Start here. | ~7,600 |
| [WIREFRAMES.md](./WIREFRAMES.md) | 8 screen wireframes faithful to Experient's design system: desktop homepage, mobile, search results, doc page, Crystal support panel, roadmap, status page, Cmd+K extension | ~3,000+ |
| [COMPONENTS.md](./COMPONENTS.md) | 14 component specs: props interfaces, visual specs from design tokens, Framer Motion animation variants, responsive behavior, accessibility | ~3,000+ |
| [UX_FLOWS.md](./UX_FLOWS.md) | 8 user journeys: API developer, enterprise admin, CX analyst, AI-skeptic, PM checking roadmap, escalation path, doc feedback loop, mobile user | ~3,500+ |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical systems: 3 sub-systems, data flows, DB schema (5 tables + pgvector), API routes, deployment | ~2,000 |
| [CRYSTAL_SUPPORT.md](./CRYSTAL_SUPPORT.md) | `crystal-support` CrystalOS skill: intent classifier, 8 tools, SKILL.md spec, EVALS.md, escalation package format | ~2,500 |
| [CONTENT_ENGINE.md](./CONTENT_ENGINE.md) | Auto-doc pipeline: 5 source artifact types, 5 CI stages, `doc-writer` skill, freshness SLAs, stale detection | ~2,500 |
| [WHATS_COMING.md](./WHATS_COMING.md) | Live roadmap page design: JSON data model, TRACKER.md rendering, filtering, notify-on-ship | ~1,800 |
| [SITE_STRUCTURE.md](./SITE_STRUCTURE.md) | Full site map, homepage layout, doc page layout, status page, in-app panel, zero-human ops summary | ~2,500 |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | 4-sprint plan, complete SQL migration, TypeScript route stubs, full SKILL.md files, CI YAML, acceptance criteria, launch checklist | ~4,000+ |

---

## FigJam Architecture Diagrams

Five diagrams created in Figma (open to view/comment):

| Diagram | FigJam Link |
|---------|------------|
| Support System Architecture | https://www.figma.com/board/pDeP6JhufuwHZinnLbG0BU |
| Crystal Support — Intent Routing & Resolution Flow | https://www.figma.com/board/TV0G5tVCBgB8FKZSpmn0Gp |
| Content Engine Pipeline (Code → Docs) | https://www.figma.com/board/WMewVYhVf5a7u1OPlxXMhB |
| User Journeys & Entry Points | https://www.figma.com/board/NZ2map2WVpYi3IIgCnVGdh |
| Enterprise Scale Architecture | https://www.figma.com/board/khWu3oQgDyr9bOCh0yGnNX |

---

## The 7 Design Principles (from DESIGN.md)

| # | Principle | One Rule |
|---|-----------|---------|
| 1 | **Search and Crystal are one surface** | The search bar IS Crystal. No widget, no chatbot bubble. |
| 2 | **Provenance over disclaimer** | Every Crystal answer cites a source. No "AI may be wrong" banners. |
| 3 | **Docs earn trust by being right** | A wrong doc is worse than no doc. Auto-generated with quality gate ≥ 0.80. |
| 4 | **The roadmap is live data** | TRACKER.md renders on every push. No human curates it. |
| 5 | **Escalation is structured, not silent** | Crystal creates a ticket with full investigation context. No blank forms. |
| 6 | **Every failure is a signal** | Thumbs down → doc gap. Failed resolution → skill example. Loop always closes. |
| 7 | **Zero chrome on the critical path** | The fastest path to an answer has no marketing copy, no onboarding flow, no modals. |

---

## What Gets Built

### New CrystalOS Components
```
crystalos/skills/crystal-support/     ← SKILL.md + EVALS.md + EXAMPLES.md
crystalos/skills/doc-writer/           ← SKILL.md + EVALS.md
crystalos/lib/support_classifier.py   ← pre-turn intent classifier
```
New tools: `search_support_docs`, `get_doc_by_key`, `get_feature_status`,
`get_account_state`, `get_known_issues`, `get_system_status`,
`create_support_ticket`, `get_changelog_recent`

### New Backend Routes (12 total)
```
GET  /api/support/docs
GET  /api/support/docs/:key
GET  /api/support/changelog
GET  /api/support/known-issues
GET  /api/support/roadmap
GET  /api/support/status
GET  /api/support/account           ← authenticated
POST /api/support/tickets           ← authenticated
GET  /api/support/tickets           ← authenticated
POST /api/support/feedback          ← authenticated
POST /api/internal/support/refresh-doc
POST /api/internal/support/ingest-changelog
```

### New Database Tables (Postgres migration)
```sql
support_docs           -- pgvector(1536) embeddings + ISR source
support_changelog      -- git-log-derived release history
support_known_issues   -- active platform issues
support_tickets        -- Crystal escalation packages
support_doc_gaps       -- feedback-to-doc improvement queue
```

### New Support Site (Next.js App Router)
```
support.experient.ai/
├── /                        Homepage: Crystal unified search + quick nav
├── /search                  Search results (docs left, Crystal right)
├── /guides/*                Getting started + how-to articles
├── /api/*                   API reference (auto-generated)
├── /crystal/*               Crystal AI capabilities reference
├── /features/*              Feature docs with live status badges
├── /roadmap                 What's Coming (TRACKER.md live feed)
├── /status                  System health (Prometheus-backed)
└── /changelog               Release history (git-log-derived)
```

### App Changes
- `CrystalPanel.tsx`: support mode detection + amber mode pill
- New `SupportCommandPalette` component (Cmd+K extension)
- Error state components: "Ask Crystal for help" CTA

### CI/CD
```
.github/workflows/doc-refresh.yml
scripts/extract-routes.ts
scripts/extract-schemas.ts
crystalos/scripts/extract-skills.py
scripts/parse-tracker.py
scripts/bootstrap-docs.sh
```

---

## Sprint Plan (8 weeks)

| Sprint | Focus | Deliverable |
|--------|-------|-------------|
| S1 (Wk 1-2) | Foundation | DB migrations, backend scaffolding, skill stubs |
| S2 (Wk 3-4) | Content Engine | Full doc pipeline end-to-end, pgvector search, support site homepage |
| S3 (Wk 5-6) | Crystal Integration | crystal-support skill live, in-app mode, Cmd+K |
| S4 (Wk 7-8) | Polish + Enterprise | Roadmap page, status page, Algolia, escalation, launch |

---

## Key Metrics

| Metric | Launch | 6 Months | 12 Months |
|--------|--------|---------|-----------|
| CSRR (Crystal resolution rate) | 72% | 84% | 92% |
| TTFA p50 (time to first answer) | < 4s | < 3s | < 2s |
| DFL (doc freshness lag) | < 45 min | < 20 min | < 10 min |
| Doc coverage (routes + skills) | 60% | 85% | 95% |

---

## Team

Design by the 14-person war room documented in [DESIGN.md](./DESIGN.md):

**Design & UX:** Aria Nakamura (CDO), Marcus Kim (UX Research), Yuki Tanaka (Interaction Design), Dr. Amara Osei (AI UX)  
**Engineering:** Devon Clarke (Frontend Lead), Priya Shah (Frontend), Dev Patel (CrystalOS), Carlos Mendes (Architecture)  
**Product & CS:** Sarah Chen (VP Product, Chair), Tom Nakamura (Crystal PM), Marcus Rodriguez (Customer Success), Lisa Park (Doc Engineering)  
**AI Science:** Dr. Amira Hassan (AI Research Lead)  
**Customer Voice:** Jordan Webb (Enterprise CX, Fortune 500)
