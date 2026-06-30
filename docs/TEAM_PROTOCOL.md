# Xperiq AI Team Protocol

> **Vision:** Every feature folder in `docs/` is owned by a team. That team is an AI crew — each member is a parallel agent, briefed on their role, working concurrently, producing quality deliverables. Claude orchestrates. The end state is a self-organizing AI engineering org that can ship, review, deploy, and debug Xperiq at enterprise scale with minimal human bottlenecks.

---

## 1. TEAM.md Format

Every feature/product folder under `docs/` that is ready for implementation **must** contain a `TEAM.md`. This file defines who builds what.

```markdown
# Team: <Feature Name>

## Mission
One sentence on what this team is building and why it matters to Xperiq.

## Members

### <Role> — <Handle>
**Owns:** <the exact deliverables this agent produces>
**Layer:** <frontend | backend | crystalos | infra | qa | docs>
**Skills:** <comma-separated expertise tags>
**Agent:** <claude | general-purpose> (optional, defaults to claude)

### <Role> — <Handle>
...

## Coordination
<Optional: any explicit handoff or sequencing rules between members, e.g. "Backend must finish migrations before Frontend wires the API calls">
```

### Example

```markdown
# Team: Prism Ingestion Pipeline

## Mission
Build the end-to-end data ingestion pipeline that pulls experience data from third-party platforms into Xperiq's Postgres schema with dry-run support and metric parity checks.

## Members

### Backend Engineer — Alex
**Owns:** Express endpoints, Postgres migrations, ingestion job scheduler, dry-run diff logic
**Layer:** backend
**Skills:** TypeScript, SQL, REST API design, pg, Redis job queues
**Agent:** claude

### CrystalOS Engineer — Priya
**Owns:** Python ingestion skill, LangGraph pipeline node, structured output contract, SKILL.md + EVALS.md
**Layer:** crystalos
**Skills:** Python, FastAPI, LangGraph, LLM prompt design, skill runtime

### Frontend Engineer — Jordan
**Owns:** Ingestion UI (trigger, progress, dry-run diff viewer, history table), API wiring, locales keys
**Layer:** frontend
**Skills:** React 19, TypeScript, Tailwind v4, Framer Motion, shadcn/UI, DataBus invalidation

### QA — Sam
**Owns:** Test plan, edge-case matrix, integration tests, regression checklist, launch readiness verdict
**Layer:** qa
**Skills:** Test strategy, SQL, API testing, risk analysis
```

---

## 2. Claude's Team Dispatch Protocol

When you ask Claude to **implement, build, or work on** anything in a `docs/` folder:

### Step A — Check for TEAM.md
Claude reads `docs/<feature-folder>/TEAM.md` before doing anything else.

### Step B — Team exists → Dispatch
Claude launches **one parallel agent per team member** (using the Agent tool with `run_in_background`). Each agent receives:
- Their role, owns, layer, and skills from TEAM.md
- The full design docs from the feature folder (DESIGN.md, ERD, specs)
- The relevant layer's CLAUDE.md for conventions
- A scoped instruction: only build what their `Owns:` section specifies

Agents run concurrently. Claude synthesizes results when all complete, flags conflicts, and surfaces a unified summary for the user to review.

### Step C — Team does NOT exist → Pause and ask
If no TEAM.md is found, Claude stops and prompts:

> "No TEAM.md found in `docs/<folder>/`. Before I implement, who should be on this team?
> Common roles for this type of feature: [suggested roles based on the design doc].
> Should I create a TEAM.md for you, or do you want to define the team?"

Claude may offer a suggested TEAM.md draft based on reading the design doc — user approves or edits before dispatch.

### Step D — Synthesis and handoff
After all agents finish:
1. Claude presents a **per-member summary** of what was built
2. Flags any **cross-layer dependencies** that need explicit wiring (e.g., a backend endpoint the frontend needs to call)
3. Notes any **open items** an agent couldn't resolve without user input
4. Asks: "Ready to review, or should any agent re-run with additional context?"

---

## 3. Role → Layer → Responsibility Mapping

| Role | Layer | Default Owns |
|---|---|---|
| Backend Engineer | backend | Migrations, Express routes, job queues, data layer |
| Frontend Engineer | frontend | React pages/components, API wiring, locales, DataBus |
| CrystalOS Engineer | crystalos | Skills, LangGraph pipelines, LLM prompts, SKILL.md, EVALS.md |
| Infra Engineer | infra/docker | Docker services, Fly.io config, CI/CD, env vars |
| QA Engineer | qa | Test plans, integration tests, edge-case matrix, launch checklist |
| Tech Lead / Architect | cross-layer | Architecture review, contract definitions, seam consistency |
| Product Manager | docs | Acceptance criteria, user stories, tracker updates |

---

## 4. Agent Briefing Template

When Claude dispatches an agent, it uses this briefing structure:

```
You are <Role> on the Xperiq team, implementing <Feature>.

YOUR SCOPE: <Owns section verbatim>
YOUR LAYER: <layer>

DESIGN CONTEXT:
<Contents of the feature's DESIGN.md>

LAYER CONVENTIONS:
<Contents of the layer's CLAUDE.md>

TASK: Build everything in your scope. Write production-quality code following
the conventions above. If you hit a blocker that requires another layer's output,
note it clearly and implement the interface/stub. Do not build outside your scope.

DELIVER: Working code changes + a brief summary of what you built and any open
items that need cross-layer coordination.
```

---

## 5. Growing the System (Roadmap)

The current protocol is **Phase 1 — Team-driven implementation**. Future phases:

| Phase | Capability |
|---|---|
| 1 (now) | TEAM.md → parallel agents per role → synthesized output |
| 2 | Agents file their own sub-tasks (TaskCreate); Claude tracks progress |
| 3 | Automated code review agent runs on every agent's output before synthesis |
| 4 | QA agent runs tests and blocks synthesis on failure |
| 5 | Infra agent deploys to staging; health-check agent validates |
| 6 | Root-cause agent triggered on prod incidents; patches routed back through the team |
| 7 | Teams self-organize: given a new feature spec, Claude drafts the TEAM.md, proposes roles, user approves, full pipeline runs |

---

## 6. File Convention

```
docs/
  <feature-folder>/
    DESIGN.md          # Architecture + spec (required before TEAM.md)
    TEAM.md            # Team definition (required before implementation)
    ERD.md             # Optional: entity-relationship diagram
    API.md             # Optional: endpoint contracts
    TRACKER.md         # Optional: per-feature task tracker
```
