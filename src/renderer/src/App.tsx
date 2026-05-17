import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExportConversationRequest, RegionBounds } from '../../shared/types';
import type { FloatingPosition } from './uiTypes';
import { DEFAULT_REGION, SETUP_WIZARD_COMPLETED_VERSION_KEY, SETUP_WIZARD_DISMISSED_VERSION_KEY } from './constants';
import { buildConversationMarkdown } from '../../shared/exportConversation';
import {
  clampRegion,
  clampResultPanel,
  defaultResultPanel,
  shortcutBindings
} from './uiUtils';
import { useAnnouncements } from './useAnnouncements';
import { usePointerInteractions } from './usePointerInteractions';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useUpdateStatus } from './useUpdateStatus';
import { useTheme } from './useTheme';
import { LocaleContext, translateMessage } from './i18n';
import type { MessageKey } from './i18n';
import { CaptureConfirmOverlay } from './components/CaptureConfirmOverlay';
import { ConfirmModal } from './components/ConfirmModal';
import { DragCaptureOverlay } from './components/DragCaptureOverlay';
import { Toolbar } from './components/Toolbar';
import { AnnouncementPanel } from './components/AnnouncementPanel';
import { ResultPanel } from './components/ResultPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { GuidePanel } from './components/GuidePanel';
import { SetupWizard } from './components/SetupWizard';
import { ToastContainer } from './components/Toast';
import {
  useApiSettings,
  useExplainSession,
  useStudyLibrary,
  useCaptureFlow,
  useGuides,
  shouldAutoShowGuide,
  useDiagnostics,
  useConfirmDialog
} from './hooks';
import { useToast } from './hooks/useToast';

