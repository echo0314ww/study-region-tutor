import { useCallback, useState } from 'react';
import type { RegionBounds } from '../../../shared/types';
import { clampRegion } from '../uiUtils';

export interface UseCaptureFlowReturn {
  isDragCaptureActive: boolean;
  pendingCaptureRegion: RegionBounds | null;
  startDragCapture: () => void;
  cancelDragCapture: () => void;
  handleDragCapture: (selectedRegion: RegionBounds) => void;
  confirmPendingCapture: () => void;
  cancelPendingCapture: () => void;
  resetCaptureState: () => void;
}

export interface UseCaptureFlowCallbacks {
  onConfirmCapture: (region: RegionBounds) => void;
  onStartCapture: () => void;
}

export function useCaptureFlow(callbacks: UseCaptureFlowCallbacks): UseCaptureFlowReturn {
  const [isDragCaptureActive, setIsDragCaptureActive] = useState(false);
  const [pendingCaptureRegion, setPendingCaptureRegion] = useState<RegionBounds | null>(null);

  const startDragCapture = useCallback((): void => {
    setPendingCaptureRegion(null);
    setIsDragCaptureActive(true);
    callbacks.onStartCapture();
  }, [callbacks]);

  const cancelDragCapture = useCallback((): void => {
    setIsDragCaptureActive(false);
    setPendingCaptureRegion(null);
  }, []);

  const handleDragCapture = useCallback((selectedRegion: RegionBounds): void => {
    const nextRegion = clampRegion({
      x: Math.round(selectedRegion.x),
      y: Math.round(selectedRegion.y),
      width: Math.round(selectedRegion.width),
      height: Math.round(selectedRegion.height)
    });

    setIsDragCaptureActive(false);
    setPendingCaptureRegion(nextRegion);
  }, []);

  const confirmPendingCapture = useCallback((): void => {
    if (!pendingCaptureRegion) {
      return;
    }

    const confirmedRegion = pendingCaptureRegion;
    setPendingCaptureRegion(null);
    callbacks.onConfirmCapture(confirmedRegion);
  }, [callbacks, pendingCaptureRegion]);

  const cancelPendingCapture = useCallback((): void => {
    setPendingCaptureRegion(null);
  }, []);

  const resetCaptureState = useCallback((): void => {
    setPendingCaptureRegion(null);
    setIsDragCaptureActive(true);
  }, []);

  return {
    isDragCaptureActive,
    pendingCaptureRegion,
    startDragCapture,
    cancelDragCapture,
    handleDragCapture,
    confirmPendingCapture,
    cancelPendingCapture,
    resetCaptureState
  };
}
