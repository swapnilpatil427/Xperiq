# Automation Capability Registry — Extensibility Framework

**Version:** 1.0
**Date:** 2026-06-29
**Authors:** Priya Krishnamurthy (Platform Architect), Nina Reeves (Platform Engineering), Rohan Desai (UX)

---

## Why this document exists

Adding a new trigger type today requires touching **7 separate places** across 3 layers. Every expansion in `EXPANSION.md` adds new types — E6 alone adds 4 action types. Without a registry pattern, each addition is a 7-step manual process with no single place to verify completeness. This document defines the **Automation Capability Registry (ACR)** that reduces each addition to **1–2 files**.

---

## Design Goal

> Adding a new trigger, action, or CrystalOS signal should require touching **1–2 files** with the rest auto-discovered. Skipping the registry breaks discoverability, not functionality — so adoption is incremental.

---

## Current state (without ACR)

Adding `churn_risk_spike` trigger requires:

| # | Layer | File |
|---|-------|------|
| 1 | DB | New migration — add value to `CHECK` constraint |
| 2 | Backend types | `backend/src/types/workflow.ts` — add to `TriggerType` enum |
| 3 | Backend scheduler | New evaluator file `ChurnRiskSpikeEvaluator.ts` |
| 4 | Backend scheduler | `WorkflowScheduler.ts` — register the evaluator |
| 5 | Frontend | New config panel `ChurnRiskSpikeConfigPanel.tsx` |
| 6 | Frontend | `BuilderLeftPanel.tsx` — add to palette |
| 7 | Frontend locales | `en.ts` — add all display strings |

**Result:** 7 files, 3 layers, no single source of truth, easy to miss one.

---

## Target state (with ACR)

Adding `churn_risk_spike` requires:

| # | Layer | File |
|---|-------|------|
| 1 | Registry | `backend/src/registry/triggers/churnRiskSpike.trigger.ts` |
| 2 | Evaluator | `backend/src/scheduler/evaluators/ChurnRiskSpikeEvaluator.ts` |

The scheduler, frontend palette, variable system, and localization all auto-discover it.

---

## File layout

```
backend/src/registry/
  triggers/
    npsThreshold.trigger.ts
    responseCount.trigger.ts
    responseRateDrop.trigger.ts
    sentimentSpike.trigger.ts
    newThemeDetected.trigger.ts
    schedule.trigger.ts
    manual.trigger.ts
    surveyLifecycle.trigger.ts
    responseSubmitted.trigger.ts
    anomalyDetected.trigger.ts
    index.ts                        ← auto-imports all *.trigger.ts
  actions/
    sendEmail.action.ts
    slackNotification.action.ts
    webhook.action.ts
    createJiraTicket.action.ts
    createZendeskTicket.action.ts
    generateReport.action.ts
    pauseSurvey.action.ts
    closeSurvey.action.ts
    crystalAnalysis.action.ts
    notifyInApp.action.ts
    index.ts                        ← auto-imports all *.action.ts
  conditions/
    surveyField.condition.ts
    timeWindow.condition.ts
    responseCount.condition.ts
    index.ts
  types.ts                          ← TriggerDefinition, ActionDefinition, ConditionDefinition
  AutomationCapabilityRegistry.ts   ← assembles all three, exposes query API
```

---

## Type contracts

### TriggerDefinition

