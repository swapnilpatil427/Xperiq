import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { PublishModal, PublishSuccessModal } from '../components/SurveyActionModal';
import { Spinner, OverlayLoader } from '../components/LoadingStates';
import { useSurveys } from '../hooks/useSurveys';
import { useApi } from '../hooks/useApi';
import { useTranslation } from '../lib/i18n';
import { ROUTES } from '../constants/routes';
import { QTYPE_META, QTYPE_GROUPS, createQuestion, mapAiToBuilderQuestion } from '../constants/questionTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ExperientCopilot } from '../components/ExperientCopilot';

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION TYPE PALETTE
// ─────────────────────────────────────────────────────────────────────────────
function TypeTile({ meta, typeKey, onAdd }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onAdd(typeKey)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
      style={{
        background: hovered ? meta.bg : 'transparent',
        transform: hovered ? 'perspective(600px) translateZ(4px)' : 'none',
        boxShadow: hovered ? `0 4px 16px ${meta.color}22` : 'none',
      }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: meta.bg, color: meta.color }}>
        <Icon name={meta.icon} size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold truncate text-foreground">{meta.label}</div>
        <div className="text-[10px] truncate text-muted-foreground">{meta.desc}</div>
      </div>
    </button>
  );
}

function QuestionPalette({ onAdd }) {
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Scrollable type list */}
      <div className="flex-1 overflow-y-auto py-4 min-h-0">
        {QTYPE_GROUPS.map((group) => {
          const types = Object.entries(QTYPE_META).filter(([, m]) => m.group === group);
          return (
            <div key={group} className="mb-2">
              <div className="px-4 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{group}</span>
              </div>
              {types.map(([key, meta]) => (
                <div key={key} className="px-2">
                  <TypeTile meta={meta} typeKey={key} onAdd={onAdd} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE ANSWER PREVIEW (shown inside question cards)
// ─────────────────────────────────────────────────────────────────────────────
function TypePreview({ q }) {
  const bg = '#f5f7f9';
  switch (q.type) {
    case 'nps':
      return (
        <div className="flex gap-0.5 mt-3">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className="flex-1 h-8 rounded flex items-center justify-center text-[10px] font-bold"
              style={{ background: i <= 6 ? '#fff0f0' : i <= 8 ? '#fef3c7' : '#d1fae5', color: i <= 6 ? '#b41340' : i <= 8 ? '#d97706' : '#059669' }}>
              {i}
            </div>
          ))}
        </div>
      );
    case 'csat':
      return (
        <div className="flex gap-3 mt-3">
          {['😠', '😕', '😐', '😊', '😍'].map((e, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: bg }}>{e}</div>
              <span className="text-[9px] text-muted-foreground">{i + 1}</span>
            </div>
          ))}
        </div>
      );
    case 'rating':
      return (
        <div className="flex gap-1 mt-3">
          {Array.from({ length: q.scaleMax || 5 }, (_, i) => (
            <Icon key={i} name="star" fill={1} size={22} style={{ color: '#fbbf24' }} />
          ))}
        </div>
      );
    case 'slider':
      return (
        <div className="mt-3 px-1">
          <div className="relative h-2 rounded-full bg-[#dfe3e6]">
            <div className="absolute left-0 top-0 h-full rounded-full w-1/3 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-tertiary)]" />
            <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md border-2 border-[var(--color-primary)]" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{q.labelLow || q.min}</span>
            <span className="text-[10px] text-muted-foreground">{q.labelHigh || q.max}</span>
          </div>
        </div>
      );
    case 'multiple_choice':
    case 'checkbox':
      return (
        <div className="mt-3 space-y-1.5">
          {(q.options || []).slice(0, 4).map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: bg }}>
              <div className={`w-4 h-4 border-2 flex-shrink-0 ${q.type === 'checkbox' ? 'rounded' : 'rounded-full'} border-[#dfe3e6]`} />
              <span className="text-sm text-[#595c5e]">{opt}</span>
            </div>
          ))}
          {q.allowOther && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: bg }}>
              <div className={`w-4 h-4 border-2 flex-shrink-0 ${q.type === 'checkbox' ? 'rounded' : 'rounded-full'} border-[#dfe3e6]`} />
              <span className="text-sm italic text-[#abadaf]">Other (specify)</span>
            </div>
          )}
        </div>
      );
    case 'dropdown':
      return (
        <div className="mt-3 flex items-center justify-between px-3 py-2.5 rounded-lg border border-[#dfe3e6]" style={{ background: bg }}>
          <span className="text-sm text-[#abadaf]">{q.placeholder || 'Choose an option...'}</span>
          <Icon name="expand_more" size={18} style={{ color: '#abadaf' }} />
        </div>
      );
    case 'ranking':
      return (
        <div className="mt-3 space-y-1.5">
          {(q.options || []).slice(0, 3).map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: bg }}>
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 bg-[#dfe3e6] text-[#595c5e]">{i + 1}</span>
              <span className="text-sm flex-1 text-[#595c5e]">{opt}</span>
              <Icon name="drag_indicator" size={16} style={{ color: '#dfe3e6' }} />
            </div>
          ))}
        </div>
      );
    case 'open_text':
      return (
        <div className="mt-3 rounded-lg h-16 flex items-center px-3 border-[1.5px] border-dashed border-[#dfe3e6]" style={{ background: bg }}>
          <span className="text-sm italic text-[#abadaf]">{q.placeholder || 'Respondent types here…'}</span>
        </div>
      );
    case 'short_text':
      return (
        <div className="mt-3 rounded-lg h-10 flex items-center px-3 border-[1.5px] border-[#dfe3e6]" style={{ background: bg }}>
          <span className="text-sm italic text-[#abadaf]">{q.placeholder || 'Short answer…'}</span>
        </div>
      );
    case 'matrix':
      return (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left py-1 pr-2 font-normal text-[#abadaf]" style={{ width: '35%' }}></th>
                {(q.columns || []).slice(0, 4).map((col, i) => (
                  <th key={i} className="py-1 px-1 text-center font-semibold text-[#595c5e]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.rows || []).slice(0, 3).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? bg : 'transparent' }}>
                  <td className="py-1.5 pr-2 font-medium text-[#595c5e]">{row}</td>
                  {(q.columns || []).slice(0, 4).map((_, j) => (
                    <td key={j} className="py-1.5 px-1 text-center">
                      <div className="w-3.5 h-3.5 rounded-full border-2 mx-auto border-[#dfe3e6]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'date':
      return (
        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#dfe3e6]" style={{ background: bg }}>
          <Icon name="calendar_today" size={16} style={{ color: '#abadaf' }} />
          <span className="text-sm text-[#abadaf]">
            {q.dateType === 'time' ? 'HH:MM' : q.dateType === 'datetime' ? 'DD/MM/YYYY  HH:MM' : 'DD / MM / YYYY'}
          </span>
        </div>
      );
    case 'statement':
      return (
        <div className="mt-2 h-px rounded bg-gradient-to-r from-[var(--color-primary)] to-transparent opacity-20" />
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION CARD
// ─────────────────────────────────────────────────────────────────────────────
function QuestionCard({ q, index, total, selected, onSelect, onUpdate, onDelete, onDuplicate, isDragging, isDragOver, onDragStart, onDragOver, onDrop }) {
  const meta = QTYPE_META[q.type] || QTYPE_META.open_text;
  const [hovered, setHovered] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (editingText) titleRef.current?.focus();
  }, [editingText]);

  const hasSkipLogic    = q.skipLogic?.length > 0;
  const hasDisplayLogic = !!q.displayLogic;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      onClick={() => onSelect(q.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl cursor-pointer transition-all"
      style={{
        background:  'white',
        border:      selected ? '2px solid #2a4bd9' : isDragOver ? '2px dashed #2a4bd9' : '1px solid rgba(171,173,175,0.15)',
        opacity:     isDragging ? 0.4 : 1,
        transform:   hovered && !selected ? 'perspective(1200px) rotateX(-0.5deg) translateY(-2px)' : 'none',
        boxShadow:   selected
          ? '0 0 0 4px rgba(42,75,217,0.08), 0 16px 40px rgba(42,75,217,0.12)'
          : hovered
            ? '0 16px 48px rgba(0,0,0,0.1)'
            : '0 4px 16px rgba(0,0,0,0.04)',
        transition:  'all 0.2s ease',
        marginBottom: isDragOver ? 0 : undefined,
      }}
    >
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 flex flex-col items-center justify-center gap-1 w-7 cursor-grab rounded-l-2xl transition-opacity"
        style={{ opacity: hovered || selected ? 1 : 0 }}
      >
        {[0,1,2,3].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#dfe3e6]" />
        ))}
      </div>

      <div className="pl-7 pr-5 pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: meta.bg, color: meta.color }}>
              <Icon name={meta.icon} size={11} />
              Q{String(index + 1).padStart(2, '0')} · {meta.label}
            </span>
            {q.required && (
              <span className="text-[10px] font-bold text-error uppercase tracking-wider">Required</span>
            )}
            {hasSkipLogic && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-[rgba(42,75,217,0.08)] text-[var(--color-primary)]">
                <Icon name="schema" size={10} />skip
              </span>
            )}
            {hasDisplayLogic && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-[rgba(5,150,105,0.08)] text-[var(--color-success)]">
                <Icon name="visibility" size={10} />conditional
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1" style={{ opacity: hovered || selected ? 1 : 0, transition: 'opacity 0.15s' }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDuplicate(q.id); }}
              title="Duplicate"
              className="h-7 w-7 rounded-lg hover:bg-[#eef1f3]"
            >
              <Icon name="content_copy" size={15} className="text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onDelete(q.id); }}
              title="Delete"
              className="h-7 w-7 rounded-lg hover:bg-[#fff0f0] text-destructive"
            >
              <Icon name="delete" size={15} />
            </Button>
          </div>
        </div>

        {/* Question text */}
        {q.type === 'statement' ? (
          <h3 className="text-lg font-extrabold font-headline text-foreground">{q.question || 'Section Title'}</h3>
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); setEditingText(true); }}
            title="Click to edit question text"
            className={cn(
              'cursor-text rounded-lg transition-all',
              !editingText && 'hover:bg-[rgba(42,75,217,0.04)] hover:ring-1 hover:ring-[rgba(42,75,217,0.15)]',
            )}
          >
            {editingText ? (
              <Textarea
                ref={titleRef}
                value={q.question}
                onChange={(e) => onUpdate(q.id, { question: e.target.value })}
                onBlur={() => setEditingText(false)}
                rows={2}
                className="w-full resize-none text-base font-semibold rounded-lg px-3 py-2 font-headline text-foreground border border-[rgba(42,75,217,0.3)] focus-visible:ring-1 focus-visible:ring-[rgba(42,75,217,0.4)] bg-white"
              />
            ) : (
              <div className="group px-3 py-2 flex items-start gap-2 min-h-[40px]">
                <p className={cn('text-base font-semibold font-headline leading-snug flex-1', q.question ? 'text-foreground' : 'text-muted-foreground/40 italic')}>
                  {q.question || 'Click to enter question text…'}
                </p>
                <Icon name="edit" size={13} className="text-muted-foreground/30 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        )}

        {/* Answer preview */}
        {q.type !== 'statement' && <TypePreview q={q} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTIES PANEL
// ─────────────────────────────────────────────────────────────────────────────
function OptionsEditor({ options, onChange }) {
  const add    = () => onChange([...options, `Option ${options.length + 1}`]);
  const remove = (i) => onChange(options.filter((_, j) => j !== i));
  const edit   = (i, v) => onChange(options.map((o, j) => (j === i ? v : o)));
  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 text-[10px] font-bold bg-[#e5e9eb] text-[#595c5e]">{i + 1}</div>
          <Input
            value={opt}
            onChange={(e) => edit(i, e.target.value)}
            className="flex-1 text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground focus-visible:ring-1"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            className="h-7 w-7 rounded hover:bg-[#fff0f0]"
          >
            <Icon name="close" size={14} className="text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={add}
        className="w-full text-xs font-bold h-8 rounded-lg bg-[#f5f7f9] text-[var(--color-primary)] border-dashed border-[#c7d2fe] hover:bg-[#e0e7ff]"
      >
        <Icon name="add" size={14} /> Add option
      </Button>
    </div>
  );
}

function RowsColumnsEditor({ rows, columns, onRowsChange, onColumnsChange }) {
  const addRow    = () => onRowsChange([...rows, `Row ${rows.length + 1}`]);
  const addCol    = () => onColumnsChange([...columns, `Column ${columns.length + 1}`]);
  const editRow   = (i, v) => onRowsChange(rows.map((r, j) => (j === i ? v : r)));
  const editCol   = (i, v) => onColumnsChange(columns.map((c, j) => (j === i ? v : c)));
  const removeRow = (i) => onRowsChange(rows.filter((_, j) => j !== i));
  const removeCol = (i) => onColumnsChange(columns.filter((_, j) => j !== i));

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold mb-2 text-[#595c5e]">Rows</div>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r} onChange={(e) => editRow(i, e.target.value)}
                className="flex-1 text-xs h-7 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground focus-visible:ring-1" />
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)} className="w-5 h-5 p-0">
                <Icon name="close" size={13} className="text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addRow}
            className="text-xs font-bold text-primary flex items-center gap-1 h-auto px-2 py-1.5">
            <Icon name="add" size={13} /> Add row
          </Button>
        </div>
      </div>
      <div>
        <div className="text-xs font-bold mb-2 text-[#595c5e]">Columns</div>
        <div className="space-y-1.5">
          {columns.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={c} onChange={(e) => editCol(i, e.target.value)}
                className="flex-1 text-xs h-7 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground focus-visible:ring-1" />
              <Button variant="ghost" size="icon" onClick={() => removeCol(i)} className="w-5 h-5 p-0">
                <Icon name="close" size={13} className="text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addCol}
            className="text-xs font-bold text-primary flex items-center gap-1 h-auto px-2 py-1.5">
            <Icon name="add" size={13} /> Add column
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkipLogicEditor({ q, allQuestions, onChange }) {
  const rules   = q.skipLogic || [];
  const others  = allQuestions.filter((x) => x.id !== q.id);
  const OPERATORS = [
    { value: 'eq',          label: 'equals' },
    { value: 'neq',         label: 'not equals' },
    { value: 'lt',          label: 'less than' },
    { value: 'lte',         label: 'less than or equal' },
    { value: 'gt',          label: 'greater than' },
    { value: 'gte',         label: 'greater than or equal' },
    { value: 'contains',    label: 'contains' },
    { value: 'answered',    label: 'is answered' },
    { value: 'not_answered',label: 'is not answered' },
  ];

  const addRule = () => onChange([
    ...rules,
    { id: `sl_${Date.now()}`, condition: { operator: 'lt', value: '7' }, destination: others[0]?.id || 'END_SURVEY' },
  ]);
  const removeRule = (id) => onChange(rules.filter((r) => r.id !== id));
  const updateRule = (id, patch) => onChange(rules.map((r) => r.id === id ? { ...r, ...patch } : r));
  const updateCond = (id, patch) => onChange(rules.map((r) => r.id === id ? { ...r, condition: { ...r.condition, ...patch } } : r));

  const noValueNeeded = (op) => op === 'answered' || op === 'not_answered';

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <div key={rule.id} className="rounded-xl p-3 space-y-2 bg-[rgba(42,75,217,0.04)] border border-[rgba(42,75,217,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)]">If answer…</span>
            <Button variant="ghost" size="icon" onClick={() => removeRule(rule.id)} className="h-6 w-6 rounded">
              <Icon name="close" size={14} className="text-destructive" />
            </Button>
          </div>
          <Select value={rule.condition.operator} onValueChange={(v) => updateCond(rule.id, { operator: v })}>
            <SelectTrigger className="w-full text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {!noValueNeeded(rule.condition.operator) && (
            <Input type="text" value={rule.condition.value} onChange={(e) => updateCond(rule.id, { value: e.target.value })}
              placeholder="Value…"
              className="w-full text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground focus-visible:ring-1" />
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)]">Then…</span>
            <Select value={rule.destination} onValueChange={(v) => updateRule(rule.id, { destination: v })}>
              <SelectTrigger className="flex-1 text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    Jump to Q{allQuestions.indexOf(x) + 1}: {x.question.slice(0, 40) || `(Q${allQuestions.indexOf(x) + 1})`}
                  </SelectItem>
                ))}
                <SelectItem value="END_SURVEY">End survey</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={addRule}
        className="w-full text-xs font-bold h-8 rounded-xl bg-[rgba(42,75,217,0.05)] text-[var(--color-primary)] border-dashed border-[rgba(42,75,217,0.2)] hover:bg-[rgba(42,75,217,0.08)]"
      >
        <Icon name="add" size={14} /> Add skip rule
      </Button>
    </div>
  );
}

function DisplayLogicEditor({ q, allQuestions, onChange }) {
  const dl     = q.displayLogic;
  const others = allQuestions.filter((x) => x.id !== q.id);
  const OPERATORS = ['eq','neq','lt','gt','lte','gte','contains','answered'];
  const OP_LABELS  = { eq:'equals', neq:'not equals', lt:'less than', gt:'greater than', lte:'≤', gte:'≥', contains:'contains', answered:'is answered' };

  if (!dl) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          if (others.length === 0) return;
          onChange({ sourceQuestionId: others[0].id, operator: 'eq', value: '' });
        }}
        disabled={others.length === 0}
        className="w-full text-xs font-bold h-9 rounded-xl bg-[rgba(5,150,105,0.05)] text-[var(--color-success)] border-dashed border-[rgba(5,150,105,0.2)] hover:bg-[rgba(5,150,105,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="add" size={14} /> Add display condition
      </Button>
    );
  }

  const qIndex = (id) => allQuestions.findIndex((x) => x.id === id);

  return (
    <div className="rounded-xl p-3 space-y-2 bg-[rgba(5,150,105,0.04)] border border-[rgba(5,150,105,0.12)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-success)]">Show only if…</span>
        <Button variant="ghost" size="icon" onClick={() => onChange(null)} className="h-6 w-6 rounded">
          <Icon name="close" size={14} className="text-destructive" />
        </Button>
      </div>
      <Select value={dl.sourceQuestionId || undefined} onValueChange={(v) => onChange({ ...dl, sourceQuestionId: v })}>
        <SelectTrigger className="w-full text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground">
          <SelectValue placeholder="Select question…" />
        </SelectTrigger>
        <SelectContent>
          {others.map((x) => (
            <SelectItem key={x.id} value={x.id}>Q{qIndex(x) + 1}: {x.question.slice(0, 40) || `(Q${qIndex(x) + 1})`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={dl.operator} onValueChange={(v) => onChange({ ...dl, operator: v })}>
        <SelectTrigger className="w-full text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>)}
        </SelectContent>
      </Select>
      {dl.operator !== 'answered' && (
        <Input type="text" value={dl.value} onChange={(e) => onChange({ ...dl, value: e.target.value })}
          placeholder="Value…" className="w-full text-xs h-8 rounded-lg bg-[#f5f7f9] border-[#dfe3e6] text-foreground focus-visible:ring-1" />
      )}
    </div>
  );
}

function PropertiesPanel({ q, allQuestions, onUpdate, onClose }) {
  if (!q) return null;
  const meta = QTYPE_META[q.type] || QTYPE_META.open_text;
  const u    = (patch) => onUpdate(q.id, patch);

  const TYPES_LIST = Object.entries(QTYPE_META).map(([k, v]) => ({ value: k, label: v.label }));

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-[#fafbfc]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10 bg-[#fafbfc] border-b border-[rgba(171,173,175,0.1)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>
            <Icon name={meta.icon} size={15} />
          </div>
          <span className="text-sm font-extrabold font-headline text-foreground">Properties</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-lg hover:bg-[#eef1f3]">
          <Icon name="close" size={18} className="text-muted-foreground" />
        </Button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
        {/* Question text */}
        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-1.5 text-muted-foreground">Question Text</Label>
          <Textarea value={q.question} onChange={(e) => u({ question: e.target.value })}
            rows={3} placeholder="Enter your question…"
            className="w-full resize-none text-sm px-3 py-2.5 rounded-[10px] bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
        </div>

        {/* Question type */}
        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-1.5 text-muted-foreground">Question Type</Label>
          <Select value={q.type} onValueChange={(newType) => {
            const fresh = createQuestion(newType);
            onUpdate(q.id, { ...fresh, id: q.id, question: q.question, required: q.required, skipLogic: q.skipLogic || [], displayLogic: q.displayLogic });
          }}>
            <SelectTrigger className="w-full text-sm h-10 rounded-[10px] bg-white border-[#dfe3e6] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES_LIST.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Required toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Required</div>
            <div className="text-xs text-muted-foreground">Respondent must answer</div>
          </div>
          <Switch
            checked={!!q.required}
            onCheckedChange={(checked) => u({ required: checked })}
          />
        </div>

        {/* Type-specific settings */}
        {(q.type === 'rating') && (
          <div className="space-y-3">
            <Separator />
            <Label className="text-[10px] font-black uppercase tracking-widest block text-muted-foreground">Scale Max</Label>
            <div className="flex gap-2">
              {[5, 7, 10].map((n) => (
                <Button key={n} onClick={() => u({ scaleMax: n })}
                  variant={q.scaleMax === n ? 'default' : 'outline'}
                  size="sm"
                  className={cn('flex-1 rounded-lg text-xs', q.scaleMax !== n && 'bg-[#f5f7f9] border-[#dfe3e6] text-[#595c5e] hover:bg-[#e0e7ff]')}>
                  1–{n}
                </Button>
              ))}
            </div>
            <Label className="text-[10px] font-black uppercase tracking-widest block text-muted-foreground">Display Style</Label>
            <div className="flex gap-2">
              {['stars','numbers'].map((s) => (
                <Button key={s} onClick={() => u({ ratingStyle: s })}
                  variant={q.ratingStyle === s ? 'default' : 'outline'}
                  size="sm"
                  className={cn('flex-1 rounded-lg text-xs capitalize', q.ratingStyle !== s && 'bg-[#f5f7f9] border-[#dfe3e6] text-[#595c5e] hover:bg-[#e0e7ff]')}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {(q.type === 'nps') && (
          <div className="space-y-3">
            <Separator />
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">Low end label</Label>
              <Input value={q.labelLow || ''} onChange={(e) => u({ labelLow: e.target.value })} placeholder="Not at all likely"
                className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">High end label</Label>
              <Input value={q.labelHigh || ''} onChange={(e) => u({ labelHigh: e.target.value })} placeholder="Extremely likely"
                className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
            </div>
          </div>
        )}

        {(q.type === 'csat') && (
          <div className="space-y-3">
            <Separator />
            <Label className="text-[10px] font-black uppercase tracking-widest block text-muted-foreground">Display Style</Label>
            <div className="flex gap-2">
              {[['emoji', '😊 Emoji'], ['stars', '⭐ Stars'], ['numbers', '1–5 Numbers']].map(([s, label]) => (
                <Button key={s} onClick={() => u({ csatStyle: s })}
                  size="sm"
                  className={cn(
                    'flex-1 rounded-lg text-xs',
                    q.csatStyle === s
                      ? 'bg-[var(--color-warning)] text-white border-[var(--color-warning)]'
                      : 'bg-[#f5f7f9] text-[#595c5e] border-[#dfe3e6] hover:bg-[#fef3c7]'
                  )}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {(q.type === 'slider') && (
          <div className="space-y-3">
            <Separator />
            <div className="grid grid-cols-2 gap-2">
              {[['min', 'Min'], ['max', 'Max'], ['step', 'Step']].map(([k, l]) => (
                <div key={k}>
                  <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">{l}</Label>
                  <Input type="number" value={q[k] ?? ''} onChange={(e) => u({ [k]: Number(e.target.value) })}
                    className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">Low label</Label>
              <Input value={q.labelLow || ''} onChange={(e) => u({ labelLow: e.target.value })}
                className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">High label</Label>
              <Input value={q.labelHigh || ''} onChange={(e) => u({ labelHigh: e.target.value })}
                className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
            </div>
          </div>
        )}

        {(['multiple_choice','checkbox','dropdown','ranking'].includes(q.type)) && (
          <div className="space-y-3">
            <Separator />
            <Label className="text-[10px] font-black uppercase tracking-widest block text-muted-foreground">Options</Label>
            <OptionsEditor options={q.options || []} onChange={(opts) => u({ options: opts })} />
            {(q.type === 'multiple_choice' || q.type === 'checkbox') && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#595c5e]">Allow "Other"</span>
                <Switch
                  checked={!!q.allowOther}
                  onCheckedChange={(checked) => u({ allowOther: checked })}
                />
              </div>
            )}
            {q.type === 'checkbox' && (
              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">Max selections</Label>
                <Input type="number" min={1} value={q.maxSelections || ''} onChange={(e) => u({ maxSelections: e.target.value ? Number(e.target.value) : null })}
                  placeholder="No limit"
                  className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
              </div>
            )}
          </div>
        )}

        {q.type === 'matrix' && (
          <div className="space-y-3">
            <Separator />
            <RowsColumnsEditor
              rows={q.rows || []} columns={q.columns || []}
              onRowsChange={(r) => u({ rows: r })} onColumnsChange={(c) => u({ columns: c })} />
            <Label className="text-[10px] font-black uppercase tracking-widest block text-muted-foreground">Cell type</Label>
            <div className="flex gap-2">
              {['radio','checkbox'].map((t) => (
                <Button key={t} onClick={() => u({ matrixType: t })}
                  size="sm"
                  className={cn(
                    'flex-1 rounded-lg text-xs capitalize',
                    q.matrixType === t
                      ? 'bg-[#6d28d9] text-white border-[#6d28d9]'
                      : 'bg-[#f5f7f9] text-[#595c5e] border-[#dfe3e6] hover:bg-purple-50'
                  )}>
                  {t}
                </Button>
              ))}
            </div>
          </div>
        )}

        {(q.type === 'open_text' || q.type === 'short_text') && (
          <div className="space-y-3">
            <Separator />
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">Placeholder text</Label>
              <Input value={q.placeholder || ''} onChange={(e) => u({ placeholder: e.target.value })}
                className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">Max characters</Label>
              <Input type="number" value={q.maxLength || ''} onChange={(e) => u({ maxLength: e.target.value ? Number(e.target.value) : null })}
                placeholder="No limit"
                className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1" />
            </div>
            {q.type === 'short_text' && (
              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-muted-foreground">Validation</Label>
                <Select value={q.validation || '__none__'} onValueChange={(v) => u({ validation: v === '__none__' ? null : v })}>
                  <SelectTrigger className="w-full text-xs h-8 rounded-lg bg-white border-[#dfe3e6] text-foreground">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="email">Email address</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                    <SelectItem value="number">Number only</SelectItem>
                    <SelectItem value="phone">Phone number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {q.type === 'date' && (
          <div className="space-y-3">
            <Separator />
            <Label className="text-[10px] font-black uppercase tracking-widest block text-muted-foreground">Date Type</Label>
            <div className="flex gap-2">
              {[['date', 'Date'], ['time', 'Time'], ['datetime', 'Date & Time']].map(([t, label]) => (
                <Button key={t} onClick={() => u({ dateType: t })}
                  size="sm"
                  className={cn(
                    'flex-1 rounded-lg text-xs',
                    q.dateType === t
                      ? 'bg-[#0f766e] text-white border-[#0f766e]'
                      : 'bg-[#f5f7f9] text-[#595c5e] border-[#dfe3e6] hover:bg-teal-50'
                  )}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Skip Logic */}
        <div>
          <Separator className="mb-4" />
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-3 flex items-center gap-1.5 text-muted-foreground">
            <Icon name="schema" size={12} /> Skip Logic
          </Label>
          <SkipLogicEditor q={q} allQuestions={allQuestions} onChange={(sl) => u({ skipLogic: sl })} />
        </div>

        {/* Display Logic */}
        <div>
          <Separator className="mb-4" />
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-3 flex items-center gap-1.5 text-muted-foreground">
            <Icon name="visibility" size={12} /> Display Condition
          </Label>
          <DisplayLogicEditor q={q} allQuestions={allQuestions} onChange={(dl) => u({ displayLogic: dl })} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW MODE — fully interactive
// ─────────────────────────────────────────────────────────────────────────────
function PreviewMode({ questions, title, thankYouMessage, settings, onClose }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers]  = useState({});
  const [done, setDone]        = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const q = questions[current];
  const val = answers[q?.id];
  const setAnswer = (v) => q && setAnswers((prev) => ({ ...prev, [q.id]: v }));
  const canContinue = !q?.required || q?.type === 'statement' || val !== undefined;
  const progress = questions.length > 0 ? ((current + 1) / questions.length) * 100 : 0;

  const advance = () => {
    if (!q) return;
    const rule = (q.skipLogic || []).find((r) => {
      const v = answers[q.id];
      const { operator, value } = r.condition;
      const num = Number(v), cmp = Number(value);
      if (operator === 'answered')     return v !== undefined && v !== '';
      if (operator === 'not_answered') return v === undefined || v === '';
      if (operator === 'eq')           return String(v) === String(value);
      if (operator === 'neq')          return String(v) !== String(value);
      if (operator === 'lt')           return !isNaN(num) && num < cmp;
      if (operator === 'lte')          return !isNaN(num) && num <= cmp;
      if (operator === 'gt')           return !isNaN(num) && num > cmp;
      if (operator === 'gte')          return !isNaN(num) && num >= cmp;
      if (operator === 'contains')     return String(v).includes(String(value));
      return false;
    });
    if (rule) {
      if (rule.destination === 'END_SURVEY') { setDone(true); return; }
      const idx = questions.findIndex((x) => x.id === rule.destination);
      if (idx !== -1) { setCurrent(idx); return; }
    }
    if (current < questions.length - 1) setCurrent(current + 1);
    else setDone(true);
  };

  function QuestionInput({ q }) {
    const v = answers[q.id];
    const ch = (newVal) => setAnswers((prev) => ({ ...prev, [q.id]: newVal }));
    switch (q.type) {
      case 'nps':
        return (
          <div className="mt-5">
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} onClick={() => ch(i)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{
                    background: v === i ? (i <= 6 ? '#b41340' : i <= 8 ? '#d97706' : '#059669') : '#eef1f3',
                    color: v === i ? '#fff' : '#595c5e',
                    transform: v === i ? 'scale(1.08)' : 'scale(1)',
                    boxShadow: v === i ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                  }}>
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between mt-2 px-1">
              <span className="text-xs font-semibold" style={{ color: '#b41340' }}>{q.labelLow || t('fill.npsLabelLow')}</span>
              <span className="text-xs font-semibold" style={{ color: '#059669' }}>{q.labelHigh || t('fill.npsLabelHigh')}</span>
            </div>
          </div>
        );
      case 'csat': {
        const style = q.csatStyle || 'emoji';
        if (style === 'emoji') {
          const emojis = [['😠','Very Bad'],['😕','Bad'],['😐','Neutral'],['😊','Good'],['😍','Excellent']];
          return (
            <div className="flex gap-3 mt-5 justify-center">
              {emojis.map(([emoji, label], i) => (
                <button key={i} onClick={() => ch(i + 1)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95"
                  style={{
                    background: v === i + 1 ? '#e0e7ff' : '#f5f7f9',
                    border: v === i + 1 ? '2px solid #2a4bd9' : '2px solid transparent',
                  }}>
                  <span className="text-3xl">{emoji}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
                </button>
              ))}
            </div>
          );
        }
        return (
          <div className="flex gap-2 mt-5">
            {Array.from({ length: 5 }, (_, i) => (
              <button key={i + 1} onClick={() => ch(i + 1)}
                className="flex-1 py-4 rounded-xl font-black text-xl transition-all active:scale-95"
                style={{ background: v >= i + 1 ? '#d97706' : '#eef1f3', color: v >= i + 1 ? '#fff' : '#c4c4c4' }}>
                {style === 'stars' ? '★' : i + 1}
              </button>
            ))}
          </div>
        );
      }
      case 'rating':
        return (
          <div className="flex gap-2 mt-5">
            {Array.from({ length: q.scaleMax || 5 }, (_, i) => (
              <button key={i + 1} onClick={() => ch(i + 1)}
                className="flex-1 py-4 rounded-xl font-black text-xl transition-all active:scale-95"
                style={{
                  background: v >= i + 1 ? '#2a4bd9' : '#eef1f3',
                  color: v >= i + 1 ? '#fff' : '#c4c4c4',
                  boxShadow: v >= i + 1 ? '0 8px 20px rgba(42,75,217,0.2)' : 'none',
                }}>
                {q.ratingStyle === 'numbers' ? i + 1 : '★'}
              </button>
            ))}
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="flex flex-col gap-2.5 mt-5">
            {(q.options || []).map((opt) => (
              <button key={opt} onClick={() => ch(opt)}
                className="flex items-center gap-3 px-5 py-4 rounded-xl text-left transition-all active:scale-95"
                style={{
                  background: v === opt ? '#e0e7ff' : '#eef1f3',
                  border: v === opt ? '2px solid #2a4bd9' : '2px solid transparent',
                  color: v === opt ? '#2a4bd9' : '#2c2f31',
                }}>
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ border: v === opt ? '2px solid #2a4bd9' : '2px solid #d0d5d8', background: v === opt ? '#2a4bd9' : 'transparent' }}>
                  {v === opt && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="font-semibold text-sm">{opt}</span>
              </button>
            ))}
            {q.allowOther && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-[#eef1f3] border-2 border-transparent">
                <div className="w-5 h-5 rounded-full border-2 border-[#d0d5d8] flex-shrink-0" />
                <span className="font-semibold text-sm text-[#abadaf] italic">Other (specify)…</span>
              </div>
            )}
          </div>
        );
      case 'checkbox': {
        const arrVal = Array.isArray(v) ? v : [];
        const toggle = (opt) => ch(arrVal.includes(opt) ? arrVal.filter((x) => x !== opt) : [...arrVal, opt]);
        return (
          <div className="flex flex-col gap-2.5 mt-5">
            {(q.options || []).map((opt) => (
              <button key={opt} onClick={() => toggle(opt)}
                className="flex items-center gap-3 px-5 py-4 rounded-xl text-left transition-all active:scale-95"
                style={{
                  background: arrVal.includes(opt) ? '#e0e7ff' : '#eef1f3',
                  border: arrVal.includes(opt) ? '2px solid #2a4bd9' : '2px solid transparent',
                }}>
                <div className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                  style={{ border: arrVal.includes(opt) ? '2px solid #2a4bd9' : '2px solid #d0d5d8', background: arrVal.includes(opt) ? '#2a4bd9' : 'transparent' }}>
                  {arrVal.includes(opt) && <Icon name="check" size={12} style={{ color: '#fff' }} />}
                </div>
                <span className="font-semibold text-sm" style={{ color: arrVal.includes(opt) ? '#2a4bd9' : '#2c2f31' }}>{opt}</span>
              </button>
            ))}
          </div>
        );
      }
      case 'dropdown':
        return (
          <select value={v || ''} onChange={(e) => ch(e.target.value)}
            className="w-full mt-5 px-4 py-3 rounded-[10px] text-sm font-semibold bg-[#f5f7f9] border border-[#dfe3e6] text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#2a4bd9]">
            <option value="">{q.placeholder || 'Choose an option…'}</option>
            {(q.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'open_text':
        return (
          <textarea value={v || ''} onChange={(e) => ch(e.target.value)}
            placeholder={q.placeholder || t('fill.textareaPlaceholder')}
            rows={4}
            className="w-full mt-5 resize-none text-sm px-4 py-3 rounded-[10px] bg-[#f5f7f9] border border-[#dfe3e6] text-foreground focus:outline-none focus:ring-2 focus:ring-[#2a4bd9] placeholder:text-[#abadaf]" />
        );
      case 'short_text':
        return (
          <input type="text" value={v || ''} onChange={(e) => ch(e.target.value)}
            placeholder={q.placeholder || 'Type your answer…'}
            className="w-full mt-5 px-4 py-3 rounded-[10px] text-sm font-medium bg-[#f5f7f9] border border-[#dfe3e6] text-foreground focus:outline-none focus:ring-2 focus:ring-[#2a4bd9]" />
        );
      case 'slider': {
        const min = q.min ?? 0, max = q.max ?? 100, step = q.step ?? 1, cur = v ?? min;
        return (
          <div className="mt-6 px-2">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-3">
              <span>{q.labelLow || min}</span>
              <span className="text-base font-bold text-foreground">{cur}</span>
              <span>{q.labelHigh || max}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={cur}
              onChange={(e) => ch(Number(e.target.value))}
              className="w-full accent-[#2a4bd9]" />
          </div>
        );
      }
      case 'date': {
        const type = q.dateType === 'time' ? 'time' : q.dateType === 'datetime' ? 'datetime-local' : 'date';
        return (
          <input type={type} value={v || ''} onChange={(e) => ch(e.target.value)}
            className="w-full mt-5 px-4 py-3 rounded-[10px] text-sm font-medium bg-[#f5f7f9] border border-[#dfe3e6] text-foreground focus:outline-none focus:ring-2 focus:ring-[#2a4bd9]" />
        );
      }
      case 'matrix': {
        const rows = q.rows || [], cols = q.columns || [], multi = q.matrixType === 'checkbox';
        const matVal = v || {};
        const toggle = (row, col) => {
          if (multi) {
            const prev = matVal[row] || [];
            ch({ ...matVal, [row]: prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col] });
          } else {
            ch({ ...matVal, [row]: col });
          }
        };
        const isSel = (row, col) => multi ? (matVal[row] || []).includes(col) : matVal[row] === col;
        return (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 w-1/3" />
                  {cols.map((c) => <th key={c} className="py-2 px-2 text-center text-xs font-bold text-muted-foreground">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row} style={{ background: ri % 2 === 0 ? '#f5f7f9' : 'transparent' }}>
                    <td className="py-3 pr-4 font-semibold text-sm text-foreground">{row}</td>
                    {cols.map((col) => (
                      <td key={col} className="py-3 px-2 text-center">
                        <button onClick={() => toggle(row, col)}
                          className={`w-5 h-5 mx-auto flex items-center justify-center ${multi ? 'rounded' : 'rounded-full'}`}
                          style={{ border: isSel(row, col) ? '2px solid #2a4bd9' : '2px solid #d0d5d8', background: isSel(row, col) ? '#2a4bd9' : 'transparent' }}>
                          {isSel(row, col) && <Icon name="check" size={11} style={{ color: '#fff' }} />}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'ranking': {
        const opts = q.options || [];
        const ranked = Array.isArray(v) && v.length ? v : opts;
        const move = (from, to) => {
          const next = [...ranked];
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
          ch(next);
        };
        return (
          <div className="mt-5 space-y-2">
            {ranked.map((opt, i) => (
              <div key={opt} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f5f7f9] border border-[#dfe3e6]">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black bg-[#e0e7ff] text-[#2a4bd9] flex-shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm font-semibold text-foreground">{opt}</span>
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => { if (i > 0) move(i, i - 1); }} disabled={i === 0}
                    className="w-6 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-[#dfe3e6] disabled:opacity-30">
                    <Icon name="arrow_drop_up" size={16} />
                  </button>
                  <button onClick={() => { if (i < ranked.length - 1) move(i, i + 1); }} disabled={i === ranked.length - 1}
                    className="w-6 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-[#dfe3e6] disabled:opacity-30">
                    <Icon name="arrow_drop_down" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      }
      default: return null;
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center py-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl mx-4 rounded-3xl overflow-hidden bg-white shadow-[0_40px_100px_rgba(0,0,0,0.35)]">

        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(171,173,175,0.12)] bg-[#fafbfc]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#e0e7ff] text-[var(--color-primary)]">
              <Icon name="play_arrow" size={12} />Preview
            </div>
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen((v) => !v)}
              className={cn(
                'rounded-full gap-1.5 h-auto py-1.5 px-3 text-xs font-bold',
                settingsOpen
                  ? 'bg-[rgba(42,75,217,0.08)] text-[var(--color-primary)]'
                  : 'text-muted-foreground hover:bg-[#eef1f3]'
              )}
            >
              <Icon name="settings" size={13} />Settings
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#eef1f3] hover:bg-[#dfe3e6]">
              <Icon name="close" size={16} className="text-[#595c5e]" />
            </Button>
          </div>
        </div>

        {/* Settings panel (collapsible) */}
        {settingsOpen && settings && (
          <div className="px-6 py-4 border-b border-[rgba(171,173,175,0.12)] bg-[#f5f7f9] space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Survey Configuration</p>
            {settings.description && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">Description</p>
                <p className="text-sm text-foreground">{settings.description}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">Thank You Message</p>
              {settings.thankYouMessage
                ? <p className="text-sm text-foreground bg-white rounded-xl px-3 py-2 border border-[#dfe3e6]">{settings.thankYouMessage}</p>
                : <p className="text-xs italic text-[#abadaf]">Not configured — close preview and open Settings to add one.</p>
              }
            </div>
            {settings.intent && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">Survey Goal</p>
                <p className="text-sm text-muted-foreground">{settings.intent}</p>
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1 w-full bg-[#eef1f3]">
          <div className="h-full transition-all bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-tertiary)]"
            style={{ width: done ? '100%' : `${progress}%` }} />
        </div>

        {/* Main content */}
        <div className="px-8 py-8 max-h-[65vh] overflow-y-auto">
          {done ? (
            <div className="text-center py-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', boxShadow: '0 12px 32px rgba(5,150,105,0.3)' }}>
                <Icon name="check_circle" fill={1} size={40} style={{ color: '#fff' }} />
              </div>
              <h2 className="text-2xl font-extrabold font-headline text-foreground">
                {t('fill.thankYou.heading')}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground max-w-xs mx-auto">
                {thankYouMessage || t('fill.thankYou.message')}
              </p>
              {!thankYouMessage && (
                <p className="mt-3 text-xs px-3 py-2 rounded-xl text-[#d97706] bg-[rgba(217,119,6,0.06)] border border-[rgba(217,119,6,0.15)] inline-flex items-center gap-1.5">
                  <Icon name="info" size={13} />
                  No custom message set — open Settings to configure one
                </p>
              )}
              <Button onClick={onClose}
                className="mt-6 px-6 py-3 rounded-xl h-auto font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                Close Preview
              </Button>
            </div>
          ) : q ? (
            <>
              {q.type !== 'statement' && (
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground/50">
                    {current + 1} / {questions.filter((x) => x.type !== 'statement').length}
                  </span>
                  {q.required && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#b41340]">Required</span>
                  )}
                </div>
              )}
              {q.type === 'statement' ? (
                <h2 className="text-2xl font-extrabold font-headline mb-6 text-foreground">{q.question}</h2>
              ) : (
                <h2 className="text-xl font-extrabold font-headline text-foreground leading-snug">
                  {q.question || <span className="text-muted-foreground/40 italic">No question text entered</span>}
                </h2>
              )}
              {q.type !== 'statement' && <QuestionInput q={q} />}
              <div className="flex gap-3 mt-8">
                <Button onClick={() => setCurrent(Math.max(0, current - 1))}
                  disabled={current === 0}
                  className="px-5 rounded-xl h-auto py-3 bg-[#eef1f3] text-[#595c5e] hover:bg-[#dfe3e6] font-bold disabled:opacity-30">
                  ← Back
                </Button>
                <Button onClick={advance}
                  disabled={q.type !== 'statement' && !canContinue}
                  className="flex-1 px-6 rounded-xl h-auto py-3 font-bold text-white transition-all"
                  style={{
                    background: canContinue || q.type === 'statement'
                      ? 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))'
                      : '#eef1f3',
                    color: canContinue || q.type === 'statement' ? 'white' : '#abadaf',
                  }}>
                  {current === questions.length - 1 ? 'Submit →' : 'Continue →'}
                </Button>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-[rgba(171,173,175,0.08)] flex items-center justify-between bg-[#fafbfc]">
          <span className="text-[10px] text-muted-foreground/60">Preview mode — responses are not saved</span>
          {thankYouMessage && (
            <span className="text-[10px] font-bold text-[var(--color-success)] flex items-center gap-1">
              <Icon name="check_circle" size={11} />Thank you message configured
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC VIEW
// ─────────────────────────────────────────────────────────────────────────────
function LogicView({ questions }) {
  const qIndex = (id) => questions.findIndex((x) => x.id === id);
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-extrabold font-headline mb-8 text-foreground">Survey Flow</h2>
      <div className="space-y-2">
        {questions.map((q, i) => {
          const meta = QTYPE_META[q.type] || QTYPE_META.open_text;
          const hasLogic = (q.skipLogic?.length > 0) || q.displayLogic;
          return (
            <div key={q.id} className="rounded-2xl overflow-hidden border border-[rgba(171,173,175,0.15)]">
              <div className="flex items-center gap-3 px-5 py-3.5 bg-white">
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>Q{i + 1}</span>
                <span className="text-xs font-semibold flex-1 truncate text-foreground">{q.question || '(untitled)'}</span>
                <span className="text-[10px] font-bold text-muted-foreground">{meta.label}</span>
              </div>
              {hasLogic && (
                <div className="px-5 py-3 space-y-1.5 bg-[#f5f7f9] border-t border-[rgba(171,173,175,0.1)]">
                  {q.displayLogic && (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-success)]">
                      <Icon name="visibility" size={12} />
                      <span>Show only if Q{qIndex(q.displayLogic.sourceQuestionId) + 1} {q.displayLogic.operator} {q.displayLogic.value}</span>
                    </div>
                  )}
                  {(q.skipLogic || []).map((rule, ri) => (
                    <div key={ri} className="flex items-center gap-2 text-xs text-[var(--color-primary)]">
                      <Icon name="schema" size={12} />
                      <span>
                        If answer {rule.condition.operator} {rule.condition.operator !== 'answered' ? `"${rule.condition.value}"` : ''} →{' '}
                        {rule.destination === 'END_SURVEY' ? 'End survey' : `Jump to Q${qIndex(rule.destination) + 1}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {i < questions.length - 1 && !hasLogic && (
                <div className="flex items-center px-5 py-1 bg-[#f5f7f9] border-t border-[rgba(171,173,175,0.08)]">
                  <Icon name="arrow_downward" size={12} style={{ color: '#dfe3e6' }} />
                  <span className="text-[10px] ml-1 text-[#dfe3e6]">continue</span>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-[rgba(171,173,175,0.15)]">
          <Icon name="flag" fill={1} size={14} className="text-[var(--color-success)]" />
          <span className="text-xs font-bold text-[var(--color-success)]">End of survey</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SURVEY SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SurveySettingsPanel({ settings, onChange, onClose, fromTemplate }) {
  const { t } = useTranslation();
  const u = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-[#fafbfc]">
      <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10 bg-[#fafbfc] border-b border-[rgba(171,173,175,0.1)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[rgba(42,75,217,0.08)]">
            <Icon name="settings" size={15} style={{ color: 'var(--color-primary)' }} />
          </div>
          <span className="text-sm font-extrabold font-headline text-foreground">{t('builder.settings.heading')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-lg hover:bg-[#eef1f3]">
          <Icon name="close" size={18} className="text-muted-foreground" />
        </Button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">

        {/* Template info — read-only, sourced from template record */}
        {fromTemplate && (
          <div className="rounded-xl p-3.5 space-y-2.5"
            style={{ background: 'rgba(131,41,200,0.05)', border: '1px solid rgba(131,41,200,0.12)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--color-tertiary)' }}>
              {t('builder.settings.templateLabel')}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: fromTemplate.bg || '#f3e8ff', color: fromTemplate.color || 'var(--color-tertiary)' }}>
                <Icon name={fromTemplate.icon || 'library_books'} size={13} />
              </div>
              <span className="text-sm font-bold text-foreground">{fromTemplate.label || fromTemplate.title}</span>
            </div>
            {fromTemplate.category && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(131,41,200,0.1)', color: 'var(--color-tertiary)' }}>
                {fromTemplate.category}
              </span>
            )}
            {fromTemplate.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {fromTemplate.tags.slice(0, 6).map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(131,41,200,0.08)', color: 'var(--color-tertiary)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {fromTemplate.estimatedMinutes > 0 && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                <Icon name="schedule" size={11} />
                ~{fromTemplate.estimatedMinutes} min to complete
              </p>
            )}
          </div>
        )}

        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-1.5 text-muted-foreground">
            {t('builder.settings.descriptionLabel')}
          </Label>
          <Textarea
            value={settings.description || ''}
            onChange={(e) => u({ description: e.target.value })}
            rows={3}
            placeholder={t('builder.settings.descriptionPlaceholder')}
            className="w-full resize-none text-sm px-3 py-2.5 rounded-[10px] bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1"
          />
        </div>

        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-1.5 text-muted-foreground">
            {t('builder.settings.intentLabel')}
          </Label>
          <Textarea
            value={settings.intent || ''}
            onChange={(e) => u({ intent: e.target.value })}
            rows={3}
            placeholder={t('builder.settings.intentPlaceholder')}
            className="w-full resize-none text-sm px-3 py-2.5 rounded-[10px] bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1"
          />
        </div>

        <Separator />

        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest block mb-1.5 text-muted-foreground">
            {t('builder.settings.thankYouMessageLabel')}
          </Label>
          <Textarea
            value={settings.thankYouMessage || ''}
            onChange={(e) => u({ thankYouMessage: e.target.value })}
            rows={3}
            placeholder={t('builder.settings.thankYouMessagePlaceholder')}
            className="w-full resize-none text-sm px-3 py-2.5 rounded-[10px] bg-white border-[#dfe3e6] text-foreground focus-visible:ring-1"
          />
          {/* Live preview */}
          {settings.thankYouMessage && (
            <div className="mt-2 rounded-xl px-3 py-2.5 border border-[rgba(5,150,105,0.15)]"
              style={{ background: 'rgba(5,150,105,0.04)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-success)] mb-1 flex items-center gap-1">
                <Icon name="visibility" size={10} />Preview
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{settings.thankYouMessage}</p>
            </div>
          )}
          {!settings.thankYouMessage && (
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 flex items-center gap-1">
              <Icon name="info" size={10} />Shown to respondents after they submit. Supports line breaks.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function SurveyBuilderPage() {
  const { surveyId: surveyIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const pending = location.state || null;
  const api = useApi();

  // Edit mode: surveyIdParam is a real DB id (not 'new')
  const isEditMode = !!surveyIdParam && surveyIdParam !== 'new';
  const hasStateQuestions = isEditMode
    ? (pending?.questions?.length > 0)
    : Array.isArray(pending?.questions);
  const needsDbLoad = isEditMode && !hasStateQuestions;

  const [isLoading,    setIsLoading]    = useState(needsDbLoad);
  const [questions, setQuestions] = useState(() => {
    if (pending?.questions?.length) return pending.questions.map(mapAiToBuilderQuestion);
    return [createQuestion('nps'), createQuestion('open_text')];
  });
  const [surveyTitle,  setSurveyTitle]  = useState(pending?.title?.slice(0, 80) || 'New Survey');
  const [surveyTypeId, setSurveyTypeId] = useState(pending?.surveyTypeId || null);
  const [surveyId,     setSurveyId]     = useState(
    surveyIdParam && surveyIdParam !== 'new' ? surveyIdParam : (pending?.id || null)
  );

  const fromTemplate = pending?.fromTemplate || null;

  // Only survey-run-specific fields — template data (tags, estimated_minutes, etc.) is
  // derived from the template record via template_id, never duplicated on the survey.
  const [surveySettings, setSurveySettings] = useState({
    description:      pending?.description || '',
    intent:           pending?.intent || '',
    thankYouMessage:  pending?.thankYouMessage || '',
    templateId:       pending?.templateId || fromTemplate?.id || null,
  });

  // Load full survey from DB when opening by URL without state data
  useEffect(() => {
    if (!needsDbLoad) return;
    api.getSurvey(surveyIdParam)
      .then((data) => {
        const s = data?.survey || data;
        if (s) {
          setSurveyTitle(s.title || 'New Survey');
          setSurveyTypeId(s.survey_type_id || null);
          setSurveySettings({
            description:     s.description || '',
            intent:          s.intent || '',
            thankYouMessage: s.thank_you_message || '',
            templateId:      s.template_id || null,
          });
          if (s.questions?.length) {
            setQuestions(s.questions.map(mapAiToBuilderQuestion));
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedId,  setSelectedId]  = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode,        setMode]        = useState('build'); // 'build' | 'preview' | 'logic'
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [launching,        setLaunching]        = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishSuccessUrl, setPublishSuccessUrl] = useState(null);
  const [autoSaving,       setAutoSaving]       = useState(false);
  const [autoSavedAt,      setAutoSavedAt]      = useState(null);
  const autosaveRef = useRef(null);
  // Tracks whether user has made any changes since data was loaded — prevents autosave from
  // firing immediately after page load when state is populated from the API.
  const isDirtyRef = useRef(false);
  const { createSurvey, updateSurvey, publishSurvey } = useSurveys();

  // Drag state via refs (no re-renders mid-drag)
  const dragIndexRef = useRef(null);
  const [dragOver,    setDragOver]    = useState(null);

  const selectedQ = questions.find((q) => q.id === selectedId) || null;
  const panelOpen = (!!selectedId || settingsOpen) && mode === 'build';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const addQuestion  = useCallback((type) => {
    isDirtyRef.current = true;
    const q = createQuestion(type);
    setQuestions((prev) => [...prev, q]);
    setSelectedId(q.id);
    // Scroll to end
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  }, []);

  const updateQuestion = useCallback((id, patch) => {
    isDirtyRef.current = true;
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const deleteQuestion = useCallback((id) => {
    isDirtyRef.current = true;
    setQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== id);
      return filtered.map((q) => ({
        ...q,
        skipLogic: (q.skipLogic || []).filter((rule) => rule.destination !== id),
      }));
    });
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const duplicateQuestion = useCallback((id) => {
    isDirtyRef.current = true;
    const src = questions.find((q) => q.id === id);
    if (!src) return;
    const copy = { ...src, id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, question: src.question + ' (copy)' };
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  }, [questions]);

  const reorder = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    isDirtyRef.current = true;
    setQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleAiCommand = useCallback(async (message) => {
    const result = await api.refineSurvey(questions, message, {
      surveyTypeId,
      intent: surveySettings.intent || surveyTitle,
      description: surveySettings.description,
      templateId: surveySettings.templateId,
    });
    if (result.questions) { isDirtyRef.current = true; setQuestions(result.questions.map(mapAiToBuilderQuestion)); }
    return result;
  }, [api, questions, surveyTypeId, surveyTitle, surveySettings]);

  const buildPayload = () => ({
    title: surveyTitle,
    questions: questions.map(({ id, type, question, required, skipLogic, displayLogic, ...rest }) => ({
      id,
      type,
      question:     question || '',
      required:     !!required,
      skipLogic:    skipLogic || [],
      displayLogic: displayLogic || null,
      ...rest,
    })),
    survey_type_id:    surveyTypeId,
    description:       surveySettings.description || null,
    intent:            surveySettings.intent || null,
    thank_you_message: surveySettings.thankYouMessage || null,
    template_id:       surveySettings.templateId || null,
  });

  const doSave = async () => {
    const payload = buildPayload();
    if (surveyId) {
      await updateSurvey(surveyId, {
        title:             payload.title,
        questions:         payload.questions,
        survey_type_id:    payload.survey_type_id,
        description:       payload.description,
        intent:            payload.intent,
        thank_you_message: payload.thank_you_message,
        template_id:       payload.template_id,
      });
      return { id: surveyId };
    }
    const result = await createSurvey(payload);
    if (result?.id) setSurveyId(result.id);
    return result;
  };

  const handleSave = async () => {
    setSaving(true);
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!surveyId || !isDirtyRef.current) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      setAutoSaving(true);
      try { await doSave(); setAutoSavedAt(new Date()); }
      catch (err) { console.error('[autosave] failed:', err); }
      finally { setAutoSaving(false); }
    }, 30_000);
    return () => clearTimeout(autosaveRef.current);
  }, [questions, surveyTitle, surveySettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const survey = await doSave();
      const id = survey?.id || surveyId;
      if (id) {
        const result = await publishSurvey(id);
        const token = result?.publishToken || `mock-${id}`;
        setShowPublishModal(false);
        setPublishSuccessUrl(`${window.location.origin}/s/${token}`);
      }
    } finally { setLaunching(false); }
  };

  // ── Layout constants ──────────────────────────────────────────────────────
  const PALETTE_W  = 224; // 14rem
  const PROPS_W    = 320; // 20rem

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-4 flex-col min-h-[60vh]">
        <Spinner size={36} />
        <p className="text-sm font-semibold text-on-surface-variant">Loading survey…</p>
      </div>
    );
  }

  return (
    <>
      <OverlayLoader visible={launching} message="Publishing survey…" />

      {/* Preview overlay */}
      {mode === 'preview' && (
        <PreviewMode
          questions={questions}
          title={surveyTitle}
          thankYouMessage={surveySettings.thankYouMessage}
          settings={surveySettings}
          onClose={() => setMode('build')}
        />
      )}

      {/* Publish confirmation */}
      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onConfirm={handleLaunch}
        busy={launching}
        surveyTitle={surveyTitle}
      />

      {/* Publish success */}
      <PublishSuccessModal
        open={!!publishSuccessUrl}
        onClose={() => setPublishSuccessUrl(null)}
        shareUrl={publishSuccessUrl || ''}
        onViewSurvey={() => { if (publishSuccessUrl) window.open(publishSuccessUrl, '_blank'); }}
        onGoToList={() => navigate(ROUTES.SURVEYS)}
      />

      {/* ── Question Type Palette ── */}
      <aside
        className="fixed z-30 overflow-hidden bg-white"
        style={{
          left:    'var(--sidebar-width)',
          top:     '4rem',
          width:   PALETTE_W,
          height:  'calc(100vh - 4rem)',
          borderRight: '1px solid rgba(171,173,175,0.12)',
        }}
      >
        <QuestionPalette onAdd={addQuestion} />
      </aside>

      {/* ── Canvas ── */}
      <div
        style={{
          marginLeft:   PALETTE_W,
          marginRight:  panelOpen ? PROPS_W : 0,
          paddingBottom: 120,
          transition:   'margin-right 0.3s cubic-bezier(0.4,0,0.2,1)',
          minHeight:    'calc(100vh - 4rem)',
        }}
      >
        {/* PageHeader: breadcrumb + editable title + action buttons */}
        <div className="max-w-3xl mx-auto px-6">
          <PageHeader
            crumbs={[
              { label: t('nav.surveys'), path: ROUTES.SURVEYS },
              { label: surveyTitle },
            ]}
            title={
              <input
                value={surveyTitle}
                onChange={(e) => { isDirtyRef.current = true; setSurveyTitle(e.target.value); }}
                className="text-2xl md:text-[1.75rem] font-extrabold tracking-tight font-headline text-on-surface leading-tight bg-transparent border-none outline-none w-full block px-0 focus:ring-0"
                style={{ boxShadow: 'none' }}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                {surveyId && !autoSaving && autoSavedAt && (
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {`${t('builder.autosaved')} ${autoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSettingsOpen((v) => !v); setSelectedId(null); }}
                  className={cn(
                    'rounded-full gap-1.5',
                    settingsOpen
                      ? 'bg-[rgba(42,75,217,0.08)] text-[var(--color-primary)] border-[rgba(42,75,217,0.2)] hover:bg-[rgba(42,75,217,0.12)]'
                      : 'bg-[#f5f7f9] text-[#595c5e] border-[#dfe3e6] hover:bg-[#eef1f3]'
                  )}
                >
                  <Icon name="settings" size={15} />{t('builder.settings.settingsButton')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || autoSaving || launching}
                  className={cn(
                    'rounded-full flex items-center gap-1.5 active:scale-95',
                    saved
                      ? 'bg-[var(--color-success)] text-white border-[var(--color-success)] hover:opacity-90'
                      : 'bg-[#eef1f3] text-[#595c5e] border-[#dfe3e6] hover:bg-[#dfe3e6]'
                  )}
                >
                  {(saving || autoSaving)
                    ? <><Spinner size={14} color="#595c5e" />{autoSaving ? t('builder.autosaving') : t('common.saving')}</>
                    : <><Icon name={saved ? 'check' : 'save'} size={15} />{saved ? t('common.saved') : t('common.save')}</>
                  }
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => setShowPublishModal(true)}
                  disabled={saving || launching}
                  className="rounded-full gap-1.5 shadow-[0_8px_20px_-4px_rgba(5,150,105,0.3)]"
                >
                  <Icon name="rocket_launch" size={15} />Launch
                </Button>
              </div>
            }
          />
        </div>

        {/* Mode tab bar */}
        <div className="flex items-center gap-1 max-w-3xl mx-auto px-6 mb-6">
          {[['build', 'edit', 'Build'], ['logic', 'schema', 'Logic'], ['preview', 'play_arrow', 'Preview']].map(([m, icon, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-all',
                mode === m
                  ? 'bg-[#eff2ff] text-[#4338ca]'
                  : 'text-[#9ca3af] hover:text-[#374151] hover:bg-[#f3f4f6]'
              )}
            >
              <Icon name={icon} size={14} />{label}
            </button>
          ))}
        </div>

        {mode === 'logic' ? (
          <LogicView questions={questions} />
        ) : mode === 'preview' ? null : (
          <div className="max-w-3xl mx-auto px-6 space-y-4">
            {/* Template intelligence banner */}
            {fromTemplate?.intelligence && (
              <div className="rounded-2xl p-4 flex items-start gap-3"
                style={{ background: 'rgba(131,41,200,0.05)', border: '1px solid rgba(131,41,200,0.12)' }}>
                <Icon name="auto_awesome" size={16} style={{ color: 'var(--color-tertiary)', marginTop: 2 }} />
                <div>
                  <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--color-tertiary)' }}>
                    AI Intelligence Active — {fromTemplate.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {fromTemplate.intelligence.scoringNarrative || 'Template intelligence is guiding AI suggestions for this survey.'}
                  </p>
                </div>
              </div>
            )}

            {/* Question count badge */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#e0e7ff] text-[var(--color-primary)]">
                  {questions.length} question{questions.length !== 1 ? 's' : ''}
                </span>
                {questions.some((q) => q.skipLogic?.length > 0) && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 bg-[rgba(42,75,217,0.08)] text-[var(--color-primary)]">
                    <Icon name="schema" size={11} />Skip logic active
                  </span>
                )}
              </div>
              {selectedId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedId(null)}
                  className="text-xs font-bold px-3 rounded-full bg-[#eef1f3] text-[#595c5e] hover:bg-[#dfe3e6]"
                >
                  Deselect
                </Button>
              )}
            </div>

            {/* Question cards */}
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                q={q}
                index={i}
                total={questions.length}
                selected={selectedId === q.id}
                onSelect={setSelectedId}
                onUpdate={updateQuestion}
                onDelete={deleteQuestion}
                onDuplicate={duplicateQuestion}
                isDragging={dragIndexRef.current === i}
                isDragOver={dragOver === i}
                onDragStart={() => { dragIndexRef.current = i; }}
                onDragOver={() => setDragOver(i)}
                onDrop={() => {
                  if (dragIndexRef.current !== null) reorder(dragIndexRef.current, i);
                  dragIndexRef.current = null;
                  setDragOver(null);
                }}
              />
            ))}

            {/* Add question button */}
            <Button
              variant="ghost"
              onClick={() => addQuestion('open_text')}
              onDragOver={(e) => { e.preventDefault(); setDragOver(questions.length); }}
              onDrop={() => {
                if (dragIndexRef.current !== null) reorder(dragIndexRef.current, questions.length - 1);
                dragIndexRef.current = null;
                setDragOver(null);
              }}
              className={cn(
                'w-full h-auto py-5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 transition-all group',
                'border-[#dfe3e6] hover:border-[var(--color-primary)] hover:bg-[rgba(42,75,217,0.03)] bg-transparent',
                dragOver === questions.length && 'border-[var(--color-primary)] bg-[rgba(42,75,217,0.04)]'
              )}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:scale-110 bg-[rgba(42,75,217,0.08)]">
                <Icon name="add" size={22} className="text-[var(--color-primary)]" />
              </div>
              <span className="text-sm font-bold text-[var(--color-primary)]">Add Question</span>
              <span className="text-xs text-muted-foreground">or drag a type from the left panel</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Properties / Settings Panel ── */}
      <aside
        className="fixed z-30 overflow-hidden bg-[#fafbfc]"
        style={{
          right:     0,
          top:       '4rem',
          width:     panelOpen ? PROPS_W : 0,
          height:    'calc(100vh - 4rem)',
          transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
          borderLeft: '1px solid rgba(171,173,175,0.12)',
        }}
      >
        <div className="w-[320px] h-full overflow-hidden">
          {settingsOpen ? (
            <SurveySettingsPanel
              settings={surveySettings}
              onChange={(v) => { isDirtyRef.current = true; setSurveySettings(v); }}
              onClose={() => setSettingsOpen(false)}
              fromTemplate={fromTemplate}
            />
          ) : (
            <PropertiesPanel
              q={selectedQ}
              allQuestions={questions}
              onUpdate={updateQuestion}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </aside>

      {/* Decorative glow */}
      <div className="fixed pointer-events-none -z-10 rounded-full"
        style={{ top: '-5%', right: '-10%', width: 600, height: 600, background: 'rgba(224,231,255,0.25)', filter: 'blur(150px)' }} />

      <ExperientCopilot
        context={{
          surveyTitle,
          questionCount: questions.length,
          surveyType: surveyTypeId,
          surveySettings,
          templateInfo: fromTemplate ? { label: fromTemplate.label, id: fromTemplate.id } : null,
          isBuilder: true,
        }}
        onRefine={handleAiCommand}
      />
    </>
  );
}
