import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import type { RegionBounds } from '../../../shared/types';
import { DRAG_CAPTURE_CANCEL_DISTANCE } from '../constants';
import { useTranslation } from '../i18n';

interface DragCaptureOverlayProps {
  onCancel: () => void;
  onCapture: (region: RegionBounds) => void;
}

interface Point {
  x: number;
  y: number;
}

interface DragCaptureState {
  pointerId: number;
  start: Point;
  current: Point;
}

function clampPoint(point: Point): Point {
  return {
    x: Math.min(Math.max(point.x, 0), window.innerWidth),
    y: Math.min(Math.max(point.y, 0), window.innerHeight)
  };
}

function regionFromPoints(first: Point, second: Point): RegionBounds {
  const start = clampPoint(first);
  const current = clampPoint(second);
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const right = Math.max(start.x, current.x);
  const bottom = Math.max(start.y, current.y);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}

function dragDistance(first: Point, second: Point): number {
  return Math.max(Math.abs(second.x - first.x), Math.abs(second.y - first.y));
}

export function DragCaptureOverlay({ onCancel, onCapture }: DragCaptureOverlayProps): JSX.Element {
  const { t } = useTranslation();
  const [drag, setDrag] = useState<DragCaptureState | null>(null);
  const previewRegion = useMemo(() => (drag ? regionFromPoints(drag.start, drag.current) : null), [drag]);

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

  const finishDrag = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const end = clampPoint({ x: event.clientX, y: event.clientY });
    const distance = dragDistance(drag.start, end);
    const selectedRegion = regionFromPoints(drag.start, end);
    setDrag(null);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture after pointer cancellation.
    }

    if (
      distance < DRAG_CAPTURE_CANCEL_DISTANCE ||
      selectedRegion.width < DRAG_CAPTURE_CANCEL_DISTANCE ||
      selectedRegion.height < DRAG_CAPTURE_CANCEL_DISTANCE
    ) {
      onCancel();
      return;
    }

    onCapture(selectedRegion);
  };

  return (
    <div
      className="drag-capture-overlay"
      data-interactive="true"
      onContextMenu={(event) => {
        event.preventDefault();
        setDrag(null);
        onCancel();
      }}
      onPointerDown={(event) => {
        event.preventDefault();

        if (event.button === 2) {
          setDrag(null);
          onCancel();
          return;
        }

        if (event.button !== 0) {
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        const start = clampPoint({ x: event.clientX, y: event.clientY });
        setDrag({
          pointerId: event.pointerId,
          start,
          current: start
        });
      }}
      onPointerMove={(event) => {
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        setDrag((current) =>
          current && current.pointerId === event.pointerId
            ? {
                ...current,
                current: clampPoint({ x: event.clientX, y: event.clientY })
              }
            : current
        );
      }}
      onPointerUp={finishDrag}
      onPointerCancel={(event) => {
        if (drag?.pointerId === event.pointerId) {
          setDrag(null);
          onCancel();
        }
      }}
    >
      {!previewRegion && <div className="drag-capture-backdrop" />}
      {previewRegion && (
        <>
          <div className="drag-capture-shade top" style={{ height: previewRegion.y }} />
          <div
            className="drag-capture-shade left"
            style={{ top: previewRegion.y, width: previewRegion.x, height: previewRegion.height }}
          />
          <div
            className="drag-capture-shade right"
            style={{ top: previewRegion.y, left: previewRegion.x + previewRegion.width, height: previewRegion.height }}
          />
          <div className="drag-capture-shade bottom" style={{ top: previewRegion.y + previewRegion.height }} />
          <section
            className="drag-capture-selection"
            aria-label={t('capture.regionLabel')}
            style={{
              transform: `translate(${previewRegion.x}px, ${previewRegion.y}px)`,
              width: previewRegion.width,
              height: previewRegion.height
            }}
          >
            <div className="drag-capture-label">
              {previewRegion.width} x {previewRegion.height}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
