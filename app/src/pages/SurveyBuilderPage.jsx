import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { SideNav } from '../components/SideNav';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { PublishModal } from '../components/SurveyActionModal';
import { useSurveys } from '../hooks/useSurveys';
import { useApi } from '../hooks/useApi';
import { pageStore } from '../lib/pageStore';
import { ROUTES } from '../constants/routes';
import { QTYPE_META, QTYPE_GROUPS, createQuestion, mapAiToBuilderQuestion } from '../constants/questionTypes';

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
        <div className="text-xs font-bold truncate" style={{ color: '#2c2f31' }}>{meta.label}</div>
        <div className="text-[10px] truncate" style={{ color: '#9a9d9f' }}>{meta.desc}</div>
      </div>
    </button>
  );
}

function QuestionPalette({ onAdd, onAiCommand }) {
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const api = useApi();

  const handleAiCommand = async () => {
    if (!aiInput.trim() || aiLoading) return;
    setAiLoading(true);
    await onAiCommand(aiInput.trim());
    setAiInput('');
    setAiLoading(false);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#f5f7f9' }}>
      {/* Scrollable type list */}
      <div className="flex-1 overflow-y-auto py-4 min-h-0">
        {QTYPE_GROUPS.map((group) => {
          const types = Object.entries(QTYPE_META).filter(([, m]) => m.group === group);
          return (
            <div key={group} className="mb-2">
              <div className="px-4 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#abadaf' }}>{group}</span>
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

      {/* AI Copilot — always visible at bottom */}
      <div className="flex-shrink-0 px-3 py-3" style={{ borderTop: '1px solid rgba(171,173,175,0.18)', background: '#f5f7f9' }}>
        <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#abadaf' }}>AI Copilot</div>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(42,75,217,0.2)', boxShadow: '0 2px 8px rgba(42,75,217,0.06)' }}>
          <textarea
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiCommand(); } }}
            placeholder="Ask AI to modify survey…"
            rows={2}
            className="w-full resize-none text-xs p-3 outline-none bg-white text-on-surface placeholder:text-on-surface-variant/40"
            style={{ border: 'none' }}
          />
          <button
            onClick={handleAiCommand}
            disabled={!aiInput.trim() || aiLoading}
            className="w-full py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            style={{
              background: aiInput.trim() && !aiLoading ? 'linear-gradient(135deg, #2a4bd9, #8329c8)' : '#eef1f3',
              color: aiInput.trim() && !aiLoading ? 'white' : '#9a9d9f',
            }}
          >
            {aiLoading
              ? <><div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: '#9a9d9f', borderTopColor: 'transparent' }} />Thinking…</>
              : <><Icon name="auto_awesome" size={13} />Apply Change</>
            }
          </button>
        </div>
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
              <span className="text-[9px]" style={{ color: '#abadaf' }}>{i + 1}</span>
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
          <div className="relative h-2 rounded-full" style={{ background: '#dfe3e6' }}>
            <div className="absolute left-0 top-0 h-full rounded-full w-1/3" style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }} />
            <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md border-2" style={{ borderColor: '#2a4bd9' }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: '#9a9d9f' }}>{q.labelLow || q.min}</span>
            <span className="text-[10px]" style={{ color: '#9a9d9f' }}>{q.labelHigh || q.max}</span>
          </div>
        </div>
      );
    case 'multiple_choice':
    case 'checkbox':
      return (
        <div className="mt-3 space-y-1.5">
          {(q.options || []).slice(0, 4).map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: bg }}>
              <div className={`w-4 h-4 border-2 flex-shrink-0 ${q.type === 'checkbox' ? 'rounded' : 'rounded-full'}`}
                style={{ borderColor: '#dfe3e6' }} />
              <span className="text-sm" style={{ color: '#595c5e' }}>{opt}</span>
            </div>
          ))}
          {q.allowOther && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: bg }}>
              <div className={`w-4 h-4 border-2 flex-shrink-0 ${q.type === 'checkbox' ? 'rounded' : 'rounded-full'}`}
                style={{ borderColor: '#dfe3e6' }} />
              <span className="text-sm italic" style={{ color: '#abadaf' }}>Other (specify)</span>
            </div>
          )}
        </div>
      );
    case 'dropdown':
      return (
        <div className="mt-3 flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ background: bg, border: '1px solid #dfe3e6' }}>
          <span className="text-sm" style={{ color: '#abadaf' }}>{q.placeholder || 'Choose an option...'}</span>
          <Icon name="expand_more" size={18} style={{ color: '#abadaf' }} />
        </div>
      );
    case 'ranking':
      return (
        <div className="mt-3 space-y-1.5">
          {(q.options || []).slice(0, 3).map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: bg }}>
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: '#dfe3e6', color: '#595c5e' }}>{i + 1}</span>
              <span className="text-sm flex-1" style={{ color: '#595c5e' }}>{opt}</span>
              <Icon name="drag_indicator" size={16} style={{ color: '#dfe3e6' }} />
            </div>
          ))}
        </div>
      );
    case 'open_text':
      return (
        <div className="mt-3 rounded-lg h-16 flex items-center px-3" style={{ background: bg, border: '1.5px dashed #dfe3e6' }}>
          <span className="text-sm italic" style={{ color: '#abadaf' }}>{q.placeholder || 'Respondent types here…'}</span>
        </div>
      );
    case 'short_text':
      return (
        <div className="mt-3 rounded-lg h-10 flex items-center px-3" style={{ background: bg, border: '1.5px solid #dfe3e6' }}>
          <span className="text-sm italic" style={{ color: '#abadaf' }}>{q.placeholder || 'Short answer…'}</span>
        </div>
      );
    case 'matrix':
      return (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left py-1 pr-2 font-normal" style={{ color: '#abadaf', width: '35%' }}></th>
                {(q.columns || []).slice(0, 4).map((col, i) => (
                  <th key={i} className="py-1 px-1 text-center font-semibold" style={{ color: '#595c5e' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.rows || []).slice(0, 3).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? bg : 'transparent' }}>
                  <td className="py-1.5 pr-2 font-medium" style={{ color: '#595c5e' }}>{row}</td>
                  {(q.columns || []).slice(0, 4).map((_, j) => (
                    <td key={j} className="py-1.5 px-1 text-center">
                      <div className="w-3.5 h-3.5 rounded-full border-2 mx-auto" style={{ borderColor: '#dfe3e6' }} />
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
        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: bg, border: '1px solid #dfe3e6' }}>
          <Icon name="calendar_today" size={16} style={{ color: '#abadaf' }} />
          <span className="text-sm" style={{ color: '#abadaf' }}>
            {q.dateType === 'time' ? 'HH:MM' : q.dateType === 'datetime' ? 'DD/MM/YYYY  HH:MM' : 'DD / MM / YYYY'}
          </span>
        </div>
      );
    case 'statement':
      return (
        <div className="mt-2 h-px rounded" style={{ background: 'linear-gradient(90deg, #2a4bd9 0%, transparent 100%)', opacity: 0.2 }} />
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
          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: '#dfe3e6' }} />
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
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(42,75,217,0.08)', color: '#2a4bd9' }}>
                <Icon name="schema" size={10} />skip
              </span>
            )}
            {hasDisplayLogic && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(5,150,105,0.08)', color: '#059669' }}>
                <Icon name="visibility" size={10} />conditional
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1" style={{ opacity: hovered || selected ? 1 : 0, transition: 'opacity 0.15s' }}>
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(q.id); }}
              className="p-1.5 rounded-lg transition-colors" title="Duplicate"
              onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f3'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <Icon name="content_copy" size={15} style={{ color: '#9a9d9f' }} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(q.id); }}
              className="p-1.5 rounded-lg transition-colors" title="Delete"
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fff0f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <Icon name="delete" size={15} style={{ color: '#b41340' }} />
            </button>
          </div>
        </div>

        {/* Question text */}
        {q.type === 'statement' ? (
          <h3 className="text-lg font-extrabold font-headline" style={{ color: '#2c2f31' }}>{q.question || 'Section Title'}</h3>
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); setEditingText(true); }}
            className="cursor-text"
          >
            {editingText ? (
              <textarea
                ref={titleRef}
                value={q.question}
                onChange={(e) => onUpdate(q.id, { question: e.target.value })}
                onBlur={() => setEditingText(false)}
                rows={2}
                className="w-full resize-none text-base font-semibold outline-none bg-surface-container-low rounded-lg px-3 py-2 font-headline"
                style={{ border: 'none', color: '#2c2f31' }}
              />
            ) : (
              <p className="text-base font-semibold font-headline leading-snug"
                style={{ color: q.question ? '#2c2f31' : '#abadaf' }}>
                {q.question || 'Click to enter question text…'}
              </p>
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
          <div className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 text-[10px] font-bold"
            style={{ background: '#e5e9eb', color: '#595c5e' }}>{i + 1}</div>
          <input
            value={opt}
            onChange={(e) => edit(i, e.target.value)}
            className="flex-1 text-sm px-2.5 py-1.5 rounded-lg outline-none"
            style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }}
          />
          <button onClick={() => remove(i)} className="p-1 rounded transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff0f0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <Icon name="close" size={14} style={{ color: '#b41340' }} />
          </button>
        </div>
      ))}
      <button onClick={add}
        className="w-full text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        style={{ background: '#f5f7f9', color: '#2a4bd9', border: '1px dashed #c7d2fe' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#e0e7ff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f7f9'; }}>
        <Icon name="add" size={14} /> Add option
      </button>
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
        <div className="text-xs font-bold mb-2" style={{ color: '#595c5e' }}>Rows</div>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={r} onChange={(e) => editRow(i, e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
              <button onClick={() => removeRow(i)}>
                <Icon name="close" size={13} style={{ color: '#b41340' }} />
              </button>
            </div>
          ))}
          <button onClick={addRow}
            className="text-xs font-bold text-primary flex items-center gap-1 px-2 py-1.5">
            <Icon name="add" size={13} /> Add row
          </button>
        </div>
      </div>
      <div>
        <div className="text-xs font-bold mb-2" style={{ color: '#595c5e' }}>Columns</div>
        <div className="space-y-1.5">
          {columns.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={c} onChange={(e) => editCol(i, e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
              <button onClick={() => removeCol(i)}>
                <Icon name="close" size={13} style={{ color: '#b41340' }} />
              </button>
            </div>
          ))}
          <button onClick={addCol}
            className="text-xs font-bold text-primary flex items-center gap-1 px-2 py-1.5">
            <Icon name="add" size={13} /> Add column
          </button>
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
        <div key={rule.id} className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(42,75,217,0.04)', border: '1px solid rgba(42,75,217,0.12)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#2a4bd9' }}>If answer…</span>
            <button onClick={() => removeRule(rule.id)}>
              <Icon name="close" size={14} style={{ color: '#b41340' }} />
            </button>
          </div>
          <select value={rule.condition.operator} onChange={(e) => updateCond(rule.id, { operator: e.target.value })}
            className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
            style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }}>
            {OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>
          {!noValueNeeded(rule.condition.operator) && (
            <input type="text" value={rule.condition.value} onChange={(e) => updateCond(rule.id, { value: e.target.value })}
              placeholder="Value…"
              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
              style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#2a4bd9' }}>Then…</span>
            <select value={rule.destination} onChange={(e) => updateRule(rule.id, { destination: e.target.value })}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
              style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }}>
              {others.map((x, i) => (
                <option key={x.id} value={x.id}>Jump to Q{allQuestions.indexOf(x) + 1}: {x.question.slice(0, 40) || `(Q${allQuestions.indexOf(x) + 1})`}</option>
              ))}
              <option value="END_SURVEY">End survey</option>
            </select>
          </div>
        </div>
      ))}
      <button onClick={addRule}
        className="w-full text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5"
        style={{ background: 'rgba(42,75,217,0.05)', color: '#2a4bd9', border: '1px dashed rgba(42,75,217,0.2)' }}>
        <Icon name="add" size={14} /> Add skip rule
      </button>
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
      <button onClick={() => onChange({ sourceQuestionId: others[0]?.id || '', operator: 'eq', value: '' })}
        className="w-full text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
        style={{ background: 'rgba(5,150,105,0.05)', color: '#059669', border: '1px dashed rgba(5,150,105,0.2)' }}>
        <Icon name="add" size={14} /> Add display condition
      </button>
    );
  }

  const qIndex = (id) => allQuestions.findIndex((x) => x.id === id);

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(5,150,105,0.04)', border: '1px solid rgba(5,150,105,0.12)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#059669' }}>Show only if…</span>
        <button onClick={() => onChange(null)}><Icon name="close" size={14} style={{ color: '#b41340' }} /></button>
      </div>
      <select value={dl.sourceQuestionId} onChange={(e) => onChange({ ...dl, sourceQuestionId: e.target.value })}
        className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
        style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }}>
        {others.map((x) => (
          <option key={x.id} value={x.id}>Q{qIndex(x) + 1}: {x.question.slice(0, 40) || `(Q${qIndex(x) + 1})`}</option>
        ))}
      </select>
      <select value={dl.operator} onChange={(e) => onChange({ ...dl, operator: e.target.value })}
        className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
        style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }}>
        {OPERATORS.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
      </select>
      {dl.operator !== 'answered' && (
        <input type="text" value={dl.value} onChange={(e) => onChange({ ...dl, value: e.target.value })}
          placeholder="Value…" className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
          style={{ background: '#f5f7f9', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
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
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: '#fafbfc' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
        style={{ background: '#fafbfc', borderBottom: '1px solid rgba(171,173,175,0.1)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>
            <Icon name={meta.icon} size={15} />
          </div>
          <span className="text-sm font-extrabold font-headline" style={{ color: '#2c2f31' }}>Properties</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg"
          onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f3'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <Icon name="close" size={18} style={{ color: '#9a9d9f' }} />
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
        {/* Question text */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-1.5" style={{ color: '#9a9d9f' }}>Question Text</label>
          <textarea value={q.question} onChange={(e) => u({ question: e.target.value })}
            rows={3} placeholder="Enter your question…"
            className="w-full resize-none text-sm px-3 py-2.5 rounded-xl outline-none"
            style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
        </div>

        {/* Question type */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest block mb-1.5" style={{ color: '#9a9d9f' }}>Question Type</label>
          <select value={q.type} onChange={(e) => {
            const newType = e.target.value;
            const fresh = createQuestion(newType);
            onUpdate(q.id, { ...fresh, id: q.id, question: q.question, required: q.required, skipLogic: q.skipLogic || [], displayLogic: q.displayLogic });
          }}
            className="w-full text-sm px-3 py-2.5 rounded-xl outline-none"
            style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }}>
            {TYPES_LIST.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Required toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: '#2c2f31' }}>Required</div>
            <div className="text-xs" style={{ color: '#9a9d9f' }}>Respondent must answer</div>
          </div>
          <button onClick={() => u({ required: !q.required })}
            className="w-12 h-6 rounded-full relative transition-all"
            style={{ background: q.required ? '#2a4bd9' : '#dfe3e6' }}>
            <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
              style={{ left: q.required ? 'calc(100% - 1.25rem)' : '0.25rem' }} />
          </button>
        </div>

        {/* Type-specific settings */}
        {(q.type === 'rating') && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <label className="text-[10px] font-black uppercase tracking-widest block" style={{ color: '#9a9d9f' }}>Scale Max</label>
            <div className="flex gap-2">
              {[5, 7, 10].map((n) => (
                <button key={n} onClick={() => u({ scaleMax: n })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{ background: q.scaleMax === n ? '#2a4bd9' : '#f5f7f9', color: q.scaleMax === n ? 'white' : '#595c5e', border: '1px solid ' + (q.scaleMax === n ? '#2a4bd9' : '#dfe3e6') }}>
                  1–{n}
                </button>
              ))}
            </div>
            <label className="text-[10px] font-black uppercase tracking-widest block" style={{ color: '#9a9d9f' }}>Display Style</label>
            <div className="flex gap-2">
              {['stars','numbers'].map((s) => (
                <button key={s} onClick={() => u({ ratingStyle: s })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all"
                  style={{ background: q.ratingStyle === s ? '#2a4bd9' : '#f5f7f9', color: q.ratingStyle === s ? 'white' : '#595c5e', border: '1px solid ' + (q.ratingStyle === s ? '#2a4bd9' : '#dfe3e6') }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {(q.type === 'nps') && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>Low end label</label>
              <input value={q.labelLow || ''} onChange={(e) => u({ labelLow: e.target.value })} placeholder="Not at all likely"
                className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>High end label</label>
              <input value={q.labelHigh || ''} onChange={(e) => u({ labelHigh: e.target.value })} placeholder="Extremely likely"
                className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
            </div>
          </div>
        )}

        {(q.type === 'csat') && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <label className="text-[10px] font-black uppercase tracking-widest block" style={{ color: '#9a9d9f' }}>Display Style</label>
            <div className="flex gap-2">
              {[['emoji', '😊 Emoji'], ['stars', '⭐ Stars'], ['numbers', '1–5 Numbers']].map(([s, label]) => (
                <button key={s} onClick={() => u({ csatStyle: s })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{ background: q.csatStyle === s ? '#d97706' : '#f5f7f9', color: q.csatStyle === s ? 'white' : '#595c5e', border: '1px solid ' + (q.csatStyle === s ? '#d97706' : '#dfe3e6') }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(q.type === 'slider') && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <div className="grid grid-cols-2 gap-2">
              {[['min', 'Min'], ['max', 'Max'], ['step', 'Step']].map(([k, l]) => (
                <div key={k}>
                  <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>{l}</label>
                  <input type="number" value={q[k] ?? ''} onChange={(e) => u({ [k]: Number(e.target.value) })}
                    className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                    style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>Low label</label>
              <input value={q.labelLow || ''} onChange={(e) => u({ labelLow: e.target.value })}
                className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>High label</label>
              <input value={q.labelHigh || ''} onChange={(e) => u({ labelHigh: e.target.value })}
                className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
            </div>
          </div>
        )}

        {(['multiple_choice','checkbox','dropdown','ranking'].includes(q.type)) && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <label className="text-[10px] font-black uppercase tracking-widest block" style={{ color: '#9a9d9f' }}>Options</label>
            <OptionsEditor options={q.options || []} onChange={(opts) => u({ options: opts })} />
            {(q.type === 'multiple_choice' || q.type === 'checkbox') && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: '#595c5e' }}>Allow "Other"</span>
                <button onClick={() => u({ allowOther: !q.allowOther })}
                  className="w-10 h-5 rounded-full relative transition-all"
                  style={{ background: q.allowOther ? '#2a4bd9' : '#dfe3e6' }}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: q.allowOther ? 'calc(100% - 1.1rem)' : '0.15rem' }} />
                </button>
              </div>
            )}
            {q.type === 'checkbox' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>Max selections</label>
                <input type="number" min={1} value={q.maxSelections || ''} onChange={(e) => u({ maxSelections: e.target.value ? Number(e.target.value) : null })}
                  placeholder="No limit"
                  className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                  style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
              </div>
            )}
          </div>
        )}

        {q.type === 'matrix' && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <RowsColumnsEditor
              rows={q.rows || []} columns={q.columns || []}
              onRowsChange={(r) => u({ rows: r })} onColumnsChange={(c) => u({ columns: c })} />
            <label className="text-[10px] font-black uppercase tracking-widest block" style={{ color: '#9a9d9f' }}>Cell type</label>
            <div className="flex gap-2">
              {['radio','checkbox'].map((t) => (
                <button key={t} onClick={() => u({ matrixType: t })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all"
                  style={{ background: q.matrixType === t ? '#6d28d9' : '#f5f7f9', color: q.matrixType === t ? 'white' : '#595c5e', border: '1px solid ' + (q.matrixType === t ? '#6d28d9' : '#dfe3e6') }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {(q.type === 'open_text' || q.type === 'short_text') && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>Placeholder text</label>
              <input value={q.placeholder || ''} onChange={(e) => u({ placeholder: e.target.value })}
                className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>Max characters</label>
              <input type="number" value={q.maxLength || ''} onChange={(e) => u({ maxLength: e.target.value ? Number(e.target.value) : null })}
                placeholder="No limit"
                className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }} />
            </div>
            {q.type === 'short_text' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest block mb-1" style={{ color: '#9a9d9f' }}>Validation</label>
                <select value={q.validation || ''} onChange={(e) => u({ validation: e.target.value || null })}
                  className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
                  style={{ background: 'white', border: '1px solid #dfe3e6', color: '#2c2f31' }}>
                  <option value="">None</option>
                  <option value="email">Email address</option>
                  <option value="url">URL</option>
                  <option value="number">Number only</option>
                  <option value="phone">Phone number</option>
                </select>
              </div>
            )}
          </div>
        )}

        {q.type === 'date' && (
          <div className="space-y-3">
            <div className="h-px" style={{ background: '#eef1f3' }} />
            <label className="text-[10px] font-black uppercase tracking-widest block" style={{ color: '#9a9d9f' }}>Date Type</label>
            <div className="flex gap-2">
              {[['date', 'Date'], ['time', 'Time'], ['datetime', 'Date & Time']].map(([t, label]) => (
                <button key={t} onClick={() => u({ dateType: t })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{ background: q.dateType === t ? '#0f766e' : '#f5f7f9', color: q.dateType === t ? 'white' : '#595c5e', border: '1px solid ' + (q.dateType === t ? '#0f766e' : '#dfe3e6') }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skip Logic */}
        <div>
          <div className="h-px mb-4" style={{ background: '#eef1f3' }} />
          <label className="text-[10px] font-black uppercase tracking-widest block mb-3 flex items-center gap-1.5" style={{ color: '#9a9d9f' }}>
            <Icon name="schema" size={12} /> Skip Logic
          </label>
          <SkipLogicEditor q={q} allQuestions={allQuestions} onChange={(sl) => u({ skipLogic: sl })} />
        </div>

        {/* Display Logic */}
        <div>
          <div className="h-px mb-4" style={{ background: '#eef1f3' }} />
          <label className="text-[10px] font-black uppercase tracking-widest block mb-3 flex items-center gap-1.5" style={{ color: '#9a9d9f' }}>
            <Icon name="visibility" size={12} /> Display Condition
          </label>
          <DisplayLogicEditor q={q} allQuestions={allQuestions} onChange={(dl) => u({ displayLogic: dl })} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW MODE
// ─────────────────────────────────────────────────────────────────────────────
function PreviewMode({ questions, title, onClose }) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers]  = useState({});
  const [done, setDone]        = useState(false);
  const q = questions[current];

  const advance = () => {
    // Evaluate skip logic
    const rule = (q?.skipLogic || []).find((r) => {
      const val = answers[q.id];
      const { operator, value } = r.condition;
      const num = Number(val);
      const cmp = Number(value);
      if (operator === 'answered')     return val !== undefined && val !== '';
      if (operator === 'not_answered') return val === undefined || val === '';
      if (operator === 'eq')           return String(val) === String(value);
      if (operator === 'neq')          return String(val) !== String(value);
      if (operator === 'lt')           return !isNaN(num) && num < cmp;
      if (operator === 'lte')          return !isNaN(num) && num <= cmp;
      if (operator === 'gt')           return !isNaN(num) && num > cmp;
      if (operator === 'gte')          return !isNaN(num) && num >= cmp;
      if (operator === 'contains')     return String(val).includes(String(value));
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full max-w-xl mx-4 rounded-3xl overflow-hidden" style={{ background: 'white', boxShadow: '0 40px 100px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: '#eef1f3' }}>
          <Icon name="close" size={18} style={{ color: '#595c5e' }} />
        </button>

        <div className="h-1 w-full" style={{ background: '#eef1f3' }}>
          <div className="h-full transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%`, background: 'linear-gradient(90deg, #2a4bd9, #8329c8)' }} />
        </div>

        <div className="p-10">
          {done ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-extrabold font-headline" style={{ color: '#2c2f31' }}>Survey complete!</h2>
              <p className="mt-2 text-sm" style={{ color: '#9a9d9f' }}>This was a preview. In production, responses would be saved.</p>
              <button onClick={onClose} className="mt-6 px-6 py-3 rounded-xl text-white font-bold" style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>Close Preview</button>
            </div>
          ) : q ? (
            <>
              <div className="mb-2 text-xs font-bold" style={{ color: '#abadaf' }}>
                Question {current + 1} of {questions.filter((x) => x.type !== 'statement').length}
              </div>
              {q.type === 'statement' ? (
                <h2 className="text-2xl font-extrabold font-headline mb-6" style={{ color: '#2c2f31' }}>{q.question}</h2>
              ) : (
                <>
                  <h2 className="text-xl font-extrabold font-headline mb-6" style={{ color: '#2c2f31' }}>
                    {q.question} {q.required && <span style={{ color: '#b41340' }}>*</span>}
                  </h2>
                  <TypePreview q={q} />
                </>
              )}
              <div className="flex justify-between mt-8">
                <button onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30"
                  style={{ background: '#eef1f3', color: '#595c5e' }}>← Back</button>
                <button onClick={advance}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
                  {current === questions.length - 1 ? 'Submit' : 'Continue →'}
                </button>
              </div>
            </>
          ) : null}
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
      <h2 className="text-2xl font-extrabold font-headline mb-8" style={{ color: '#2c2f31' }}>Survey Flow</h2>
      <div className="space-y-2">
        {questions.map((q, i) => {
          const meta = QTYPE_META[q.type] || QTYPE_META.open_text;
          const hasLogic = (q.skipLogic?.length > 0) || q.displayLogic;
          return (
            <div key={q.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(171,173,175,0.15)' }}>
              <div className="flex items-center gap-3 px-5 py-3.5" style={{ background: 'white' }}>
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>Q{i + 1}</span>
                <span className="text-xs font-semibold flex-1 truncate" style={{ color: '#2c2f31' }}>{q.question || '(untitled)'}</span>
                <span className="text-[10px] font-bold" style={{ color: '#abadaf' }}>{meta.label}</span>
              </div>
              {hasLogic && (
                <div className="px-5 py-3 space-y-1.5" style={{ background: '#f5f7f9', borderTop: '1px solid rgba(171,173,175,0.1)' }}>
                  {q.displayLogic && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#059669' }}>
                      <Icon name="visibility" size={12} />
                      <span>Show only if Q{qIndex(q.displayLogic.sourceQuestionId) + 1} {q.displayLogic.operator} {q.displayLogic.value}</span>
                    </div>
                  )}
                  {(q.skipLogic || []).map((rule, ri) => (
                    <div key={ri} className="flex items-center gap-2 text-xs" style={{ color: '#2a4bd9' }}>
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
                <div className="flex items-center px-5 py-1" style={{ background: '#f5f7f9', borderTop: '1px solid rgba(171,173,175,0.08)' }}>
                  <Icon name="arrow_downward" size={12} style={{ color: '#dfe3e6' }} />
                  <span className="text-[10px] ml-1" style={{ color: '#dfe3e6' }}>continue</span>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 px-5 py-3 rounded-2xl" style={{ background: 'white', border: '1px solid rgba(171,173,175,0.15)' }}>
          <Icon name="flag" fill={1} size={14} style={{ color: '#059669' }} />
          <span className="text-xs font-bold" style={{ color: '#059669' }}>End of survey</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function SurveyBuilderPage({ onNavigate }) {
  const pending = useMemo(() => pageStore.consumePendingBuilderData(), []);
  const api = useApi();

  const [questions, setQuestions] = useState(() => {
    if (pending?.questions?.length) return pending.questions.map(mapAiToBuilderQuestion);
    return [createQuestion('nps'), createQuestion('open_text')];
  });
  const [surveyTitle, setSurveyTitle] = useState(pending?.title?.slice(0, 80) || 'New Survey');
  const [surveyId,    setSurveyId]    = useState(pending?.id || null);
  const [selectedId,  setSelectedId]  = useState(null);
  const [mode,        setMode]        = useState('build'); // 'build' | 'preview' | 'logic'
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [launching,        setLaunching]        = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const { createSurvey, updateSurvey, publishSurvey } = useSurveys();

  // Drag state via refs (no re-renders mid-drag)
  const dragIndexRef = useRef(null);
  const [dragOver,    setDragOver]    = useState(null);

  const selectedQ = questions.find((q) => q.id === selectedId) || null;
  const panelOpen = !!selectedId && mode === 'build';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const addQuestion  = useCallback((type) => {
    const q = createQuestion(type);
    setQuestions((prev) => [...prev, q]);
    setSelectedId(q.id);
    // Scroll to end
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  }, []);

  const updateQuestion = useCallback((id, patch) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const deleteQuestion = useCallback((id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const duplicateQuestion = useCallback((id) => {
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
    setQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleAiCommand = useCallback(async (message) => {
    try {
      const result = await api.refineSurvey(questions, message, { surveyTypeId: pending?.surveyTypeId, intent: surveyTitle });
      if (result.questions) setQuestions(result.questions.map(mapAiToBuilderQuestion));
    } catch (err) {
      console.error('AI copilot error:', err.message);
    }
  }, [api, questions, pending, surveyTitle]);

  const buildPayload = () => ({
    title: surveyTitle,
    questions: questions.map(({ id, type, question, required, skipLogic, displayLogic, ...rest }) => ({
      id,
      type,
      question:     question || '',
      required:     !!required,
      skipLogic:    skipLogic || [],
      displayLogic: displayLogic || null,
      ...rest, // preserves all type-specific fields (options, rows, columns, scaleMax, etc.)
    })),
    survey_type_id: pending?.surveyTypeId || null,
  });

  const doSave = async () => {
    const payload = buildPayload();
    if (surveyId) {
      // Update existing — never creates a duplicate row
      await updateSurvey(surveyId, { title: payload.title, questions: payload.questions });
      return { id: surveyId };
    }
    // First save — create new row
    const result = await createSurvey(payload);
    if (result?.id) setSurveyId(result.id);
    return result;
  };

  const handleSave = async () => {
    setSaving(true);
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const survey = await doSave();
      const id = survey?.id || surveyId;
      if (id) await publishSurvey(id);
      setShowPublishModal(false);
      onNavigate(ROUTES.SURVEYS);
    } finally { setLaunching(false); }
  };

  // ── Layout constants ──────────────────────────────────────────────────────
  const SIDENAV_W  = 256; // 16rem
  const PALETTE_W  = 224; // 14rem
  const PROPS_W    = 320; // 20rem
  const TOPNAV_H   = 64;

  return (
    <div className="flex min-h-screen font-body" style={{ background: '#f5f7f9' }}>
      <SideNav currentPage={ROUTES.SURVEYS} onNavigate={onNavigate} />

      {/* Preview overlay */}
      {mode === 'preview' && (
        <PreviewMode questions={questions} title={surveyTitle} onClose={() => setMode('build')} />
      )}

      {/* Publish confirmation */}
      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onConfirm={handleLaunch}
        busy={launching}
        surveyTitle={surveyTitle}
      />

      {/* ── Question Type Palette ── */}
      <aside
        className="fixed z-30 overflow-hidden"
        style={{
          left:    SIDENAV_W,
          top:     TOPNAV_H,
          width:   PALETTE_W,
          height:  `calc(100vh - ${TOPNAV_H}px)`,
          borderRight: '1px solid rgba(171,173,175,0.12)',
        }}
      >
        <QuestionPalette onAdd={addQuestion} onAiCommand={handleAiCommand} />
      </aside>

      {/* ── Top Nav ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-5 gap-4"
        style={{ background: 'white', borderBottom: '1px solid rgba(171,173,175,0.12)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
      >
        <div className="flex items-center gap-3" style={{ marginLeft: SIDENAV_W + PALETTE_W }}>
          <button onClick={() => onNavigate(ROUTES.SURVEYS)}
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <Icon name="arrow_back" size={18} style={{ color: '#595c5e' }} />
          </button>
          <input
            value={surveyTitle}
            onChange={(e) => setSurveyTitle(e.target.value)}
            className="text-sm font-semibold bg-transparent outline-none text-on-surface min-w-0"
            style={{ maxWidth: 260 }}
          />
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: '#f5f7f9', border: '1px solid rgba(171,173,175,0.15)' }}>
          {[['build','edit','Build'], ['logic','schema','Logic']].map(([m, icon, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background: mode === m ? 'white' : 'transparent', color: mode === m ? '#2a4bd9' : '#9a9d9f', boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Icon name={icon} size={14} />{label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => setMode('preview')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all"
            style={{ background: '#f5f7f9', color: '#595c5e', border: '1px solid #dfe3e6' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f7f9'; }}>
            <Icon name="play_arrow" size={16} />Preview
          </button>
          <button onClick={handleSave} disabled={saving || launching}
            className="px-5 py-2 text-sm font-bold rounded-full transition-all active:scale-95 flex items-center gap-1.5"
            style={{ background: saved ? '#059669' : '#eef1f3', color: saved ? 'white' : '#595c5e', border: '1px solid ' + (saved ? '#059669' : '#dfe3e6') }}>
            {saving
              ? <><div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#595c5e', borderTopColor: 'transparent' }} />Saving…</>
              : <><Icon name={saved ? 'check' : 'save'} size={15} />{saved ? 'Saved!' : 'Save'}</>
            }
          </button>
          <button onClick={() => setShowPublishModal(true)} disabled={saving || launching}
            className="px-5 py-2 text-sm font-bold rounded-full transition-all active:scale-95 flex items-center gap-1.5 text-white"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 20px -4px rgba(5,150,105,0.3)' }}>
            <Icon name="rocket_launch" size={15} />Launch
          </button>
        </div>
      </nav>

      {/* ── Canvas ── */}
      <main
        className="flex-1"
        style={{
          marginLeft:   SIDENAV_W + PALETTE_W,
          marginRight:  panelOpen ? PROPS_W : 0,
          paddingTop:   TOPNAV_H + 24,
          paddingBottom: 120,
          transition:   'margin-right 0.3s cubic-bezier(0.4,0,0.2,1)',
          minHeight:    '100vh',
        }}
      >
        {mode === 'logic' ? (
          <LogicView questions={questions} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 space-y-4">
            {/* Question count badge */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#e0e7ff', color: '#2a4bd9' }}>
                  {questions.length} question{questions.length !== 1 ? 's' : ''}
                </span>
                {questions.some((q) => q.skipLogic?.length > 0) && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(42,75,217,0.08)', color: '#2a4bd9' }}>
                    <Icon name="schema" size={11} />Skip logic active
                  </span>
                )}
              </div>
              {selectedId && (
                <button onClick={() => setSelectedId(null)}
                  className="text-xs font-bold px-3 py-1 rounded-full transition-all"
                  style={{ background: '#eef1f3', color: '#595c5e' }}>
                  Deselect
                </button>
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
            <button
              onClick={() => addQuestion('open_text')}
              onDragOver={(e) => { e.preventDefault(); setDragOver(questions.length); }}
              onDrop={() => {
                if (dragIndexRef.current !== null) reorder(dragIndexRef.current, questions.length - 1);
                dragIndexRef.current = null;
                setDragOver(null);
              }}
              className="w-full py-5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 transition-all group"
              style={{ borderColor: dragOver === questions.length ? '#2a4bd9' : '#dfe3e6', background: dragOver === questions.length ? 'rgba(42,75,217,0.04)' : 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2a4bd9'; e.currentTarget.style.background = 'rgba(42,75,217,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#dfe3e6'; e.currentTarget.style.background = 'transparent'; }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all group-hover:scale-110"
                style={{ background: 'rgba(42,75,217,0.08)' }}>
                <Icon name="add" size={22} style={{ color: '#2a4bd9' }} />
              </div>
              <span className="text-sm font-bold" style={{ color: '#2a4bd9' }}>Add Question</span>
              <span className="text-xs" style={{ color: '#abadaf' }}>or drag a type from the left panel</span>
            </button>
          </div>
        )}
      </main>

      {/* ── Properties Panel ── */}
      <aside
        className="fixed z-30 overflow-hidden"
        style={{
          right:     0,
          top:       TOPNAV_H,
          width:     panelOpen ? PROPS_W : 0,
          height:    `calc(100vh - ${TOPNAV_H}px)`,
          transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
          borderLeft: '1px solid rgba(171,173,175,0.12)',
          background: '#fafbfc',
        }}
      >
        <div style={{ width: PROPS_W, height: '100%', overflow: 'hidden' }}>
          <PropertiesPanel
            q={selectedQ}
            allQuestions={questions}
            onUpdate={updateQuestion}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </aside>

      <BottomNav currentPage={ROUTES.SURVEYS} onNavigate={onNavigate} />

      {/* Decorative glow */}
      <div className="fixed pointer-events-none -z-10 rounded-full"
        style={{ top: '-5%', right: '-10%', width: 600, height: 600, background: 'rgba(224,231,255,0.25)', filter: 'blur(150px)' }} />
    </div>
  );
}