```typescript
// backend/src/registry/types.ts

export const TriggerGroup = {
  ALERTS:     'When something looks wrong',
  THRESHOLDS: 'When a number is reached',
  AI_SIGNALS: 'Crystal detects automatically',
  SCHEDULED:  'On a schedule',
  EVENTS:     'When something happens',
} as const;
export type TriggerGroup = typeof TriggerGroup[keyof typeof TriggerGroup];

export const ActionCategory = {
  NOTIFICATIONS: 'Notifications',
  INTEGRATIONS:  'Integrations',
  SURVEY_CONTROL:'Survey Control',
  AI:            'Crystal AI',
} as const;
export type ActionCategory = typeof ActionCategory[keyof typeof ActionCategory];

export interface OutputVariable {
  key: string;       // e.g. "trigger.nps_score"
  type: 'string' | 'number' | 'integer' | 'boolean' | 'date';
  example: string;
  label: string;
}

export interface TriggerDefinition {
  id: string;                     // e.g. "nps_threshold" — stable, used in DB
  displayName: string;            // e.g. "NPS Drop or Rise"
  group: TriggerGroup;
  icon: string;                   // lucide icon name
  color: string;                  // hex — card accent color
  description: string;            // tooltip text
  crystalSignal: boolean;         // true = Crystal-evaluated, badge shown
  minTier: 'starter' | 'growth' | 'enterprise';

  configSchema: JSONSchema7;      // drives DynamicConfigPanel for simple triggers,
                                  // or drives validation for custom-panel triggers
  outputVariables: OutputVariable[];  // variables downstream actions can reference

  evaluatorModule: string;        // relative path to evaluator class
  uiConfigPanel: string;          // panel name in frontend registry (or "DynamicConfigPanel")
  descriptionTemplate: string;    // used for live preview strip

  hysteresisConfig?: {
    enabled: boolean;
    bufferPoints: number;
    uiNote: string;
  };
}

export interface ActionDefinition {
  id: string;                     // e.g. "create_jira_ticket"
  displayName: string;
  category: ActionCategory;
  icon: string;
  color: string;
  minTier: 'starter' | 'growth' | 'enterprise';
  requiresIntegration?: string;   // e.g. "jira" — checked against org connections

  configSchema: JSONSchema7;
  outputVariables: OutputVariable[];  // what this action produces for subsequent steps

  executorModule: string;
  uiConfigPanel: string;
  descriptionTemplate: string;
}

export interface ConditionDefinition {
  id: string;
  displayName: string;
  icon: string;
  configSchema: JSONSchema7;
  evaluatorFn: string;
  descriptionTemplate: string;
}
```

### Example: npsThreshold.trigger.ts

```typescript
// backend/src/registry/triggers/npsThreshold.trigger.ts
import { TriggerDefinition, TriggerGroup } from '../types';

export const npsThresholdTrigger: TriggerDefinition = {
  id: 'nps_threshold',
  displayName: 'NPS Drop or Rise',
  group: TriggerGroup.ALERTS,
  icon: 'gauge',
  color: '#2563EB',
  description: 'Fires when rolling NPS crosses a threshold you set.',
  crystalSignal: false,
  minTier: 'starter',

  configSchema: {
    type: 'object',
    required: ['threshold', 'direction', 'window_hours'],
    properties: {
      threshold:    { type: 'number', minimum: -100, maximum: 100, title: 'Threshold' },
      direction:    { type: 'string', enum: ['below', 'above', 'crosses'], title: 'Direction' },
      window_hours: { type: 'number', enum: [1, 6, 12, 24, 48, 168], title: 'Rolling window' },
    }
  },

  outputVariables: [
    { key: 'trigger.nps_score',      type: 'number',  example: '27.4',  label: 'Current NPS' },
    { key: 'trigger.delta',          type: 'number',  example: '-4.2',  label: 'Change vs. prior period' },
    { key: 'trigger.response_count', type: 'integer', example: '412',   label: 'Response count in window' },
  ],

  evaluatorModule: '../scheduler/evaluators/NpsThresholdEvaluator',
  uiConfigPanel: 'NpsThresholdConfigPanel',
  descriptionTemplate: 'NPS {{direction}} {{threshold}} ({{window_hours}}h window)',

  hysteresisConfig: {
    enabled: true,
    bufferPoints: 5,
    uiNote: "Won't re-fire until NPS recovers by 5 points past the threshold.",
  },
};

export default npsThresholdTrigger;
```

### Example: createJiraTicket.action.ts

```typescript
// backend/src/registry/actions/createJiraTicket.action.ts
import { ActionDefinition, ActionCategory } from '../types';

export const createJiraTicketAction: ActionDefinition = {
  id: 'create_jira_ticket',
  displayName: 'Jira Ticket',
  category: ActionCategory.INTEGRATIONS,
  icon: 'task_alt',
  color: '#1D4ED8',
  minTier: 'growth',
  requiresIntegration: 'jira',

  configSchema: {
    type: 'object',
    required: ['integration_id', 'project_key', 'summary'],
    properties: {
      integration_id: { type: 'string', format: 'uuid', title: 'Integration' },
      project_key:    { type: 'string', title: 'Project key' },
      issue_type:     { type: 'string', default: 'Bug', title: 'Issue type' },
      summary:        { type: 'string', maxLength: 255, title: 'Summary' },
      description:    { type: 'string', title: 'Description' },
      priority:       {
        type: 'string',
        enum: ['Highest','High','Medium','Low','Lowest'],
        default: 'Medium',
        title: 'Priority'
      },
    }
  },

  outputVariables: [
    { key: 'jira_key', type: 'string', example: 'CX-47',  label: 'Jira ticket key' },
    { key: 'jira_url', type: 'string', example: 'https://…', label: 'Jira ticket URL' },
    { key: 'jira_id',  type: 'string', example: '10001',  label: 'Jira internal ID' },
  ],

  executorModule: '../queue/executors/CreateJiraTicketExecutor',
  uiConfigPanel:  'JiraActionConfigPanel',
  descriptionTemplate: '{{issue_type}} in {{project_key}} — {{summary}}',
};

export default createJiraTicketAction;
```

