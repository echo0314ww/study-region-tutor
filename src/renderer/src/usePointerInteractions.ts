import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, PointerEvent, SetStateAction } from 'react';
import type { RegionBounds } from '../../shared/types';
import type {
  DragMode,
  DragState,
  FloatingDragState,
  FloatingDragTarget,
  FloatingPosition,
  PanelDragState
} from './uiTypes';
import {
  clampFloatingPosition,
  isInteractiveElement,
  resizeRegion,
  resizeResultPanel
} from './uiUtils';

interface UsePointerInteractionsOptions {
  floatingPassthroughMode: boolean;
  region: RegionBounds;
  resultPanel: RegionBounds;
  toolbarPosition: FloatingPosition | null;
  settingsPanelPosition: FloatingPosition | null;
  isAnnouncementOpen: boolean;
  isResultOpen: boolean;
  isSettingsOpen: boolean;
  setRegion: Dispatch<SetStateAction<RegionBounds>>;
  setResultPanel: Dispatch<SetStateAction<RegionBounds>>;
  setToolbarPosition: Dispatch<SetStateAction<FloatingPosition | null>>;
  setSettingsPanelPosition: Dispatch<SetStateAction<FloatingPosition | null>>;
}

export function usePointerInteractions({
  floatingPassthroughMode,
  region,
  resultPanel,
  toolbarPosition,
  settingsPanelPosition,
  isAnnouncementOpen,
  isResultOpen,
  isSettingsOpen,
  setRegion,
  setResultPanel,
  setToolbarPosition,
  setSettingsPanelPosition
}: UsePointerInteractionsOptions): {
  toolbarRef: MutableRefObject<HTMLElement | null>;
  settingsPanelRef: MutableRefObject<HTMLElement | null>;
  enterInteractiveSurface: () => void;
  leaveInteractiveSurface: () => void;
  onPointerDownCapture: (event: PointerEvent) => void;
  onResultPanelPointerDown: (event: PointerEvent, mode: DragMode) => void;
  onFloatingPointerDown: (event: PointerEvent, target: FloatingDragTarget) => void;
  onSelectionPointerDown: (event: PointerEvent, mode: DragMode) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
} {
  const toolbarRef = useRef<HTMLElement | null>(null);
  const settingsPanelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resultPanelDragRef = useRef<PanelDragState | null>(null);
  const floatingDragRef = useRef<FloatingDragState | null>(null);
  const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isMousePassthroughRef = useRef(false);

  const setMousePassthrough = useCallback((ignored: boolean, force = false): void => {
    if (!force && isMousePassthroughRef.current === ignored) {
      return;
    }

    isMousePassthroughRef.current = ignored;
    void window.studyTutor.setMousePassthrough(ignored).catch(() => {
      if (isMousePassthroughRef.current === ignored) {
        isMousePassthroughRef.current = !ignored;
      }
    });
  }, []);

  const syncMousePassthrough = useCallback(
    (force = false): void => {
      if (!floatingPassthroughMode || dragRef.current || resultPanelDragRef.current || floatingDragRef.current) {
        setMousePassthrough(false, force);
        return;
      }

      const lastPosition = lastPointerPositionRef.current;

      if (!lastPosition) {
        setMousePassthrough(true, force);
        return;
      }

      const element = document.elementFromPoint(lastPosition.x, lastPosition.y);
      setMousePassthrough(!isInteractiveElement(element), force);
    },
    [floatingPassthroughMode, setMousePassthrough]
  );

  const updateMousePassthrough = useCallback(
    (clientX: number, clientY: number, target?: EventTarget | null): void => {
      lastPointerPositionRef.current = { x: clientX, y: clientY };

      if (!floatingPassthroughMode || dragRef.current || resultPanelDragRef.current || floatingDragRef.current) {
        setMousePassthrough(false);
        return;
      }

      const element = target instanceof Element ? target : document.elementFromPoint(clientX, clientY);
      setMousePassthrough(!isInteractiveElement(element));
    },
    [floatingPassthroughMode, setMousePassthrough]
  );

  const enterInteractiveSurface = useCallback((): void => {
    setMousePassthrough(false);
  }, [setMousePassthrough]);

  const leaveInteractiveSurface = useCallback((): void => {
    if (!floatingPassthroughMode || dragRef.current || resultPanelDragRef.current || floatingDragRef.current) {
      return;
    }

    setMousePassthrough(true);
  }, [floatingPassthroughMode, setMousePassthrough]);

  useEffect(() => {
    syncMousePassthrough();
  }, [
    isAnnouncementOpen,
    isResultOpen,
    isSettingsOpen,
    resultPanel.height,
    resultPanel.width,
    resultPanel.x,
    resultPanel.y,
    settingsPanelPosition?.x,
    settingsPanelPosition?.y,
    syncMousePassthrough,
    toolbarPosition?.x,
    toolbarPosition?.y
  ]);

  useEffect(() => {
    syncMousePassthrough(true);

    const timers = [50, 250, 1000].map((delay) =>
      window.setTimeout(() => {
        syncMousePassthrough(true);
      }, delay)
    );
    const onFocus = (): void => syncMousePassthrough(true);
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        syncMousePassthrough(true);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [syncMousePassthrough]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      updateMousePassthrough(event.clientX, event.clientY, event.target);
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [updateMousePassthrough]);

  useEffect(() => {
    return () => {
      void window.studyTutor.setMousePassthrough(false).catch(() => undefined);
    };
  }, []);

  const onPointerDownCapture = (event: PointerEvent): void => {
    lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };

    if (event.target instanceof Element && isInteractiveElement(event.target)) {
      setMousePassthrough(false);
    }
  };

  const onResultPanelPointerDown = (event: PointerEvent, mode: DragMode): void => {
    event.preventDefault();
    event.stopPropagation();
    setMousePassthrough(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    resultPanelDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanel: resultPanel
    };
  };

  const floatingElementForTarget = (target: FloatingDragTarget): HTMLElement | null => {
    return target === 'toolbar' ? toolbarRef.current : settingsPanelRef.current;
  };

  const setFloatingPositionForTarget = (target: FloatingDragTarget, position: FloatingPosition): void => {
    if (target === 'toolbar') {
      setToolbarPosition(position);
      return;
    }

    setSettingsPanelPosition(position);
  };

  const onFloatingPointerDown = (event: PointerEvent, target: FloatingDragTarget): void => {
    const element = floatingElementForTarget(target);

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();

    event.preventDefault();
    event.stopPropagation();
    setMousePassthrough(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    floatingDragRef.current = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: {
        x: rect.left,
        y: rect.top
      }
    };
  };

  const onSelectionPointerDown = (event: PointerEvent, mode: DragMode): void => {
    event.preventDefault();
    setMousePassthrough(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRegion: region
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    updateMousePassthrough(event.clientX, event.clientY, event.target);

    const floatingDrag = floatingDragRef.current;

    if (floatingDrag?.pointerId === event.pointerId) {
      const element = floatingElementForTarget(floatingDrag.target);

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const nextPosition = clampFloatingPosition(
        {
          x: floatingDrag.startPosition.x + event.clientX - floatingDrag.startX,
          y: floatingDrag.startPosition.y + event.clientY - floatingDrag.startY
        },
        rect.width,
        rect.height
      );

      setFloatingPositionForTarget(floatingDrag.target, nextPosition);
      return;
    }

    const resultPanelDrag = resultPanelDragRef.current;

    if (resultPanelDrag?.pointerId === event.pointerId) {
      setResultPanel(resizeResultPanel(resultPanelDrag, event.clientX, event.clientY));
      return;
    }

    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setRegion(resizeRegion(drag, event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (floatingDragRef.current?.pointerId === event.pointerId) {
      floatingDragRef.current = null;
    }

    if (resultPanelDragRef.current?.pointerId === event.pointerId) {
      resultPanelDragRef.current = null;
    }

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }

    updateMousePassthrough(event.clientX, event.clientY, event.target);
  };

  return {
    toolbarRef,
    settingsPanelRef,
    enterInteractiveSurface,
    leaveInteractiveSurface,
    onPointerDownCapture,
    onResultPanelPointerDown,
    onFloatingPointerDown,
    onSelectionPointerDown,
    onPointerMove,
    onPointerUp
  };
}
