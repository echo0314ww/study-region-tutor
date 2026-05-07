import { app, BrowserWindow, ipcMain, screen, type WebContents } from 'electron';
import { is } from '@electron-toolkit/utils';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc';
import type {
  ApiRuntimeDefaults,
  CancelRequest,
  EndQuestionSessionRequest,
  ExplainRequest,
  ExplainResult,
  FollowUpRequest,
  FollowUpResult,
  ModelListResult,
  RegionBounds,
  TutorSettings,
  UpdateStatusEvent
} from '../shared/types';
import { getVirtualBounds } from './geometry';
import { loadLocalEnv } from './env';
import { abortableDelay, isOperationCanceled, throwIfAborted } from './cancel';
import {
  askFollowUp,
  explainImageWithMetadata,
  explainRecognizedTextWithMetadata,
  getRuntimeApiDefaults,
  listAvailableModels
} from './openaiClient';
import { recognizeTextFromDataUrl } from './ocr';
import {
  appendQuestionSessionTurn,
  createQuestionSession,
  endQuestionSession,
  toFollowUpContext,
  updateQuestionSessionResponseId
} from './questionSessions';
import { captureRegionAsDataUrl, setScreenshotDebugMode } from './screenshot';

let mainWindow: BrowserWindow | undefined;
const activeRequestControllers = new Map<string, AbortController>();
let latestUpdateStatus: UpdateStatusEvent = {
  status: 'idle',
  message: '尚未检查更新。'
};

loadLocalEnv();

function currentVirtualBounds(): RegionBounds {
  return getVirtualBounds(
    screen.getAllDisplays().map((display) => ({
      id: display.id,
      scaleFactor: display.scaleFactor,
      bounds: display.bounds
    }))
  );
}

