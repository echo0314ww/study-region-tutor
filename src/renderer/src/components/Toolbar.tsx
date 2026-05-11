import {
  Bell,
  BookOpen,
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

export interface ToolbarProps {
  toolbarRef: RefObject<HTMLElement | null>;
  isSelectionVisible: boolean;
  isLoading: boolean;
  isCancelling: boolean;
  hasUnreadAnnouncement: boolean;
  toolbarPosition: FloatingPosition | null;
  onToggleSelection: () => void;
  onExplain: () => void;
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
  isSelectionVisible,
  isLoading,
  isCancelling,
  hasUnreadAnnouncement,
  toolbarPosition,
  onToggleSelection,
  onExplain,
  onCancel,
  onToggleResult,
  onToggleAnnouncement,
  onToggleSettings,
  onQuit,
  onDragPointerDown,
  onPointerEnter,
  onPointerLeave
}: ToolbarProps): JSX.Element {
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
        title="移动工具栏"
        aria-label="移动工具栏"
      >
        <GripVertical size={18} />
      </button>
      <button
        className="secondary-button"
        type="button"
        onClick={onToggleSelection}
        disabled={isLoading}
      >
        <ScanLine size={18} />
        {isSelectionVisible ? '隐藏截图' : '截图'}
      </button>
      <button
        className="primary-button"
        type="button"
        onClick={onExplain}
        disabled={isLoading || !isSelectionVisible}
      >
        {isLoading ? <Loader2 size={18} className="spin" /> : <BookOpen size={18} />}
        {isLoading ? '识别中' : '识别并讲解'}
      </button>
      {isLoading && (
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isCancelling}>
          <X size={18} />
          {isCancelling ? '停止中' : '停止'}
        </button>
      )}
      <button className="icon-button" type="button" onClick={onToggleResult} title="对话">
        <MessageSquareText size={18} />
      </button>
      <button
        className={`icon-button ${hasUnreadAnnouncement ? 'has-dot' : ''}`}
        type="button"
        onClick={onToggleAnnouncement}
        title="公告"
      >
        <Bell size={18} />
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={onToggleSettings}
        title="设置"
      >
        <Settings size={18} />
      </button>
      <button className="icon-button" type="button" onClick={onQuit} title="退出应用">
        <Power size={18} />
      </button>
    </nav>
  );
}
