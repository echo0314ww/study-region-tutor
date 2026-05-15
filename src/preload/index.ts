import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type {
  AnnouncementEvent,
  AnswerDeltaEvent,
  ApiRuntimeDefaults,
  ApiProviderOption,
  CancelRequest,
  DiagnosticResult,
  EndQuestionSessionRequest,
  ExportConversationRequest,
  ExportConversationResult,
  ExportStudyLibraryRequest,
  ExtractStudyMetadataRequest,
  ExtractStudyMetadataResult,
  ExplainRecognizedTextRequest,
  ExplainProgressEvent,
  ExplainRequest,
  ExplainRegionResult,
  ExplainResult,
  OcrPreviewResult,
  FollowUpRequest,
  FollowUpResult,
  ModelListResult,
  RecognizeRegionRequest,
  ProxyHealthResult,
  RegionBounds,
  RunDiagnosticsRequest,
  RunPromptEvalRequest,
  RunPromptEvalResult,
  TutorSettings,
  UpdateStatusEvent
} from '../shared/types';

const api = {
  explainRegion: (request: ExplainRequest): Promise<ExplainRegionResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.explainRegion, request),
  recognizeRegion: (request: RecognizeRegionRequest): Promise<OcrPreviewResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.recognizeRegion, request),
  explainRecognizedText: (request: ExplainRecognizedTextRequest): Promise<ExplainResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.explainRecognizedText, request),
  askFollowUp: (request: FollowUpRequest): Promise<FollowUpResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.askFollowUp, request),
  cancelRequest: (request: CancelRequest): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.cancelRequest, request),
  endQuestionSession: (request: EndQuestionSessionRequest): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.endQuestionSession, request),
  getApiDefaults: (): Promise<ApiRuntimeDefaults> => ipcRenderer.invoke(IPC_CHANNELS.getApiDefaults),
  listApiProviders: (settings?: TutorSettings): Promise<ApiProviderOption[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.listApiProviders, settings),
  getOverlayBounds: (): Promise<RegionBounds> => ipcRenderer.invoke(IPC_CHANNELS.getOverlayBounds),
  listModels: (settings: TutorSettings): Promise<ModelListResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.listModels, settings),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.installUpdate),
  getLatestAnnouncement: (sourceUrl?: string): Promise<AnnouncementEvent> =>
    ipcRenderer.invoke(IPC_CHANNELS.getLatestAnnouncement, sourceUrl),
  connectAnnouncements: (sourceUrl?: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.connectAnnouncements, sourceUrl),
  checkProxyHealth: (sourceUrl?: string): Promise<ProxyHealthResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.checkProxyHealth, sourceUrl),
  runDiagnostics: (request: RunDiagnosticsRequest): Promise<DiagnosticResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.runDiagnostics, request),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
  quitApp: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.quitApp),
  exportConversation: (request: ExportConversationRequest): Promise<ExportConversationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportConversation, request),
  exportStudyLibrary: (request: ExportStudyLibraryRequest): Promise<ExportConversationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportStudyLibrary, request),
  extractStudyMetadata: (request: ExtractStudyMetadataRequest): Promise<ExtractStudyMetadataResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.extractStudyMetadata, request),
  runPromptEval: (request: RunPromptEvalRequest): Promise<RunPromptEvalResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.runPromptEval, request),
  saveProxyToken: (token: string): Promise<ApiRuntimeDefaults> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProxyToken, token),
  clearProxyToken: (): Promise<ApiRuntimeDefaults> => ipcRenderer.invoke(IPC_CHANNELS.clearProxyToken),
  setDebugMode: (enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setDebugMode, enabled),
  setMousePassthrough: (ignored: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.setMousePassthrough, ignored),
  onUpdateStatus: (callback: (status: UpdateStatusEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatusEvent): void => callback(status);
    ipcRenderer.on(IPC_CHANNELS.updateStatus, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.updateStatus, listener);
  },
  onAnnouncement: (callback: (event: AnnouncementEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, announcement: AnnouncementEvent): void => callback(announcement);
    ipcRenderer.on(IPC_CHANNELS.announcement, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.announcement, listener);
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
