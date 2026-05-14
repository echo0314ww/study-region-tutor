import type { QuestionSessionTurn, RegionBounds } from '../../shared/types';

export type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface DragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startRegion: RegionBounds;
}

export interface PanelDragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startPanel: RegionBounds;
}

export type FloatingDragTarget = 'toolbar' | 'settings';

export interface FloatingPosition {
  x: number;
  y: number;
}

export interface FloatingDragState {
  target: FloatingDragTarget;
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: FloatingPosition;
}

export type UiConversationTurn = QuestionSessionTurn & {
  id: string;
};

export type ProxyHealthStatus = 'idle' | 'checking' | 'success' | 'error';
export type SettingsView = 'normal' | 'proxyAdvanced' | 'setupGuide';
export type GuideKind = 'product' | 'release' | 'history';

export interface GuideStep {
  title: string;
  body: string;
  action?: string;
}

export interface GuideDefinition {
  kind: GuideKind;
  version: string;
  title: string;
  subtitle: string;
  steps: GuideStep[];
  historyVersions?: GuideVersionSection[];
}

export interface GuideVersionSection {
  version: string;
  title: string;
  subtitle: string;
  steps: GuideStep[];
}
