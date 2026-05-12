import { useEffect } from 'react';
import type { RegionBounds } from '../../../shared/types';

interface CaptureConfirmOverlayProps {
  region: RegionBounds;
  onCancel: () => void;
}

export function CaptureConfirmOverlay({ region, onCancel }: CaptureConfirmOverlayProps): JSX.Element {
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
      aria-label="待确认截图区域"
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
        aria-label="截图区域"
        style={{
          transform: `translate(${region.x}px, ${region.y}px)`,
          width: region.width,
          height: region.height
        }}
      >
        <div className="drag-capture-label">
          {region.width} x {region.height}
        </div>
      </section>
    </section>
  );
}
