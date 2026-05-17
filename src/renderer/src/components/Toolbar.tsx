import {
  Bell,
  Check,
  GripVertical,
  Loader2,
  MessageSquareText,
  Power,
  ScanLine,
  Settings,
  X
} from 'lucide-react';
import React from 'react';
import type { PointerEvent, RefObject } from 'react';
import type { FloatingPosition } from '../uiTypes';
import { useTranslation } from '../i18n';

export interface ToolbarProps {
  toolbarRef: RefObject<HTMLElement | null>;
  isCaptureModeActive: boolean;
  hasPendingCaptureConfirm: boolean;
  isLoading: boolean;
  isCancelling: boolean;
  hasUnreadAnnouncement: boolean;
  toolbarPosition: FloatingPosition | null;
  onStartCapture: () => void;
  onCancelCapture: () => void;
  onConfirmCapture: () => void;
  onCancel: () => void;
  onToggleResult: () => void;
  onToggleAnnouncement: () => void;
  onToggleSettings: () => void;
  onQuit: () => void;
  onDragPointerDown: (event: PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function Toolbar({
  toolbarRef,
  isCaptureModeActive,
  hasPendingCaptureConfirm,
  isLoading,
  isCancelling,
  hasUnreadAnnouncement,
  toolbarPosition,
  onStartCapture,
  onCancelCapture,
  onConfirmCapture,
  onCancel,
  onToggleResult,
  onToggleAnnouncement,
  onToggleSettings,
  onQuit,
  onDragPointerDown,
  onPointerEnter,
  onPointerLeave
}: ToolbarProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <nav
      ref={toolbarRef as React.RefObject<HTMLElement>}
      className="toolbar"
      aria-label="controls"
      data-interactive="true"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={
        toolbarPosition
          ? {
              left: toolbarPosition.x,
              top: toolbarPosition.y,
              transform: 'none'
            }
          : undefined
      }
    >
      <button
        className="toolbar-drag-handle icon-button ghost"
        type="button"
        onPointerDown={onDragPointerDown}
        title={t('toolbar.drag')}
        aria-label={t('toolbar.drag')}
      >
        <GripVertical size={18} />
      </button>
      <button
        className="secondary-button"
        type="button"
        onClick={isCaptureModeActive ? onCancelCapture : onStartCapture}
        disabled={isLoading}
      >
        <ScanLine size={18} />
        {isCaptureModeActive ? t('toolbar.cancelCapture') : hasPendingCaptureConfirm ? t('toolbar.recapture') : t('toolbar.capture')}
      </button>
      {hasPendingCaptureConfirm && !isLoading && (
        <button className="primary-button" type="button" onClick={onConfirmCapture}>
          <Check size={18} />
          {t('toolbar.confirmCapture')}
        </button>
      )}
      {isLoading && (
        <button className="primary-button" type="button" disabled>
          <Loader2 size={18} className="spin" />
          {t('toolbar.recognizing')}
        </button>
      )}
      {isLoading && (
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isCancelling}>
          <X size={18} />
          {isCancelling ? t('toolbar.stopping') : t('toolbar.stop')}
        </button>
      )}
      <button className="icon-button" type="button" onClick={onToggleResult} title={t('toolbar.result')} aria-label={t('toolbar.result')}>
        <MessageSquareText size={18} />
      </button>
      <button
        className={`icon-button ${hasUnreadAnnouncement ? 'has-dot' : ''}`}
        type="button"
        onClick={onToggleAnnouncement}
        title={t('toolbar.announcements')}
        aria-label={t('toolbar.announcements')}
      >
        <Bell size={18} />
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={onToggleSettings}
        title={t('toolbar.settings')}
        aria-label={t('toolbar.settings')}
      >
        <Settings size={18} />
      </button>
      <button className="icon-button" type="button" onClick={onQuit} title={t('toolbar.quit')} aria-label={t('toolbar.quit')}>
        <Power size={18} />
      </button>
    </nav>
  );
}