---

## Registry auto-loader (index.ts)

```typescript
// backend/src/registry/triggers/index.ts
// Glob import — drop a new *.trigger.ts in this directory and it auto-registers.
// No manual list. Requires tsconfig "moduleResolution": "bundler" or Vite/esbuild.

const modules = import.meta.glob('./*.trigger.ts', { eager: true });
export const triggerRegistry: TriggerDefinition[] = Object.values(modules)
  .map((mod: any) => mod.default ?? Object.values(mod)[0])
  .filter(Boolean);
```

For Node.js CommonJS environments (before ESM migration):
```typescript
// backend/src/registry/triggers/index.ts (CommonJS fallback)
import path from 'path';
import fs from 'fs';

const triggerFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.trigger.ts') || f.endsWith('.trigger.js'));
export const triggerRegistry: TriggerDefinition[] = triggerFiles
  .map(f => {
    const mod = require(path.join(__dirname, f));
    return mod.default ?? Object.values(mod)[0];
  })
  .filter(Boolean);
```

---

## AutomationCapabilityRegistry

```typescript
// backend/src/registry/AutomationCapabilityRegistry.ts
import { triggerRegistry } from './triggers';
import { actionRegistry } from './actions';
import { conditionRegistry } from './conditions';

export class AutomationCapabilityRegistry {
  static findTrigger(id: string): TriggerDefinition | undefined {
    return triggerRegistry.find(t => t.id === id);
  }

  static findAction(id: string): ActionDefinition | undefined {
    return actionRegistry.find(a => a.id === id);
  }

  static allTriggers(): TriggerDefinition[] { return triggerRegistry; }
  static allActions(): ActionDefinition[] { return actionRegistry; }
  static allConditions(): ConditionDefinition[] { return conditionRegistry; }

  static validateTriggerType(type: string): void {
    if (!this.findTrigger(type)) {
      throw new ValidationError(`Unknown trigger type: "${type}". Registered types: ${triggerRegistry.map(t => t.id).join(', ')}`);
    }
  }

  static validateActionType(type: string): void {
    if (!this.findAction(type)) {
      throw new ValidationError(`Unknown action type: "${type}". Registered types: ${actionRegistry.map(a => a.id).join(', ')}`);
    }
  }

  // Returns all variables available for step N in a workflow
  static availableVariables(triggerType: string, priorActionTypes: string[]): VariableGroup[] {
    const groups: VariableGroup[] = [];

    // Always-available survey context variables
    groups.push({ label: 'Survey', variables: SURVEY_VARIABLES });

    // Trigger-emitted variables
    const triggerDef = this.findTrigger(triggerType);
    if (triggerDef?.outputVariables.length) {
      groups.push({ label: 'Trigger', variables: triggerDef.outputVariables });
    }

    // Prior action output variables (step chaining)
    priorActionTypes.forEach((actionType, i) => {
      const actionDef = this.findAction(actionType);
      if (actionDef?.outputVariables.length) {
        groups.push({
          label: `Action ${i + 1} (${actionDef.displayName})`,
          variables: actionDef.outputVariables.map(v => ({
            ...v,
            key: `{{steps.${i + 1}.${v.key}}}`,
          })),
        });
      }
    });

    return groups;
  }
}
```

---

## DB Schema Change

Remove the hardcoded `CHECK` constraints from `workflows` table:

```sql
-- Migration: remove hardcoded type constraints (validation moves to application layer)
ALTER TABLE workflows
  DROP CONSTRAINT IF EXISTS workflows_trigger_type_check,
  DROP CONSTRAINT IF EXISTS workflow_actions_action_type_check;

-- Application layer in AutomationCapabilityRegistry.validateTriggerType()
-- handles validation — no DB constraint needed for a field that changes quarterly.
```

> **Cross-reference:** `docs/workflows/ARCHITECTURE.md` still shows these constraints in the original DDL — they are removed by this migration. A comment is added to the ARCHITECTURE.md DDL: `-- Constraint removed: see EXTENSIBILITY.md §DB Schema Change`.

