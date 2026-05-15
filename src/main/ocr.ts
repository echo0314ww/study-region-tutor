import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import type { OcrCandidate, OcrLanguage, OcrPreprocessMode, OcrRecognitionResult, TutorSettings } from '../shared/types';
import { abortPromise, isOperationCanceled, throwIfAborted } from './cancel';

type OcrWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>;

interface CachedWorker {
  language: OcrLanguage;
  workerPromise: Promise<OcrWorker>;
  queue: Promise<unknown>;
  idleTimer?: NodeJS.Timeout;
}

const WORKER_IDLE_RELEASE_MS = 120000;
const workerCache = new Map<OcrLanguage, CachedWorker>();

function nowMs(): number {
  return Date.now();
}

function workerForLanguage(language: OcrLanguage): CachedWorker {
  const cached = workerCache.get(language);

  if (cached) {
    return cached;
  }

  const startedAt = nowMs();
  const entry: CachedWorker = {
    language,
    workerPromise: Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY, {
      logger: () => undefined
    }).then((worker) => {
      console.log(`[ocr] initialized ${language} worker in ${nowMs() - startedAt}ms`);
      return worker;
    }),
    queue: Promise.resolve()
  };

  workerCache.set(language, entry);
  return entry;
}

function scheduleWorkerRelease(entry: CachedWorker): void {
  clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    if (workerCache.get(entry.language) !== entry) {
      return;
    }

    workerCache.delete(entry.language);
    void entry.workerPromise
      .then((worker) => worker.terminate())
      .then(() => console.log(`[ocr] released idle ${entry.language} worker`))
      .catch(() => undefined);
  }, WORKER_IDLE_RELEASE_MS);
}

async function terminateWorker(language: OcrLanguage, entry: CachedWorker): Promise<void> {
  if (workerCache.get(language) === entry) {
    workerCache.delete(language);
  }

  clearTimeout(entry.idleTimer);
  await entry.workerPromise.then((worker) => worker.terminate()).catch(() => undefined);
}

function withCachedWorker<T>(
  language: OcrLanguage,
  signal: AbortSignal | undefined,
  task: (worker: OcrWorker) => Promise<T>
): Promise<T> {
  const entry = workerForLanguage(language);
  const run = async (): Promise<T> => {
    clearTimeout(entry.idleTimer);
    throwIfAborted(signal);
    const worker = await entry.workerPromise;
    const onAbort = (): void => {
      void terminateWorker(language, entry);
    };

    try {
      signal?.addEventListener('abort', onAbort, { once: true });
      throwIfAborted(signal);
      return await task(worker);
    } finally {
      signal?.removeEventListener('abort', onAbort);

      if (workerCache.get(language) === entry) {
        scheduleWorkerRelease(entry);
      }
    }
  };
  const result = entry.queue.catch(() => undefined).then(run);

  entry.queue = result.catch(() => undefined);
  return result;
}

export async function disposeOcrWorkers(): Promise<void> {
  const entries = [...workerCache.entries()];
  workerCache.clear();

  await Promise.all(
    entries.map(([, entry]) => {
      clearTimeout(entry.idleTimer);
      return entry.workerPromise.then((worker) => worker.terminate()).catch(() => undefined);
    })
  );
}

function bufferFromDataUrl(dataUrl: string): Buffer {
  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);

  if (index < 0) {
    throw new Error('截图数据格式不正确，无法进行 OCR。');
  }

  return Buffer.from(dataUrl.slice(index + marker.length), 'base64');
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function scalePng(source: PNG, factor: number): PNG {
  const target = new PNG({
    width: source.width * factor,
    height: source.height * factor
  });

  for (let y = 0; y < target.height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / factor));

    for (let x = 0; x < target.width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / factor));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (y * target.width + x) * 4;

      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  return target;
}

function toGrayValues(source: PNG, contrast: number): Uint8Array {
  const values = new Uint8Array(source.width * source.height);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = (y * source.width + x) * 4;
      const alpha = source.data[index + 3] / 255;
      const red = source.data[index] * alpha + 255 * (1 - alpha);
      const green = source.data[index + 1] * alpha + 255 * (1 - alpha);
      const blue = source.data[index + 2] * alpha + 255 * (1 - alpha);
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;

      values[y * source.width + x] = clampByte((luminance - 128) * contrast + 128);
    }
  }

  return values;
}

function otsuThreshold(values: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);

  for (const value of values) {
    histogram[value] += 1;
  }

  const total = values.length;
  let sum = 0;

  for (let i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 180;

  for (let i = 0; i < 256; i += 1) {
    weightBackground += histogram[i];

    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = total - weightBackground;

    if (weightForeground === 0) {
      break;
    }

    sumBackground += i * histogram[i];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

function pngFromGray(source: PNG, values: Uint8Array, threshold?: number): PNG {
  const target = new PNG({
    width: source.width,
    height: source.height
  });

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const gray = values[y * source.width + x];
      const value = threshold === undefined ? gray : gray < threshold ? 0 : 255;
      const index = (y * source.width + x) * 4;

      target.data[index] = value;
      target.data[index + 1] = value;
      target.data[index + 2] = value;
      target.data[index + 3] = 255;
    }
  }

  return target;
}

function invertPng(source: PNG): PNG {
  const target = new PNG({
    width: source.width,
    height: source.height
  });

  for (let index = 0; index < source.data.length; index += 4) {
    target.data[index] = 255 - source.data[index];
    target.data[index + 1] = 255 - source.data[index + 1];
    target.data[index + 2] = 255 - source.data[index + 2];
    target.data[index + 3] = source.data[index + 3];
  }

  return target;
}

