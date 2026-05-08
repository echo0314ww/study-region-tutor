import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type {
  AnswerDeltaEvent,
  ApiRuntimeDefaults,
  ApiProviderOption,
  CancelRequest,
  EndQuestionSessionRequest,
  ExplainProgressEvent,
  ExplainRequest,
  ExplainResult,
  FollowUpRequest,
  FollowUpResult,
  ModelListResult,
  RegionBounds,
  TutorSettings,
  UpdateStatusEvent
} from '../shared/types';

const api = {
  explainRegion: (request: ExplainRequest): Promise<ExplainResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.explainRegion, request),
  askFollowUp: (request: FollowUpRequest): Promise<FollowUpResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.askFollowUp, request),
  cancelRequest: (request: CancelRequest): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.cancelRequest, request),
  endQuestionSession: (request: EndQuestionSessionRequest): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.endQuestionSession, request),
  getApiDefaults: (): Promise<ApiRuntimeDefaults> => ipcRenderer.invoke(IPC_CHANNELS.getApiDefaults),
  listApiProviders: (): Promise<ApiProviderOption[]> => ipcRenderer.invoke(IPC_CHANNELS.listApiProviders),
  getOverlayBounds: (): Promise<RegionBounds> => ipcRenderer.invoke(IPC_CHANNELS.getOverlayBounds),
  listModels: (settings: TutorSettings): Promise<ModelListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.listModels, settings),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.installUpdate),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
  setDebugMode: (enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setDebugMode, enabled),
  onUpdateStatus: (callback: (status: UpdateStatusEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatusEvent): void => callback(status);
    ipcRenderer.on(IPC_CHANNELS.updateStatus, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.updateStatus, listener);
  },
  onExplainProgress: (callback: (progress: ExplainProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ExplainProgressEvent): void => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.explainProgress, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.explainProgress, listener);
  },
  onAnswerDelta: (callback: (delta: AnswerDeltaEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, delta: AnswerDeltaEvent): void => callback(delta);
    ipcRenderer.on(IPC_CHANNELS.answerDelta, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.answerDelta, listener);
  },
  onCaptureUiVisible: (callback: (visible: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean): void => callback(visible);
    ipcRenderer.on(IPC_CHANNELS.setCaptureUiVisible, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.setCaptureUiVisible, listener);
  }
};

contextBridge.exposeInMainWorld('studyTutor', api);

export type StudyTutorApi = typeof api;