**Safety tradeoff acknowledged:** Removing the DB CHECK constraint means an invalid type that bypasses the application layer (e.g., a direct DB write, a migration error) will not be caught at the DB level. The following guards remain:
1. `AutomationCapabilityRegistry.validateTriggerType()` throws `400 ValidationError` at the API boundary
2. `WorkflowScheduler.tick()` skips workflows with unknown trigger types gracefully (logs a warning, does not crash)
3. `ActionWorker.executeStep()` throws `500` for unknown action types, which BullMQ retries then sends to DLQ

For an additional lightweight DB guard without re-introducing a static CHECK, consider a `CREATE FUNCTION validate_trigger_type()` trigger that queries a `registered_trigger_types` table. This is optional but provides defense-in-depth if the team prefers it.

---

## Backend: Dynamic Executor + Evaluator Loading

### WorkflowScheduler

```typescript
// backend/src/scheduler/WorkflowScheduler.ts
import { AutomationCapabilityRegistry } from '../registry/AutomationCapabilityRegistry';

class WorkflowScheduler {
  private evaluators = new Map<string, TriggerEvaluator>();

  async init() {
    for (const def of AutomationCapabilityRegistry.allTriggers()) {
      if (!def.evaluatorModule) continue;
      const { default: EvaluatorClass } = await import(def.evaluatorModule);
      this.evaluators.set(def.id, new EvaluatorClass(this.db, this.redis));
    }
  }

  async tick() {
    const workflows = await this.db.query(
      `SELECT * FROM workflows WHERE status = 'enabled'`
    );
    for (const wf of workflows) {
      const evaluator = this.evaluators.get(wf.trigger_type);
      if (!evaluator) continue; // unknown type — skip gracefully, don't crash
      const result = await evaluator.evaluate(wf);
      if (result.shouldFire) await this.enqueue(wf, result.payload);
    }
  }
}
```

### ActionWorker

```typescript
// backend/src/queue/workers/actionWorker.ts
import { AutomationCapabilityRegistry } from '../../registry/AutomationCapabilityRegistry';

class ActionWorker {
  private executors = new Map<string, ActionExecutor>();

  async init() {
    for (const def of AutomationCapabilityRegistry.allActions()) {
      const { default: ExecutorClass } = await import(def.executorModule);
      this.executors.set(def.id, new ExecutorClass(this.integrationVault, this.db));
    }
  }

  async executeStep(step: WorkflowRunStep, context: WorkflowContext) {
    const executor = this.executors.get(step.action_type);
    if (!executor) throw new Error(`No executor registered for action type: ${step.action_type}`);
    return executor.execute(step.rendered_config, context);
  }
}
```

### Capabilities API endpoint

```typescript
// backend/src/routes/automations.ts
router.get('/api/automations/capabilities', requireAuth, async (req, res) => {
  const orgTier = req.auth.orgTier; // 'starter' | 'growth' | 'enterprise'

  res.json({
    triggers: AutomationCapabilityRegistry.allTriggers().map(t => ({
      ...t,
      available: tierMeets(orgTier, t.minTier),
      evaluatorModule: undefined, // strip internal field
    })),
    actions: AutomationCapabilityRegistry.allActions().map(a => ({
      ...a,
      available: tierMeets(orgTier, a.minTier) &&
        (!a.requiresIntegration || orgHasIntegration(req.auth.orgId, a.requiresIntegration)),
      executorModule: undefined,
    })),
    conditions: AutomationCapabilityRegistry.allConditions(),
  });
});

// Variable contract endpoint for VariableChipInput
router.get('/api/automations/:id/available-variables', requireAuth, async (req, res) => {
  const wf = await db.getWorkflow(req.params.id, req.auth.orgId);
  const priorActionTypes = req.query.priorActions?.split(',') ?? [];
  res.json({
    groups: AutomationCapabilityRegistry.availableVariables(wf.trigger_type, priorActionTypes),
  });
});
```

---

## Frontend: Registry-Driven Components

### CanvasPalette (driven by GET /api/automations/capabilities)