export function App(): JSX.Element {
  const [region, setRegion] = useState(() => clampRegion(DEFAULT_REGION));
  const [resultPanel, setResultPanel] = useState(() => clampResultPanel(defaultResultPanel()));
  const [overlayBounds, setOverlayBounds] = useState<RegionBounds>({ x: 0, y: 0, width: 0, height: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isCaptureUiVisible, setIsCaptureUiVisible] = useState(true);
  const [toolbarPosition, setToolbarPosition] = useState<FloatingPosition | null>(null);
  const [settingsPanelPosition, setSettingsPanelPosition] = useState<FloatingPosition | null>(null);

  const apiSettings = useApiSettings();
  const { settings, appVersion, currentProxyUrl, isProxyConnection } = apiSettings;
  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translateMessage(settings.language, key, params),
    [settings.language]
  );

  useTheme(settings.theme ?? 'system');
  const updateStatus = useUpdateStatus();
  const { toasts, showToast } = useToast();

  const guides = useGuides(appVersion);

  const announcementSourceUrl = currentProxyUrl;
  const {
    announcements,
    announcementError,
    announcementPanelLevel,
    expandedAnnouncementIds,
    hasUnreadAnnouncement,
    isAnnouncementOpen,
    closeAnnouncementPanel,
    toggleAnnouncementDetails,
    toggleAnnouncementPanel
  } = useAnnouncements(announcementSourceUrl);

  const captureResetRef = useRef<() => void>(() => undefined);

  const explainSession = useExplainSession({
    settings,
    overlayBounds,
    addProviderSwitchHint: apiSettings.addProviderSwitchHint,
    clearSavedProxyTokenState: apiSettings.clearSavedProxyTokenState,
    onCaptureReset: () => captureResetRef.current(),
    onResultOpen: () => setIsResultOpen(true),
    onResultClose: () => setIsResultOpen(false)
  });

  const capture = useCaptureFlow({
    onConfirmCapture: (confirmedRegion: RegionBounds) => {
      void explainSession.runExplain(confirmedRegion);
    },
    onStartCapture: () => {
      setIsResultOpen(false);
      apiSettings.setSettingsView('normal');
      setIsSettingsOpen(false);
      closeAnnouncementPanel();
    }
  });

  captureResetRef.current = () => {
    capture.cancelPendingCapture();
    capture.resetCaptureState();
  };

  const { isDragCaptureActive, pendingCaptureRegion } = capture;

  const confirm = useConfirmDialog({
    onQuitConfirmed: () => {
      void window.studyTutor.quitApp();
    },
    onDeleteStudyItemConfirmed: (id: string) => {
      studyLib.setStudyItems((current) => current.filter((item) => item.id !== id));
    },
    onClearStudyItemsConfirmed: () => {
      studyLib.setStudyItems([]);
    }
  });

  const canExportConversation = explainSession.conversationTurns.some((turn) => turn.content.trim());

  const studyLib = useStudyLibrary({
    activeStudyItemId: explainSession.activeStudyItemId,
    conversationTurns: explainSession.conversationTurns,
    isLoading: explainSession.isLoading,
    ocrPreviewActive: Boolean(explainSession.ocrPreview),
    settings,
    appVersion,
    canExportConversation,
    onRestoreItem: (_item) => {
      setIsResultOpen(true);
      setIsSettingsOpen(false);
      apiSettings.setSettingsView('normal');
      closeAnnouncementPanel();
    },
    onDeleteConfirm: confirm.openDeleteStudyItemConfirm,
    onClearConfirm: confirm.openClearStudyItemsConfirm
  });

  const diagnostics = useDiagnostics(settings, appVersion);

  const hasPendingCaptureConfirm = pendingCaptureRegion !== null;
  const floatingPassthroughMode = isCaptureUiVisible && !isDragCaptureActive && !hasPendingCaptureConfirm;

  const {
    toolbarRef,
    settingsPanelRef,
    enterInteractiveSurface,
    leaveInteractiveSurface,
    onPointerDownCapture,
    onResultPanelPointerDown,
    onFloatingPointerDown,
    onPointerMove,
    onPointerUp
  } = usePointerInteractions({
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
  });

  // --- Initialization effects ---

  useEffect(() => {
    window.studyTutor.getOverlayBounds().then(setOverlayBounds).catch(() => {
      setOverlayBounds({ x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight });
    });

    const onResize = (): void => {
      setRegion((current) => clampRegion(current));
      setResultPanel((current) => clampResultPanel(current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => window.studyTutor.onCaptureUiVisible(setIsCaptureUiVisible), []);

  // Auto-show guide
  const guidesSetActiveGuideKind = guides.setActiveGuideKind;
  const guidesActiveGuideKind = guides.activeGuideKind;
  useEffect(() => {
    const guideToShow = shouldAutoShowGuide(appVersion, guidesActiveGuideKind);
    if (guideToShow) {
      guidesSetActiveGuideKind(guideToShow);
    }
  }, [appVersion, guidesActiveGuideKind, guidesSetActiveGuideKind]);

  // Auto-show setup wizard
  const apiHasInitializedSettings = apiSettings.hasInitializedSettings;
  const apiIsSetupWizardOpen = apiSettings.isSetupWizardOpen;
  const apiSetIsSetupWizardOpen = apiSettings.setIsSetupWizardOpen;
  useEffect(() => {
    if (!appVersion || !apiHasInitializedSettings || guidesActiveGuideKind || apiIsSetupWizardOpen) {
      return;
    }

    try {
      const setupVersionKey = appVersion.split('.').slice(0, 2).join('.') || appVersion;
      const completedVersion = localStorage.getItem(SETUP_WIZARD_COMPLETED_VERSION_KEY);
      const dismissedVersion = localStorage.getItem(SETUP_WIZARD_DISMISSED_VERSION_KEY);

      if (
        completedVersion === setupVersionKey ||
        completedVersion === appVersion ||
        dismissedVersion === setupVersionKey ||
        dismissedVersion === appVersion
      ) {
        return;
      }
    } catch {
      return;
    }

    apiSetIsSetupWizardOpen(true);
  }, [appVersion, apiHasInitializedSettings, guidesActiveGuideKind, apiIsSetupWizardOpen, apiSetIsSetupWizardOpen]);

  // Proxy health check on settings open
  const apiSettingsView = apiSettings.settingsView;
  useEffect(() => {
    if (!isSettingsOpen || !isProxyConnection || apiSettingsView !== 'normal') {
      apiSettings.proxyHealthRequestIdRef.current += 1;
      return;
    }

    void apiSettings.validateProxyConnection();
  }, [isProxyConnection, isSettingsOpen, apiSettingsView, apiSettings]);

  // --- Derived values ---

  const canRetry = explainSession.canRetry;
  const hasFinishableQuestion = Boolean(
    explainSession.activeSessionId || explainSession.conversationTurns.length > 0 || explainSession.result || explainSession.ocrPreview
  );

  // --- Callbacks for child components ---

  const copyTextToClipboard = useCallback((text: string): void => {
    const copyWithTextArea = (): boolean => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        return document.execCommand('copy');
      } finally {
        textarea.remove();
      }
    };

    if (!navigator.clipboard?.writeText) {
      try {
        const copied = copyWithTextArea();
        if (copied) {
          showToast(t('export.copied'), 'success');
        } else {
          showToast(t('export.clipboardUnavailable'), 'error');
        }
      } catch (caught) {
        showToast(caught instanceof Error ? caught.message : String(caught), 'error');
      }
      return;
    }

    void navigator.clipboard
      .writeText(text)
      .then(() => showToast(t('export.copied'), 'success'))
      .catch((caught) => {
        try {
          const copied = copyWithTextArea();
          if (copied) {
            showToast(t('export.copied'), 'success');
          } else {
            showToast(caught instanceof Error ? caught.message : String(caught), 'error');
          }
        } catch {
          showToast(caught instanceof Error ? caught.message : String(caught), 'error');
        }
      });
  }, [showToast, t]);

  const buildExportRequest = useCallback((): ExportConversationRequest => {
    return {
      appVersion,
      exportedAt: new Date().toLocaleString(settings.language, { hour12: false }),
      model: settings.model.trim(),
      language: settings.language,
      inputMode: settings.inputMode,
      reasoningOnly: settings.reasoningOnly,
      turns: explainSession.conversationTurns
        .map((turn) => ({ role: turn.role, content: turn.content }))
        .filter((turn) => turn.content.trim())
    };
  }, [appVersion, explainSession.conversationTurns, settings.inputMode, settings.language, settings.model, settings.reasoningOnly]);

  const copyConversationMarkdown = useCallback((): void => {
    if (!canExportConversation) {
      return;
    }

    copyTextToClipboard(buildConversationMarkdown(buildExportRequest()));
  }, [buildExportRequest, canExportConversation, copyTextToClipboard]);

  const exportConversationMarkdown = useCallback(async (): Promise<void> => {
    if (!canExportConversation) {
      return;
    }

    explainSession.setExportStatus('');

    try {
      const response = await window.studyTutor.exportConversation(buildExportRequest());

      if (!response.canceled) {
        explainSession.setExportStatus(
          response.filePath
            ? t('export.conversationExportedTo', { path: response.filePath })
            : t('export.conversationExported')
        );
      }
    } catch (caught) {
      explainSession.setExportStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }, [buildExportRequest, canExportConversation, explainSession, t]);

  const handleToggleSettings = useCallback((): void => {
    if (isSettingsOpen) {
      apiSettings.setSettingsView('normal');
    }

    setIsSettingsOpen((open) => !open);
  }, [isSettingsOpen, apiSettings]);

  const handleCloseSettings = useCallback((): void => {
    apiSettings.setSettingsView('normal');
    apiSettings.proxyHealthRequestIdRef.current += 1;
    apiSettings.setProxyHealthStatus('idle');
    apiSettings.setProxyHealthMessage('');
    setIsSettingsOpen(false);
  }, [apiSettings]);

  const openSetupWizard = useCallback((): void => {
    apiSettings.setIsSetupWizardOpen(true);
    setIsSettingsOpen(false);
    apiSettings.setSettingsView('normal');
    guides.setActiveGuideKind(null);
    closeAnnouncementPanel();
  }, [apiSettings, closeAnnouncementPanel, guides]);

  const completeSetupWizard = useCallback((): void => {
    if (!apiSettings.canCompleteSetupWizard) {
      return;
    }

    if (appVersion) {
      try {
        localStorage.setItem(SETUP_WIZARD_COMPLETED_VERSION_KEY, appVersion.split('.').slice(0, 2).join('.') || appVersion);
      } catch {
        // best-effort
      }
    }

    apiSettings.setIsSetupWizardOpen(false);
  }, [apiSettings, appVersion]);

  const dismissSetupWizard = useCallback((): void => {
    if (appVersion) {
      try {
        localStorage.setItem(SETUP_WIZARD_DISMISSED_VERSION_KEY, appVersion.split('.').slice(0, 2).join('.') || appVersion);
      } catch {
        // best-effort
      }
    }

    apiSettings.setIsSetupWizardOpen(false);
  }, [apiSettings, appVersion]);

  const restoreStudyItem = useCallback(
    (item: import('./uiTypes').StudyItem): void => {
      studyLib.restoreStudyItem(item);
      setIsResultOpen(true);
      setIsSettingsOpen(false);
      apiSettings.setSettingsView('normal');
      closeAnnouncementPanel();
    },
    [apiSettings, closeAnnouncementPanel, studyLib]
  );

  // --- Keyboard shortcuts ---

  const activeShortcutBindings = useMemo(() => shortcutBindings(settings), [settings]);
  const shortcutHandlers = useMemo(
    () => ({
      'start-capture': (): void => {
        if (!explainSession.isLoading) {
          capture.startDragCapture();
        }
      },
      'cancel-capture': (): void => {
        if (explainSession.isLoading) {
          explainSession.cancelCurrentRequest();
          return;
        }

        if (pendingCaptureRegion) {
          capture.cancelPendingCapture();
          return;
        }

        if (isDragCaptureActive) {
          capture.cancelDragCapture();
          return;
        }

        if (apiSettings.isSetupWizardOpen) {
          dismissSetupWizard();
          return;
        }

        if (isSettingsOpen) {
          handleCloseSettings();
          return;
        }

        if (isAnnouncementOpen) {
          closeAnnouncementPanel();
        }
      },
      'confirm-capture': (): void => {
        if (pendingCaptureRegion && !explainSession.isLoading) {
          capture.confirmPendingCapture();
        }
      },
      'toggle-result': (): void => setIsResultOpen((open) => !open),
      'open-settings': (): void => handleToggleSettings(),
      'open-announcements': (): void => toggleAnnouncementPanel(),
      'finish-question': (): void => {
        if (!explainSession.isLoading && hasFinishableQuestion) {
          void explainSession.endCurrentQuestion();
        }
      }
    }),
    [
      apiSettings.isSetupWizardOpen,
      capture,
      closeAnnouncementPanel,
      dismissSetupWizard,
      explainSession,
      handleCloseSettings,
      handleToggleSettings,
      hasFinishableQuestion,
      isAnnouncementOpen,
      isDragCaptureActive,
      isSettingsOpen,
      pendingCaptureRegion,
      toggleAnnouncementPanel
    ]
  );

  useKeyboardShortcuts(activeShortcutBindings, shortcutHandlers);

  // --- Render ---

  return (
    <LocaleContext.Provider value={settings.language}>
    <main
      className="app-shell"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {isCaptureUiVisible && isDragCaptureActive && (
        <DragCaptureOverlay
          onCancel={capture.cancelDragCapture}
          onCapture={capture.handleDragCapture}
        />
      )}

      {isCaptureUiVisible && pendingCaptureRegion && !isDragCaptureActive && (
        <CaptureConfirmOverlay
          region={pendingCaptureRegion}
          onConfirm={capture.confirmPendingCapture}
          onCancel={capture.cancelPendingCapture}
        />
      )}

      {isCaptureUiVisible && (
        <Toolbar
          toolbarRef={toolbarRef}
          isCaptureModeActive={isDragCaptureActive}
          hasPendingCaptureConfirm={hasPendingCaptureConfirm}
          isLoading={explainSession.isLoading}
          isCancelling={explainSession.isCancelling}
          hasUnreadAnnouncement={hasUnreadAnnouncement}
          toolbarPosition={toolbarPosition}
          onStartCapture={capture.startDragCapture}
          onCancelCapture={capture.cancelDragCapture}
          onConfirmCapture={capture.confirmPendingCapture}
          onCancel={explainSession.cancelCurrentRequest}
          onToggleResult={() => setIsResultOpen((open) => !open)}
          onToggleAnnouncement={toggleAnnouncementPanel}
          onToggleSettings={handleToggleSettings}
          onQuit={confirm.openQuitConfirm}
          onDragPointerDown={(event) => onFloatingPointerDown(event, 'toolbar')}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && guides.activeGuide && (
        <GuidePanel
          guide={guides.activeGuide}
          onSwitchGuide={guides.openGuide}
          onDismiss={guides.markGuideSeen}
          onClose={() => guides.markGuideSeen(guides.activeGuide!.kind)}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && apiSettings.isSetupWizardOpen && (
        <SetupWizard
          settings={settings}
          apiDefaults={apiSettings.apiDefaults}
          apiProviders={apiSettings.apiProviders}
          modelOptions={apiSettings.modelOptions}
          modelListError={apiSettings.modelListError}
          isModelListLoading={apiSettings.isModelListLoading}
          isModelCustom={apiSettings.isModelCustom}
          proxyHealthStatus={apiSettings.proxyHealthStatus}
          proxyHealthMessage={apiSettings.proxyHealthMessage}
          appVersion={appVersion}
          currentProxyUrl={currentProxyUrl}
          canComplete={apiSettings.canCompleteSetupWizard}
          onSettingsChange={apiSettings.setSettings}
          onSelectApiConnectionMode={apiSettings.selectApiConnectionMode}
          onSelectApiProvider={apiSettings.selectApiProvider}
          onRefreshApiProviders={() => void apiSettings.refreshApiProviders(settings)}
          onLoadModels={() => void apiSettings.loadModels(settings)}
          onValidateProxyConnection={() => void apiSettings.validateProxyConnection()}
          onIsModelCustomChange={apiSettings.setIsModelCustom}
          onComplete={completeSetupWizard}
          onDismiss={dismissSetupWizard}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isAnnouncementOpen && (
        <AnnouncementPanel
          announcements={announcements}
          announcementError={announcementError}
          announcementSourceUrl={announcementSourceUrl}
          announcementPanelLevel={announcementPanelLevel}
          expandedAnnouncementIds={expandedAnnouncementIds}
          onClose={closeAnnouncementPanel}
          onToggleDetails={toggleAnnouncementDetails}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isResultOpen && (
        <ResultPanel
          resultPanel={resultPanel}
          isLoading={explainSession.isLoading}
          isCancelling={explainSession.isCancelling}
          error={explainSession.error}
          stoppedMessage={explainSession.stoppedMessage}
          result={explainSession.result}
          ocrPreview={explainSession.ocrPreview}
          conversationTurns={explainSession.conversationTurns}
          progressText={explainSession.progressText}
          followUpText={explainSession.followUpText}
          activeSessionId={explainSession.activeSessionId}
          canRetry={canRetry}
          canExport={canExportConversation}
          exportStatus={explainSession.exportStatus}
          isCurrentFavorite={studyLib.isCurrentStudyItemFavorite}
          onClose={() => setIsResultOpen(false)}
          onPanelPointerDown={onResultPanelPointerDown}
          onFollowUpTextChange={explainSession.setFollowUpText}
          onSendFollowUp={() => void explainSession.sendFollowUp()}
          onSendOcrPreview={() => void explainSession.sendOcrPreview()}
          onOcrPreviewTextChange={explainSession.handleOcrPreviewTextChange}
          onOcrPreviewCandidateApply={explainSession.handleOcrPreviewCandidateApply}
          onOcrPreviewCancel={explainSession.handleOcrPreviewCancel}
          onStartNextQuestion={() => void explainSession.startNextQuestion()}
          onEndCurrentQuestion={() => void explainSession.endCurrentQuestion()}
          onRetry={explainSession.retry}
          onToggleFavorite={studyLib.toggleCurrentStudyItemFavorite}
          onReviewCurrent={studyLib.reviewCurrentStudyItem}
          onCopyAnswer={copyConversationMarkdown}
          onExportAnswer={() => void exportConversationMarkdown()}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isSettingsOpen && (
        <SettingsPanel
          settingsPanelRef={settingsPanelRef}
          settings={settings}
          settingsView={apiSettings.settingsView}
          apiDefaults={apiSettings.apiDefaults}
          apiProviders={apiSettings.apiProviders}
          modelOptions={apiSettings.modelOptions}
          modelListError={apiSettings.modelListError}
          isModelListLoading={apiSettings.isModelListLoading}
          isModelCustom={apiSettings.isModelCustom}
          proxyHealthStatus={apiSettings.proxyHealthStatus}
          proxyHealthMessage={apiSettings.proxyHealthMessage}
          appVersion={appVersion}
          updateStatus={updateStatus}
          diagnosticResult={diagnostics.diagnosticResult}
          diagnosticError={diagnostics.diagnosticError}
          isDiagnosticsRunning={diagnostics.isDiagnosticsRunning}
          studyItems={studyLib.studyItems}
          settingsPanelPosition={settingsPanelPosition}
          onSettingsChange={apiSettings.setSettings}
          onSettingsViewChange={apiSettings.setSettingsView}
          onProxyHealthStatusChange={apiSettings.setProxyHealthStatus}
          onProxyHealthMessageChange={apiSettings.setProxyHealthMessage}
          onIsModelCustomChange={apiSettings.setIsModelCustom}
          onClose={handleCloseSettings}
          onSelectApiConnectionMode={apiSettings.selectApiConnectionMode}
          onSelectApiProvider={apiSettings.selectApiProvider}
          onRefreshApiProviders={() => void apiSettings.refreshApiProviders(settings)}
          onLoadModels={() => void apiSettings.loadModels(settings)}
          onValidateProxyConnection={() => void apiSettings.validateProxyConnection()}
          onRunDiagnostics={(deepCheck) => void diagnostics.runSettingsDiagnostics(deepCheck)}
          onCopyDiagnosticReport={copyTextToClipboard}
          onOpenSetupWizard={openSetupWizard}
          onRestoreStudyItem={restoreStudyItem}
          onUpdateStudyItem={studyLib.updateStudyItem}
          onReviewStudyItem={studyLib.reviewStudyItem}
          onDeleteStudyItem={studyLib.deleteStudyItem}
          onClearStudyItems={studyLib.clearStudyItems}
          onReplaceStudyItems={studyLib.replaceStudyItems}
          onExportStudyItems={(format, items) => void studyLib.exportStudyItems(format, items)}
          studyLibraryExportStatus={studyLib.studyLibraryExportStatus}
          onOpenGuide={guides.openGuide}
          onDragPointerDown={(event) => onFloatingPointerDown(event, 'settings')}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {confirm.confirmDialog && (
        <ConfirmModal
          title={confirm.confirmDialog.title}
          body={confirm.confirmDialog.body}
          confirmLabel={confirm.confirmDialog.confirmLabel}
          danger={confirm.confirmDialog.danger}
          onCancel={confirm.closeConfirmDialog}
          onConfirm={confirm.confirmPendingAction}
        />
      )}

      <ToastContainer toasts={toasts} />
    </main>
    </LocaleContext.Provider>
  );
}
