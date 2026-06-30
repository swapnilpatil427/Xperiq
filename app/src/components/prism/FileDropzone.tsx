import { useCallback, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '../Icon';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../lib/i18n';

export interface FileDropzoneMeta {
  fileRef: string;
  filename: string;
  sizeBytes: number;
  detectedFormat: string;
  /** Auto-detected source platform (e.g. 'qualtrics', 'csv'). */
  detectedPlatform?: string;
}

interface FileDropzoneProps {
  /** Comma-separated accepted extensions, e.g. '.csv,.xlsx,.sav,.json'. */
  accept: string;
  /** Maximum file size in megabytes. */
  maxMb: number;
  /** Called once a single file is uploaded and a fileRef is returned. */
  onUploaded: (fileRef: string, meta: FileDropzoneMeta) => void;
  /** Called when multiple files finish uploading (only when `multiple`). */
  onUploadedMany?: (metas: FileDropzoneMeta[]) => void;
  /** Called when validation or upload fails. */
  onError?: (message: string) => void;
  /** Optional prompt override; defaults to the generic dropzone prompt. */
  prompt?: string;
  /** Accept and upload several files at once (global auto-detect import). */
  multiple?: boolean;
  /** Surface each file's detected format + platform in the success state. */
  showDetected?: boolean;
  className?: string;
}

type Phase = 'idle' | 'uploading' | 'success' | 'error';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Human-readable byte size, e.g. "2.4 MB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Reusable drag-and-drop + click-to-pick upload zone. Validates extension and
 * size client-side, uploads via api.uploadPrismFile with progress, and reports
 * the resulting fileRef. Keyboard accessible (role=button, Enter/Space) and
 * respects prefers-reduced-motion. Brand-reactive via var(--color-primary).
 */
export function FileDropzone({
  accept,
  maxMb,
  onUploaded,
  onUploadedMany,
  onError,
  prompt,
  multiple = false,
  showDetected = false,
  className,
}: FileDropzoneProps) {
  const { t } = useTranslation();
  const api = useApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const [phase, setPhase] = useState<Phase>('idle');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metas, setMetas] = useState<FileDropzoneMeta[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const acceptedExts = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  const fail = useCallback((message: string) => {
    setPhase('error');
    setErrorMsg(message);
    onError?.(message);
  }, [onError]);

  /** Validate, then upload a single file → its meta (or null if it failed). */
  const uploadOne = useCallback(async (file: File): Promise<FileDropzoneMeta | null> => {
    const ext = extensionOf(file.name);
    if (acceptedExts.length && !acceptedExts.includes(ext)) {
      fail(t('prism.dropzone.errorType', { accept: acceptedExts.join(', ') }));
      return null;
    }
    if (file.size > maxMb * 1024 * 1024) {
      fail(t('prism.dropzone.errorSize', { max: String(maxMb) }));
      return null;
    }
    const res = await api.uploadPrismFile(file, (pct) => setProgress(pct));
    return {
      fileRef: res.fileRef,
      filename: res.filename ?? file.name,
      sizeBytes: res.sizeBytes ?? file.size,
      detectedFormat: res.detectedFormat ?? ext.replace('.', ''),
      detectedPlatform: res.detectedPlatform,
    };
  }, [acceptedExts, api, fail, maxMb, t]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMsg(null);
    setPhase('uploading');
    setProgress(0);
    try {
      const uploaded: FileDropzoneMeta[] = [];
      for (const file of files) {
        const meta = await uploadOne(file);
        if (!meta) return; // uploadOne already reported the failure
        uploaded.push(meta);
      }
      setMetas(uploaded);
      setPhase('success');
      if (multiple) onUploadedMany?.(uploaded);
      else onUploaded(uploaded[0].fileRef, uploaded[0]);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }, [uploadOne, multiple, onUploaded, onUploadedMany, fail]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void handleFiles(multiple ? files : files.slice(0, 1));
  }, [handleFiles, multiple]);

  const openPicker = useCallback(() => {
    if (phase === 'uploading') return;
    inputRef.current?.click();
  }, [phase]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  }, [openPicker]);

  const isBusy = phase === 'uploading';
  const isSuccess = phase === 'success';
  const isError = phase === 'error';

  /** "Detected: Qualtrics CSV" — only the parts the backend resolved. The
   *  platform label comes from the locale when known, else the raw key, which
   *  the i18n layer echoes back verbatim (so unknown platforms still render). */
  const detectedLabel = useCallback((m: FileDropzoneMeta): string | null => {
    if (!showDetected) return null;
    const key = m.detectedPlatform ? `prism.platformLabel.${m.detectedPlatform}` : '';
    const resolved = key ? t(key) : '';
    // i18n echoes the key on a miss — fall back to the raw platform string.
    const platform = resolved === key ? (m.detectedPlatform ?? '') : resolved;
    const format = (m.detectedFormat ?? '').toUpperCase();
    const value = [platform, format].filter(Boolean).join(' ').trim();
    return value ? t('prism.dropzone.detected', { value }) : null;
  }, [showDetected, t]);

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void handleFiles(multiple ? files : files.slice(0, 1));
          e.target.value = '';
        }}
      />

      <motion.div
        role="button"
        tabIndex={0}
        aria-label={prompt ?? t('prism.dropzone.prompt')}
        aria-describedby={statusId}
        aria-busy={isBusy}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragOver={(e) => { e.preventDefault(); if (!isBusy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isError ? 'border-destructive/60 bg-destructive/5' : 'border-border/70 hover:border-primary/50',
          isBusy && 'cursor-progress',
        )}
        style={dragging ? {
          borderColor: 'var(--color-primary)',
          background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
        } : undefined}
      >
        {/* Idle / dragging */}
        {(phase === 'idle' || dragging) && !isBusy && !isSuccess && !isError && (
          <>
            <span
              className="flex items-center justify-center w-12 h-12 rounded-2xl"
              style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}
              aria-hidden
            >
              <Icon name="upload_file" size={26} className="text-primary" />
            </span>
            <div>
              <p className="text-sm font-bold text-on-surface">{prompt ?? t('prism.dropzone.prompt')}</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {t('prism.dropzone.hint', { accept: acceptedExts.join(', '), max: String(maxMb) })}
              </p>
              {multiple && (
                <p className="text-xs text-on-surface-variant mt-0.5">{t('prism.dropzone.multiHint')}</p>
              )}
            </div>
          </>
        )}

        {/* Uploading */}
        {isBusy && (
          <>
            <Icon name="progress_activity" size={26} className="text-primary animate-spin" aria-hidden />
            <div className="w-full max-w-xs">
              <p className="text-sm font-bold text-on-surface">{t('prism.dropzone.uploading')}</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-surface-container overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${progress}%`, background: 'var(--color-primary)' }}
                />
              </div>
              <p className="text-xs text-on-surface-variant mt-1 tabular-nums">{progress}%</p>
            </div>
          </>
        )}

        {/* Success — one file or, in multiple mode, a list of detected files */}
        {isSuccess && metas.length > 0 && (
          <>
            <Icon name="check_circle" size={26} fill={1} className="text-success" aria-hidden />
            {metas.length === 1 ? (
              <div>
                <p className="text-sm font-bold text-on-surface truncate max-w-[18rem]">{metas[0].filename}</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  {formatBytes(metas[0].sizeBytes)} · {metas[0].detectedFormat.toUpperCase()}
                </p>
                {detectedLabel(metas[0]) && (
                  <p className="text-xs font-semibold text-primary mt-1">{detectedLabel(metas[0])}</p>
                )}
                <p className="text-xs text-primary font-semibold mt-1">{t('prism.dropzone.replace')}</p>
              </div>
            ) : (
              <div className="w-full max-w-sm">
                <p className="text-sm font-bold text-on-surface">{t('prism.dropzone.multiCount', { count: String(metas.length) })}</p>
                <ul className="mt-2 space-y-1 text-left">
                  {metas.map((m) => (
                    <li key={m.fileRef} className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-on-surface truncate min-w-0">{m.filename}</span>
                      {detectedLabel(m) && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 font-semibold text-primary" style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
                          {detectedLabel(m)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-primary font-semibold mt-2">{t('prism.dropzone.replace')}</p>
              </div>
            )}
          </>
        )}

        {/* Error */}
        {isError && (
          <>
            <Icon name="error" size={26} className="text-destructive" aria-hidden />
            <div>
              <p className="text-sm font-bold text-destructive">{t('prism.dropzone.errorTitle')}</p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-[20rem]">{errorMsg}</p>
              <p className="text-xs text-primary font-semibold mt-1">{t('prism.dropzone.retry')}</p>
            </div>
          </>
        )}
      </motion.div>

      {/* Polite live region for screen readers — not color-only */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {isBusy && t('prism.dropzone.uploading')}
        {isSuccess && metas.length === 1 && t('prism.dropzone.uploadedStatus', { filename: metas[0].filename })}
        {isSuccess && metas.length > 1 && t('prism.dropzone.multiCount', { count: String(metas.length) })}
        {isError && errorMsg}
      </p>
    </div>
  );
}