```tsx
// app/src/components/automations/builder/CanvasPalette.tsx
const { data: capabilities } = useQuery(['capabilities'], fetchCapabilities);

const groupedTriggers = useMemo(
  () => groupBy(capabilities?.triggers ?? [], t => t.group),
  [capabilities]
);

return (
  <div className="space-y-4">
    {Object.entries(groupedTriggers).map(([group, triggers]) => (
      <section key={group}>
        <TriggerGroupHeader label={group} />
        {triggers.map(t => (
          <PaletteItem
            key={t.id}
            icon={t.icon}
            label={t.displayName}
            badge={t.crystalSignal ? t('triggerGroups.crystalBadge') : undefined}
            disabled={!t.available}
            disabledTooltip={!t.available ? t('triggerGroups.tierGate') : undefined}
            onDrag={() => startDrag({ type: 'trigger', definitionId: t.id })}
          />
        ))}
      </section>
    ))}
  </div>
);
// New trigger added to registry → appears here automatically. No code change needed.
```

### Config panel registry

```typescript
// app/src/registry/configPanels.ts
// Custom panels for complex configs. Simple configs fall back to DynamicConfigPanel.
const CONFIG_PANEL_REGISTRY: Record<string, React.ComponentType<ConfigPanelProps>> = {
  'ScheduleConfigPanel':          lazy(() => import('../components/automations/builder/config/ScheduleConfigPanel')),
  'NpsThresholdConfigPanel':      lazy(() => import('../components/automations/builder/config/NpsThresholdConfigPanel')),
  'GenerateBriefingConfigPanel':  lazy(() => import('../components/automations/builder/config/GenerateBriefingConfigPanel')),
  'JiraActionConfigPanel':        lazy(() => import('../components/automations/builder/config/JiraActionConfigPanel')),
  'EmailActionConfigPanel':       lazy(() => import('../components/automations/builder/config/EmailActionConfigPanel')),
  'SlackActionConfigPanel':       lazy(() => import('../components/automations/builder/config/SlackActionConfigPanel')),
  // All others fall back to DynamicConfigPanel (schema-driven, no code needed)
};

export function getConfigPanel(panelId: string): React.ComponentType<ConfigPanelProps> {
  return CONFIG_PANEL_REGISTRY[panelId] ?? DynamicConfigPanel;
}
```

### DynamicConfigPanel (schema-driven fallback)

```tsx
// app/src/components/automations/builder/config/DynamicConfigPanel.tsx
// Renders a form from configSchema with no custom code.
// A new action with a simple configSchema needs zero frontend code.

export function DynamicConfigPanel({ definition, value, onChange }: ConfigPanelProps) {
  const { properties, required = [] } = definition.configSchema;

  return (
    <form className="space-y-4">
      {Object.entries(properties).map(([key, schema]) => (
        <DynamicField
          key={key}
          fieldKey={key}
          schema={schema as JSONSchema7}
          value={value[key]}
          required={required.includes(key)}
          onChange={v => onChange({ ...value, [key]: v })}
        />
      ))}
    </form>
  );
}

// DynamicField renders:
// type: string, no enum → Input
// type: string, enum present → Select
// type: number → Input type=number with min/max from schema
// type: boolean → Switch
// format: uuid → IntegrationPicker (org's connected integrations)
```

### VariableChipInput (fetches available variables from API)

```tsx
// app/src/components/automations/builder/VariableChipInput.tsx
function VariableChipInput({ automationId, stepIndex, ...props }) {
  const { data: variablesData } = useQuery(
    ['variables', automationId, stepIndex],
    () => fetchAvailableVariables(automationId, stepIndex),
    { enabled: !!automationId }
  );
  // groups come from the API, driven by the registry
  // new trigger/action outputVariables appear automatically
  return <VariablePicker groups={variablesData?.groups ?? []} {...props} />;
}
```

---

## CrystalOS: Signal Node Registry

```python
# crystalos/registry/skill_registry.py

from typing import Type, Callable
SIGNAL_EMITTERS: dict[str, Type['BaseSignalEmitter']] = {}
ACTION_GENERATORS: dict[str, Type['BaseActionGenerator']] = {}

def register_signal_emitter(signal_type: str):
    """Decorator — register a CrystalOS signal emitter by trigger type id."""
    def decorator(cls):
        SIGNAL_EMITTERS[signal_type] = cls
        return cls
    return decorator

def register_action_generator(action_type: str):
    """Decorator — register an AI-authored action content generator."""
    def decorator(cls):
        ACTION_GENERATORS[action_type] = cls
        return cls
    return decorator
```

```python
# crystalos/skills/signals/sentiment_spike.py
from crystalos.registry.skill_registry import register_signal_emitter
from crystalos.registry.base import BaseSignalEmitter, SignalResult

@register_signal_emitter('sentiment_spike')
class SentimentSpikeEmitter(BaseSignalEmitter):
    async def evaluate(self, survey_id: str, config: dict) -> SignalResult | None:
        # ... LangGraph node logic
        pass
```

