import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// Triggers a browser download of the generated Blob.
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Export a survey's Crystal insight report as PDF, PowerPoint, or printable HTML.
// Native PDF/PPTX require the server-side exporters (puppeteer/pptxgenjs); when
// those aren't installed the server returns HTML and we save that instead.
export function ReportExportMenu({ surveyId, surveyTitle }: { surveyId: string; surveyTitle?: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const [busy, setBusy] = useState(false);

  async function exportAs(format: 'pdf' | 'pptx' | 'html') {
    setBusy(true);
    try {
      const { blob, format: delivered } = await api.downloadReport(surveyId, format);
      const base = (surveyTitle || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);
      saveBlob(blob, `${base}.${delivered}`);
    } catch { /* surfaced by global error handling */ }
    finally { setBusy(false); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <Icon name={busy ? 'hourglass_empty' : 'download'} size={16} className="mr-1.5" />
          {t('report.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportAs('pdf')}>
          <Icon name="picture_as_pdf" size={16} className="mr-2" />{t('report.pdf')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs('pptx')}>
          <Icon name="slideshow" size={16} className="mr-2" />{t('report.pptx')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs('html')}>
          <Icon name="html" size={16} className="mr-2" />{t('report.html')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
