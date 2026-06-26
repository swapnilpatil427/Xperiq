import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { Icon } from '../Icon';
import { Button } from '@/components/ui/button';
import type { SectionDiff, DiffLine } from '../../lib/docDiff';
import { diffStats } from '../../lib/docDiff';

interface DocDiffViewerProps {
  sections: SectionDiff[];
  onLockSection: (sectionKey: string, locked: boolean) => void;
  onEditSection: (sectionKey: string, newContent: string) => void;
  readOnly?: boolean;
}

const GLASS_CARD_STYLE: React.CSSProperties = {
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  background: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(255,255,255,0.5)',
  borderRadius: '1rem',
  padding: '1.5rem',
};

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'ui-monospace', 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
  fontSize: '0.813rem',
};

function DiffLineRow({ line }: { line: DiffLine }) {
  const lineStyles: Record<DiffLine['type'], React.CSSProperties> = {
    added: {
      background: 'rgba(34,197,94,0.12)',
      borderLeft: '3px solid #16a34a',
      color: '#166534',
    },
    removed: {
      background: 'rgba(239,68,68,0.08)',
      borderLeft: '3px solid #dc2626',
      color: '#991b1b',
      textDecoration: 'line-through',
    },
    unchanged: {
      background: 'transparent',
      borderLeft: '3px solid transparent',
      color: '#6b7280',
    },
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '2px 8px',
        ...MONO_STYLE,
        ...lineStyles[line.type],
      }}
    >
      <span
        style={{
          color: '#9ca3af',
          minWidth: '2.5rem',
          textAlign: 'right',
          marginRight: '0.75rem',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {line.lineNumber}
      </span>
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{line.content}</span>
    </div>
  );
}

export function DocDiffViewer({
  sections,
  onLockSection,
  onEditSection,
  readOnly = false,
}: DocDiffViewerProps) {
  const { t } = useTranslation();
  const [editModes, setEditModes] = useState<Map<string, boolean>>(new Map());
  const [editContents, setEditContents] = useState<Map<string, string>>(new Map());

  const stats = diffStats(sections);

  function toggleEdit(sectionKey: string, initialContent: string) {
    setEditModes((prev) => {
      const next = new Map(prev);
      if (next.get(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.set(sectionKey, true);
        setEditContents((ec) => {
          const ecNext = new Map(ec);
          if (!ecNext.has(sectionKey)) ecNext.set(sectionKey, initialContent);
          return ecNext;
        });
      }
      return next;
    });
  }

  function saveEdit(sectionKey: string) {
    const content = editContents.get(sectionKey) ?? '';
    onEditSection(sectionKey, content);
    setEditModes((prev) => {
      const next = new Map(prev);
      next.delete(sectionKey);
      return next;
    });
  }

  function cancelEdit(sectionKey: string) {
    setEditModes((prev) => {
      const next = new Map(prev);
      next.delete(sectionKey);
      return next;
    });
  }

  if (sections.length === 0) {
    return (
      <div
        style={{ padding: '3rem 1rem', textAlign: 'center', color: '#9ca3af' }}
      >
        {t('admin.docPipeline.noSectionsToReview')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={GLASS_CARD_STYLE}
      >
        <span style={{ fontSize: '0.875rem', color: '#374151' }}>
          {t('admin.docPipeline.linesAddedRemoved', {
            added: stats.added.toLocaleString(),
            removed: stats.removed.toLocaleString(),
            sections: sections.length.toLocaleString(),
          })}
        </span>
        {stats.lockedCount > 0 && (
          <span
            style={{
              marginLeft: '1rem',
              fontSize: '0.813rem',
              color: '#6b7280',
            }}
          >
            {stats.lockedCount} section{stats.lockedCount !== 1 ? 's' : ''} locked
          </span>
        )}
      </motion.div>

      {/* Section cards */}
      {sections.map((section, idx) => {
        const isEditing = editModes.get(section.sectionKey) ?? false;
        const editContent = editContents.get(section.sectionKey) ?? section.newContent;

        return (
          <motion.div
            key={section.sectionKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
            style={{
              ...GLASS_CARD_STYLE,
              padding: 0,
              overflow: 'hidden',
              borderLeft: section.hasChanges
                ? '3px solid var(--color-primary)'
                : '1px solid rgba(255,255,255,0.5)',
            }}
          >
            {/* Section header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                <h4
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: '#111827',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {section.heading}
                </h4>
                {section.isLocked && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: '999px',
                      padding: '0.125rem 0.5rem',
                      fontSize: '0.75rem',
                      color: '#92400e',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="lock" size={12} />
                    {t('admin.docPipeline.sectionLocked', {
                      name: section.lockedBy ?? 'someone',
                    })}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              {!readOnly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleEdit(section.sectionKey, section.newContent)}
                    style={{ fontSize: '0.813rem' }}
                  >
                    <Icon name="edit" size={14} style={{ marginRight: '0.25rem' }} />
                    {t('admin.docPipeline.editDoc')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onLockSection(section.sectionKey, !section.isLocked)}
                    style={{ fontSize: '0.813rem' }}
                  >
                    <Icon
                      name={section.isLocked ? 'lock_open' : 'lock'}
                      size={14}
                      style={{ marginRight: '0.25rem' }}
                    />
                    {section.isLocked
                      ? t('admin.docPipeline.unlockSection')
                      : t('admin.docPipeline.lockSection')}
                  </Button>
                </div>
              )}
            </div>

            {/* Edit mode */}
            {isEditing ? (
              <div style={{ padding: '1rem 1.25rem' }}>
                <textarea
                  value={editContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditContents((prev) => {
                      const next = new Map(prev);
                      next.set(section.sectionKey, val);
                      return next;
                    });
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.03)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    width: '100%',
                    minHeight: '200px',
                    resize: 'vertical',
                    ...MONO_STYLE,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => saveEdit(section.sectionKey)}
                  >
                    {t('common.save')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelEdit(section.sectionKey)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              /* Diff lines */
              <div style={{ padding: '0.5rem 0' }}>
                {section.lines.length === 0 ? (
                  <div
                    style={{
                      padding: '0.75rem 1.25rem',
                      fontSize: '0.813rem',
                      color: '#9ca3af',
                      ...MONO_STYLE,
                    }}
                  >
                    (empty section)
                  </div>
                ) : (
                  section.lines.map((line) => (
                    <DiffLineRow key={`${section.sectionKey}-${line.lineNumber}`} line={line} />
                  ))
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