function createWindow(): void {
  const bounds = currentVirtualBounds();

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Study Region Tutor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function emitUpdateStatus(status: UpdateStatusEvent): void {
  latestUpdateStatus = status;
  mainWindow?.webContents.send(IPC_CHANNELS.updateStatus, status);
}

function updateVersion(info: UpdateInfo): string | undefined {
  return typeof info.version === 'string' && info.version ? info.version : undefined;
}

function registerAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    emitUpdateStatus({
      status: 'checking',
      message: '正在检查 GitHub Releases 上的新版本。'
    });
  });

  autoUpdater.on('update-available', (info) => {
    emitUpdateStatus({
      status: 'available',
      message: '发现新版本，正在后台下载更新包。',
      version: updateVersion(info)
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    emitUpdateStatus({
      status: 'not-available',
      message: '当前已经是最新版本。',
      version: updateVersion(info)
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    emitUpdateStatus({
      status: 'downloading',
      message: `正在下载更新：${Math.round(progress.percent)}%。`,
      percent: progress.percent
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    emitUpdateStatus({
      status: 'downloaded',
      message: '更新已下载完成，重启应用后会安装。',
      version: updateVersion(info),
      percent: 100
    });
  });

  autoUpdater.on('error', (error) => {
    emitUpdateStatus({
      status: 'error',
      message: `更新检查失败：${errorMessage(error)}`
    });
  });
}

async function checkForUpdates(): Promise<void> {
  if (process.platform !== 'win32') {
    emitUpdateStatus({
      status: 'error',
      message: '当前只配置了 Windows 版本自动更新。'
    });
    return;
  }

  if (is.dev) {
    emitUpdateStatus({
      status: 'not-available',
      message: '开发模式不会连接 GitHub 检查更新；请在打包后的 Windows 应用中测试。'
    });
    return;
  }

  await autoUpdater.checkForUpdates();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function regionText(region: RegionBounds): string {
  return `x=${region.x}, y=${region.y}, width=${region.width}, height=${region.height}`;
}

function compactMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

function prependProcessLog(processLog: string, answer: string): string {
  return [processLog, '', '## 讲解结果', '', answer].join('\n');
}

function imageProblemContext(answer: string): string {
  return [
    '用户最初通过截图直接提交了一道学习题目。截图内容不会在会话中继续保存。',
    '后续追问请根据首次回答中已经识别出的题目文本、题型和讲解继续回答。',
    '',
    '首次回答：',
    answer
  ].join('\n');
}

function ocrProblemContext(recognizedText: string, answer: string): string {
  return [
    '用户最初提交了一道学习题目，程序使用本地 OCR 得到以下题目文本。',
    '',
    'OCR 题目文本：',
    recognizedText,
    '',
    '首次回答：',
    answer
  ].join('\n');
}

function createSessionAndResult(
  request: ExplainRequest,
  sourceMode: 'image' | 'ocr-text',
  problemContext: string,
  firstUserContent: string,
  answer: string,
  responseId: string | undefined,
  processLog: string
): ExplainResult {
  const session = createQuestionSession({
    settings: request.settings,
    sourceMode,
    problemContext,
    firstUserContent,
    firstAssistantContent: answer,
    responseId
  });

  return {
    text: prependProcessLog(processLog, answer),
    sessionId: session.id
  };
}

function createProgressEmitter(webContents: WebContents, requestId: string): (line: string) => string {
  const lines: string[] = [];

  return (line: string): string => {
    lines.push(line);

    const text = ['## 处理过程', '', ...lines.map((step, index) => `${index + 1}. ${step}`)].join('\n');
    webContents.send(IPC_CHANNELS.explainProgress, { requestId, text });

    return text;
  };
}

function createAnswerDeltaEmitter(webContents: WebContents, requestId: string): (text: string, reset?: boolean) => void {
  return (text: string, reset = false): void => {
    if (!text && !reset) {
      return;
    }

    webContents.send(IPC_CHANNELS.answerDelta, { requestId, text, reset });
  };
}

function beginCancelableRequest(requestId: string): AbortSignal {
  activeRequestControllers.get(requestId)?.abort();

  const controller = new AbortController();
  activeRequestControllers.set(requestId, controller);

  return controller.signal;
}

function finishCancelableRequest(requestId: string): void {
  activeRequestControllers.delete(requestId);
}

function cancelActiveRequest(requestId: string): void {
  activeRequestControllers.get(requestId)?.abort();
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getApiDefaults, (): ApiRuntimeDefaults => getRuntimeApiDefaults());

  ipcMain.handle(IPC_CHANNELS.getOverlayBounds, () => currentVirtualBounds());

  ipcMain.handle(IPC_CHANNELS.getAppVersion, () => app.getVersion());

  ipcMain.handle(IPC_CHANNELS.setDebugMode, (_event, enabled: boolean) => {
    setScreenshotDebugMode(Boolean(enabled));
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (): Promise<void> => {
    await checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.installUpdate, (): void => {
    if (latestUpdateStatus.status === 'downloaded') {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  ipcMain.handle(IPC_CHANNELS.listModels, (_event, settings: TutorSettings): Promise<ModelListResult> => {
    return listAvailableModels(settings);
  });

  ipcMain.handle(IPC_CHANNELS.cancelRequest, (_event, request: CancelRequest): void => {
    cancelActiveRequest(request.requestId);
  });

  ipcMain.handle(IPC_CHANNELS.endQuestionSession, (_event, request: EndQuestionSessionRequest): void => {
    endQuestionSession(request.sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.askFollowUp, async (event, request: FollowUpRequest): Promise<FollowUpResult> => {
    const signal = beginCancelableRequest(request.requestId);
    const emitProgress = createProgressEmitter(event.sender, request.requestId);
    const emitAnswerDelta = createAnswerDeltaEmitter(event.sender, request.requestId);

    try {
      let latestProcessLog = emitProgress('当前处于题目会话模式，正在准备发送追问。');
      const context = toFollowUpContext(request.sessionId);

      latestProcessLog = emitProgress('不会重新截图，也不会发送原始截图；只发送本题文本上下文、会话历史和你的追问。');

      if (context.previousResponseId && request.settings.apiMode !== 'chat-completions') {
        latestProcessLog = emitProgress('检测到上一轮 Responses response_id，将优先尝试 previous_response_id 会话续接。');
      } else {
        latestProcessLog = emitProgress('当前将使用本地历史上下文模式继续追问。');
      }

      const answer = await askFollowUp(request.question, context, request.settings, signal, emitAnswerDelta);
      throwIfAborted(signal);

      if (answer.usedPreviousResponse) {
        latestProcessLog = emitProgress('追问请求成功，已使用第三方 API 的 previous_response_id 续接本题。');
      } else if (context.previousResponseId) {
        latestProcessLog = emitProgress('已使用本地历史上下文模式完成追问；第三方会话续接不可用或未被采用。');
      } else {
        latestProcessLog = emitProgress('追问请求成功，已使用本地历史上下文完成回答。');
      }

      latestProcessLog = emitProgress('已把本轮追问和回答加入当前题目会话。');
      appendQuestionSessionTurn(request.sessionId, {
        role: 'user',
        content: request.question.trim()
      });
      appendQuestionSessionTurn(request.sessionId, {
        role: 'assistant',
        content: answer.text
      });
      updateQuestionSessionResponseId(request.sessionId, answer.responseId);

      return {
        text: prependProcessLog(latestProcessLog, answer.text),
        sessionId: request.sessionId
      };
    } finally {
      finishCancelableRequest(request.requestId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.explainRegion, async (event, request: ExplainRequest): Promise<ExplainResult> => {
    const signal = beginCancelableRequest(request.requestId);
    const emitProgress = createProgressEmitter(event.sender, request.requestId);
    const emitAnswerDelta = createAnswerDeltaEmitter(event.sender, request.requestId);

    try {
      let latestProcessLog = emitProgress(`准备识别，只处理当前框选区域：${regionText(request.region)}。`);

      mainWindow?.webContents.send(IPC_CHANNELS.setCaptureUiVisible, false);
      latestProcessLog = emitProgress('正在隐藏应用控制层，避免把按钮和结果窗口截入图片。');

      let dataUrl: string;

      try {
        await abortableDelay(120, signal);
        throwIfAborted(signal);
        dataUrl = await captureRegionAsDataUrl(request.region);
        throwIfAborted(signal);
      } finally {
        mainWindow?.webContents.send(IPC_CHANNELS.setCaptureUiVisible, true);
      }
      latestProcessLog = emitProgress('已完成区域截图，并已恢复应用控制层。');

      if (request.settings.inputMode === 'image') {
        latestProcessLog = emitProgress('当前输入方式：直接发送图片。');
        latestProcessLog = emitProgress('已将该区域截图转换为 PNG base64 data URL，正在发送给第三方图片接口。');

        try {
          const answer = await explainImageWithMetadata(dataUrl, request.settings, signal, emitAnswerDelta);
          throwIfAborted(signal);
          latestProcessLog = emitProgress('图片接口请求成功，未启用 OCR 兜底。');
          latestProcessLog = emitProgress('已创建本题会话，可以继续围绕这道题追问。');
          latestProcessLog = emitProgress('未保存截图到磁盘，也未记录截图内容。');
          return createSessionAndResult(
            request,
            'image',
            imageProblemContext(answer.text),
            '用户通过截图直接发送了一道学习题目。',
            answer.text,
            answer.responseId,
            latestProcessLog
          );
        } catch (imageError) {
          if (isOperationCanceled(imageError)) {
            throw imageError;
          }

          // Some third-party providers accept short image requests but fail on larger
          // vision payloads. Keep the screenshot local and fall back to OCR text.
          const imageErrorText = errorMessage(imageError);
          latestProcessLog = emitProgress(`图片接口请求失败，已停止图片直传。失败原因：${compactMessage(imageErrorText)}`);
          latestProcessLog = emitProgress('正在对同一张截图执行本地 OCR 兜底。');
          emitAnswerDelta('', true);
          const recognizedText = await recognizeTextFromDataUrl(dataUrl, request.settings, signal);
          throwIfAborted(signal);
          latestProcessLog = emitProgress(`本地 OCR 已完成，OCR 结果长度：${recognizedText.length} 个字符。`);
          latestProcessLog = emitProgress('正在将 OCR 文本发送给第三方文本接口进行题目讲解。');

          try {
            const answer = await explainRecognizedTextWithMetadata(
              [
                '以下是直接图片接口失败后，本地 OCR 得到的题目文字。',
                '请忽略“图片接口失败”这个技术过程，只根据 OCR 文本中的题目进行学习性讲解。',
                '',
                recognizedText
              ].join('\n'),
              request.settings,
              signal,
              emitAnswerDelta
            );
            throwIfAborted(signal);
            latestProcessLog = emitProgress('OCR 文本接口请求成功，已生成讲解结果。');
            latestProcessLog = emitProgress('已创建本题会话，可以继续围绕这道题追问。');
            latestProcessLog = emitProgress('未保存截图到磁盘，也未记录截图内容。');
            return createSessionAndResult(
              request,
              'image',
              ocrProblemContext(recognizedText, answer.text),
              [
                '用户通过截图直接发送了一道学习题目，但图片接口失败。',
                '程序随后使用本地 OCR 识别出题目文字。',
                '',
                recognizedText
              ].join('\n'),
              answer.text,
              answer.responseId,
              latestProcessLog
            );
          } catch (ocrFallbackError) {
            if (isOperationCanceled(ocrFallbackError)) {
              throw ocrFallbackError;
            }

            latestProcessLog = emitProgress(
              `OCR 兜底后的文本请求失败。失败原因：${compactMessage(errorMessage(ocrFallbackError))}`
            );
            throw new Error(
              [
                latestProcessLog,
                '',
                '## 失败原因',
                '',
                '直接发送图片失败，OCR 兜底后的文本请求也失败。',
                `图片接口错误：${compactMessage(imageErrorText)}`,
                `OCR 文本接口错误：${compactMessage(errorMessage(ocrFallbackError))}`,
                '',
                '建议先切换到“本地 OCR 后发文字”，或在设置里关闭/降低思考程度后重试。'
              ].join('\n')
            );
          }
        }
      } else {
        latestProcessLog = emitProgress('当前输入方式：本地 OCR 后发文字。');
        latestProcessLog = emitProgress('正在对截图执行本地 OCR。');
        const recognizedText = await recognizeTextFromDataUrl(dataUrl, request.settings, signal);
        throwIfAborted(signal);
        latestProcessLog = emitProgress(`本地 OCR 已完成，OCR 结果长度：${recognizedText.length} 个字符。`);
        latestProcessLog = emitProgress('正在将 OCR 文本发送给第三方文本接口进行题目讲解。');
        const answer = await explainRecognizedTextWithMetadata(recognizedText, request.settings, signal, emitAnswerDelta);
        throwIfAborted(signal);
        latestProcessLog = emitProgress('OCR 文本接口请求成功，已生成讲解结果。');
        latestProcessLog = emitProgress('已创建本题会话，可以继续围绕这道题追问。');
        latestProcessLog = emitProgress('未保存截图到磁盘，也未记录截图内容。');
        return createSessionAndResult(
          request,
          'ocr-text',
          ocrProblemContext(recognizedText, answer.text),
          ['用户通过本地 OCR 文本模式提交了一道学习题目。', '', recognizedText].join('\n'),
          answer.text,
          answer.responseId,
          latestProcessLog
        );
      }
    } finally {
      finishCancelableRequest(request.requestId);
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  registerAutoUpdater();
  createWindow();

  if (process.platform === 'win32' && !is.dev) {
    setTimeout(() => {
      void checkForUpdates().catch((error) => {
        emitUpdateStatus({
          status: 'error',
          message: `更新检查失败：${errorMessage(error)}`
        });
      });
    }, 3000);
  }

  screen.on('display-added', () => mainWindow?.setBounds(currentVirtualBounds()));
  screen.on('display-removed', () => mainWindow?.setBounds(currentVirtualBounds()));
  screen.on('display-metrics-changed', () => mainWindow?.setBounds(currentVirtualBounds()));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
