import { ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface LinkWithQrProps {
  label: string;
  url: string;
  qrCode?: boolean;
}

/** A link to open on this device, plus a QR code to open it on a phone. */
export function LinkWithQr({ label, url, qrCode }: LinkWithQrProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button asChild variant="outline">
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
          {label}
        </a>
      </Button>
      {qrCode && (
        <figure className="flex flex-col items-center gap-1">
          <div className="rounded-md bg-white p-2">
            <QRCodeSVG value={url} size={112} aria-label={t('channels.wizard.qrCode', { url })} />
          </div>
          <figcaption className="text-xs text-muted-foreground">
            {t('channels.wizard.scanWithPhone')}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
