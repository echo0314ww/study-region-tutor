import { useEffect } from 'react';
import type { RegionBounds } from '../../../shared/types';
import { useTranslation } from '../i18n';

interface CaptureConfirmOverlayProps {
  region: RegionBounds;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CaptureConfirmOverlay({ region, onConfirm, onCancel }: CaptureConfirmOverlayProps): JSX.Element {
  const { t } = useTranslation();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <section
      className="capture-confirm-overlay"
      aria-label={t('capture.pendingLabel')}
      onContextMenu={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="drag-capture-shade top" style={{ height: region.y }} />
      <div className="drag-capture-shade left" style={{ top: region.y, width: region.x, height: region.height }} />
      <div
        className="drag-capture-shade right"
        style={{ top: region.y, left: region.x + region.width, height: region.height }}
      />
      <div className="drag-capture-shade bottom" style={{ top: region.y + region.height }} />
      <section
        className="drag-capture-selection capture-confirm-selection"
        aria-label={t('capture.regionLabel')}
        style={{
          transform: `translate(${region.x}px, ${region.y}px)`,
          width: region.width,
          height: region.height
        }}
      >
        <div className="drag-capture-label">
          {region.width} x {region.height}
        </div>
        <div className="capture-confirm-actions" data-interactive="true">
          <button className="primary-button" type="button" onClick={onConfirm}>
            {t('toolbar.confirmCapture')}
          </button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            {t('toolbar.recapture')}
          </button>
        </div>
      </section>
    </section>
  );
}