```python
# crystalos/main.py — LangGraph graph assembled dynamically
from crystalos.registry.skill_registry import SIGNAL_EMITTERS

signal_graph = StateGraph(SignalState)
for signal_type, emitter_class in SIGNAL_EMITTERS.items():
    signal_graph.add_node(signal_type, emitter_class().evaluate)
    signal_graph.add_conditional_edges(...)
```

Adding a new Crystal Signal requires:
1. Create `crystalos/skills/signals/new_signal.py` with `@register_signal_emitter('new_signal_id')`
2. Create `backend/src/registry/triggers/newSignal.trigger.ts` with `crystalSignal: true`
3. LangGraph graph auto-includes the new node on next CrystalOS startup

---

## Expansion compatibility matrix

| Expansion | New registry files | Custom evaluator/executor | Custom config panel | CrystalOS |
|-----------|-------------------|--------------------------|---------------------|-----------|
| E1: Branching | `branch.condition.ts` | `BranchEvaluator` | `BranchConfigPanel` (custom) | New `parse_branch_conditions` node |
| E2: Multi-Survey | `compoundCondition.trigger.ts` | `CompoundTriggerEvaluator` | `CompoundTriggerPanel` (custom) | New `correlate_survey_signals` node |
| E3: AI-Authored Actions | `content_mode` field added to existing defs | — | Extend existing panels | New `generate_action_content` node |
| E4: Marketplace | No new types — packaging layer | — | No new panels | No new nodes |
| E5: Self-Healing | No new types — background monitor | — | `HealthInsightsPanel` | New `workflow_health_monitor` skill |
| E6: Compliance | 4 new `.action.ts` files | 4 new executors | `DynamicConfigPanel` (schema-driven, zero frontend code) | No new signal nodes |
| E7: Voice | No new types — new creation interface | — | No new panels | Extend Crystal Builder graph |

**E6 adds 4 action types with zero frontend code** — the `configSchema` in each definition is sufficient for `DynamicConfigPanel` to render forms automatically.

---

## What to build in Phase 1

Before writing any trigger or action implementations, the registry infrastructure must exist:

| Priority | Item | Owner |
|----------|------|-------|
| P0 | `backend/src/registry/types.ts` — TriggerDefinition, ActionDefinition | Platform |
| P0 | Registry auto-loaders (`triggers/index.ts`, `actions/index.ts`) | Platform |
| P0 | `AutomationCapabilityRegistry.ts` | Platform |
| P0 | `GET /api/automations/capabilities` endpoint | Backend |
| P0 | Remove hardcoded CHECK constraints (migration) | Backend |
| P0 | `WorkflowScheduler.init()` — dynamic evaluator loading | Backend |
| P0 | `ActionWorker.init()` — dynamic executor loading | Backend |
| P1 | `DynamicConfigPanel` — schema-driven form rendering | Frontend |
| P1 | Registry-driven `CanvasPalette` | Frontend |
| P1 | `GET /api/automations/:id/available-variables` + `VariableChipInput` refactor | Frontend |
| P1 | CrystalOS `@register_signal_emitter` decorator + dynamic graph assembly | CrystalOS |

The 10 existing trigger definitions and 10 action definitions migrate from hardcoded enums to registry files. This is a refactor with no behavior change — the same evaluators and executors, now auto-discovered.

---

## Evaluator and Executor interfaces

```typescript
// backend/src/scheduler/evaluators/base.ts
export interface TriggerEvaluator {
  evaluate(workflow: Workflow): Promise<EvaluationResult>;
}

export interface EvaluationResult {
  shouldFire: boolean;
  payload?: WorkflowTriggerPayload; // context passed to action steps
  reason?: string;                  // debug info for run logs
}
```

```typescript
// backend/src/queue/executors/base.ts
export interface ActionExecutor {
  execute(config: Record<string, unknown>, context: WorkflowContext): Promise<ExecutionResult>;
}

export interface ExecutionResult {
  success: boolean;
  outputVariables?: Record<string, unknown>; // fulfills outputVariables contract
  durationMs: number;
  errorMessage?: string;
}
```

These interfaces are stable. New evaluators and executors implement them without modifying any existing code.

---

*This document is the extensibility contract for the Automation Capability Registry. Questions: Priya Krishnamurthy (Platform Architecture) or Nina Reeves (Platform Engineering).*