function createEnhancedImages(
  imageBuffer: Buffer,
  mode: OcrPreprocessMode
): Array<{ label: string; buffer: Buffer }> {
  if (mode === 'none') {
    return [];
  }

  const source = PNG.sync.read(imageBuffer);
  const longestSide = Math.max(source.width, source.height);
  const scaleFactor = longestSide < 700 ? 3 : 2;
  const scaled = scalePng(source, scaleFactor);
  const grayValues = toGrayValues(scaled, 1.45);
  const threshold = otsuThreshold(grayValues);
  const contrastPng = pngFromGray(scaled, grayValues);
  const binaryPng = pngFromGray(scaled, grayValues, threshold);
  const variants: Array<{ label: string; buffer: Buffer }> = [];

  if (mode === 'auto' || mode === 'contrast' || mode === 'multi') {
    variants.push({ label: '增强对比度识别', buffer: PNG.sync.write(contrastPng) });
  }

  if (mode === 'auto' || mode === 'binary' || mode === 'multi') {
    variants.push({ label: '增强二值化识别', buffer: PNG.sync.write(binaryPng) });
  }

  if (mode === 'multi') {
    variants.push({ label: '反色二值化识别', buffer: PNG.sync.write(invertPng(binaryPng)) });
  }

  return variants;
}

async function recognizeCandidate(
  imageBuffer: Buffer,
  language: OcrLanguage,
  label: string,
  psm: Tesseract.PSM,
  signal?: AbortSignal
): Promise<OcrCandidate> {
  return withCachedWorker(language, signal, async (worker) => {
    const startedAt = nowMs();
    // Higher DPI and preserved spaces help formulas where layout and small symbols matter.
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: psm,
      user_defined_dpi: '300'
    });

    throwIfAborted(signal);
    const result = await Promise.race([worker.recognize(imageBuffer), abortPromise(signal)]);
    throwIfAborted(signal);
    console.log(`[ocr] recognized ${label}/${language} in ${nowMs() - startedAt}ms`);

    return {
      id: '',
      label,
      language,
      confidence: Math.round(result.data.confidence),
      text: result.data.text.trim()
    };
  });
}

async function tryRecognizeCandidate(
  imageBuffer: Buffer,
  language: OcrLanguage,
  label: string,
  psm: Tesseract.PSM,
  signal?: AbortSignal
): Promise<OcrCandidate | undefined> {
  try {
    return await recognizeCandidate(imageBuffer, language, label, psm, signal);
  } catch (error) {
    if (isOperationCanceled(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.warn(`OCR candidate failed (${label}/${language}): ${message}`);
    return undefined;
  }
}

function uniqueCandidates(candidates: OcrCandidate[]): OcrCandidate[] {
  const seen = new Set<string>();
  const unique: OcrCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.text.replace(/\s+/g, ' ').trim().toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique.sort((a, b) => b.confidence - a.confidence);
}

function formatCandidates(candidates: OcrCandidate[]): string {
  if (candidates.length === 0) {
    return '';
  }

  if (candidates.length === 1) {
    return candidates[0].text;
  }

  return [
    '以下是本地 OCR 的多路候选结果。公式、上下标、根号、分式和符号可能分散在不同候选中，请综合判断：',
    '',
    ...candidates.map((candidate, index) => {
      return [
        `候选 ${index + 1}：${candidate.label} / ${candidate.language} / confidence ${candidate.confidence}`,
        candidate.text
      ].join('\n');
    })
  ].join('\n\n');
}

export async function recognizeTextFromDataUrl(
  dataUrl: string,
  settings: TutorSettings,
  signal?: AbortSignal
): Promise<OcrRecognitionResult> {
  try {
    throwIfAborted(signal);
    const imageBuffer = bufferFromDataUrl(dataUrl);
    const candidates: OcrCandidate[] = [];
    const primaryCandidate = await tryRecognizeCandidate(
      imageBuffer,
      settings.ocrLanguage,
      '原图识别',
      Tesseract.PSM.AUTO,
      signal
    );

    throwIfAborted(signal);

    if (primaryCandidate) {
      candidates.push(primaryCandidate);
    }

    const preprocessMode = settings.ocrPreprocessMode || 'auto';

    if (settings.ocrMathMode || preprocessMode !== 'none') {
      throwIfAborted(signal);
      const enhancedImages = createEnhancedImages(imageBuffer, preprocessMode);
      const formulaLanguage: OcrLanguage = 'eng';

      for (const variant of enhancedImages) {
        const enhancedCandidate = await tryRecognizeCandidate(
          variant.buffer,
          settings.ocrLanguage,
          variant.label,
          Tesseract.PSM.SPARSE_TEXT,
          signal
        );

        throwIfAborted(signal);

        if (enhancedCandidate) {
          candidates.push(enhancedCandidate);
        }
      }

      if (settings.ocrMathMode && enhancedImages.length > 0) {
        const formulaCandidate = await tryRecognizeCandidate(
          enhancedImages[0].buffer,
          formulaLanguage,
          '公式优先识别',
          Tesseract.PSM.SPARSE_TEXT,
          signal
        );
        throwIfAborted(signal);

        if (formulaCandidate) {
          candidates.push(formulaCandidate);
        }
      }
    }

    const unique = uniqueCandidates(candidates).map((candidate, index) => ({
      ...candidate,
      id: `ocr-candidate-${index + 1}`
    }));

    return {
      recognizedText: formatCandidates(unique),
      candidates: unique
    };
  } catch (error) {
    if (isOperationCanceled(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      [
        '本地 OCR 识别失败。',
        '请确认网络可访问 Tesseract 语言数据，或稍后重试。首次识别中文可能需要下载 chi_sim 语言包。',
        `原始错误：${message}`
      ].join('\n')
    );
  }
}
