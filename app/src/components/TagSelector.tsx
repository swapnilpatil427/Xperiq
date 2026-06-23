import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../lib/i18n';
import { useApi } from '../hooks/useApi';
import { TagBadge } from './TagBadge';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import type { SurveyTag } from '../lib/api';

const PRESET_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

interface TagSelectorProps {
  selectedTags: SurveyTag[];
  onAdd: (tag: SurveyTag) => void;
  onRemove: (tagId: string) => void;
  maxTags?: number;
  placeholder?: string;
}

export function TagSelector({ selectedTags, onAdd, onRemove, maxTags = 5, placeholder }: TagSelectorProps) {
  const { t } = useTranslation();
  const api = useApi();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allTags, setAllTags] = useState<SurveyTag[]>([]);
  const [creating, setCreating] = useState(false);
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadTags = useCallback(async (q: string) => {
    try {
      const res = await api.listTags({ q });
      setAllTags(res.tags);
    } catch { /* ignore */ }
  }, [api]);

  useEffect(() => {
    loadTags('');
  }, [loadTags]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadTags(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, loadTags]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const filtered = allTags.filter(
    (tg) => !selectedTags.some((s) => s.id === tg.id)
      && tg.name.toLowerCase().includes(query.toLowerCase()),
  );

  const exactMatch = allTags.some((tg) => tg.name.toLowerCase() === query.toLowerCase());
  const showCreate = query.trim().length > 0 && !exactMatch;
  const atLimit = selectedTags.length >= maxTags;

  async function handleCreate() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const res = await api.createTag({ name: query.trim(), color: newColor });
      onAdd(res.tag);
      setQuery('');
      loadTags('');
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  function handleOpen() {
    if (atLimit) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input area */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-10 px-2.5 py-2 rounded-xl border bg-white cursor-text transition-all',
          open ? 'border-primary ring-2 ring-primary/15' : 'border-[#dfe3e6] hover:border-[#b0b8c4]',
          atLimit && 'cursor-default opacity-70',
        )}
        onClick={handleOpen}
      >
        {selectedTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} size="sm" removable onRemove={onRemove} />
        ))}
        {!atLimit && (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && showCreate) { e.preventDefault(); handleCreate(); }
              if (e.key === 'Escape') { setOpen(false); setQuery(''); }
              if (e.key === 'Backspace' && !query && selectedTags.length > 0) {
                onRemove(selectedTags[selectedTags.length - 1].id);
              }
            }}
            placeholder={selectedTags.length === 0 ? (placeholder ?? t('groups.searchTags')) : ''}
            className="flex-1 min-w-[100px] text-sm outline-none bg-transparent placeholder:text-muted-foreground"
          />
        )}
        {atLimit && (
          <span className="text-xs text-muted-foreground">{t('groups.tagLimitReached', { max: maxTags })}</span>
        )}
      </div>

      {/* Dropdown */}
      {open && !atLimit && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[220px] max-w-sm rounded-xl border border-[#dfe3e6] bg-white shadow-lg overflow-hidden">
          {/* Existing tags list */}
          {filtered.length > 0 && (
            <div className="py-1 max-h-[200px] overflow-y-auto">
              {filtered.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                  onClick={() => { onAdd(tag); setQuery(''); inputRef.current?.focus(); }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color }} />
                  <span className="flex-1 truncate text-on-surface">{tag.name}</span>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && !showCreate && (
            <p className="text-xs text-muted-foreground px-3 py-3">{t('groups.noTags')}</p>
          )}

          {/* Create new tag */}
          {showCreate && (
            <div className={cn('px-3 py-2.5', filtered.length > 0 && 'border-t border-[#f0f2f4]')}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Create tag
              </p>
              <div className="flex items-center gap-1.5 mb-2.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'w-5 h-5 rounded-full transition-all',
                      newColor === c ? 'ring-2 ring-offset-1 scale-110' : 'hover:scale-110',
                    )}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="w-full flex items-center gap-2 text-sm font-semibold px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                style={{ color: newColor }}
                onClick={handleCreate}
                disabled={creating}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: newColor }} />
                <span className="truncate">
                  {creating ? 'Creating…' : `Create "${query.trim()}"`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
