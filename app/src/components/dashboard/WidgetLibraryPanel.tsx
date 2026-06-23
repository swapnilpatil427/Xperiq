import { useTranslation } from '../../lib/i18n';
import { Icon } from '../Icon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { WIDGET_REGISTRY } from '../../types/dashboard';
import type { WidgetType } from '../../types/dashboard';

interface WidgetLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onAdd: (type: WidgetType, colSpan: number) => void;
  existingTypes: WidgetType[];
}

/** Slide-in catalog of available widgets. */
export function WidgetLibraryPanel({ open, onClose, onAdd, existingTypes }: WidgetLibraryPanelProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-80 sm:w-96 flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('dashboard.widgetLibrary.title')}</SheetTitle>
          <SheetDescription>{t('dashboard.widgetLibrary.subtitle')}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto flex-1 -mr-2 pr-2">
          {WIDGET_REGISTRY.map((widget) => {
            const added = existingTypes.includes(widget.type);
            return (
              <div
                key={widget.type}
                className="rounded-xl border border-[var(--color-outline)]/20 bg-[var(--color-surface-raised)] p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${widget.color}33` }}>
                    <Icon name={widget.icon} size={20} style={{ color: widget.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-on-surface">{widget.label}</p>
                      {widget.surveyRequired && (
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">
                          Survey required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-on-surface-variant)] line-clamp-2 mt-0.5">{widget.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'secondary' : 'default'}
                    className="flex-shrink-0"
                    onClick={() => { onAdd(widget.type, widget.defaultColSpan); onClose(); }}
                  >
                    {added ? t('dashboard.widgetLibrary.added') : t('dashboard.widgetLibrary.add')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
