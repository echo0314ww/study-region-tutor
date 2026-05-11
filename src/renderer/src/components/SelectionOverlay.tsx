import type { PointerEvent } from 'react';
import type { RegionBounds } from '../../../shared/types';
import type { DragMode } from '../uiTypes';
import { HANDLE_NAMES } from '../constants';

export interface SelectionOverlayProps {
  region: RegionBounds;
  onPointerDown: (event: PointerEvent, mode: DragMode) => void;
}

export function SelectionOverlay({ region, onPointerDown }: SelectionOverlayProps): JSX.Element {
  return (
    <>
      <div className="shade top" style={{ height: region.y }} />
      <div className="shade left" style={{ top: region.y, width: region.x, height: region.height }} />
      <div
        className="shade right"
        style={{ top: region.y, left: region.x + region.width, height: region.height }}
      />
      <div className="shade bottom" style={{ top: region.y + region.height }} />

      <section
        data-interactive="true"
        className="selection"
        style={{ transform: `translate(${region.x}px, ${region.y}px)`, width: region.width, height: region.height }}
        onPointerDown={(event) => onPointerDown(event, 'move')}
      >
        <div className="selection-label">
          {Math.round(region.width)} x {Math.round(region.height)}
        </div>
        {HANDLE_NAMES.map((handle) => (
          <button
            key={handle}
            className={`resize-handle ${handle}`}
            type="button"
            aria-label={`resize-${handle}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown(event, handle);
            }}
          />
        ))}
      </section>
    </>
  );
}
