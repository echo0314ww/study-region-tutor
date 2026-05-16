import { app, desktopCapturer, screen } from 'electron';
import { join } from 'node:path';
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import type { CropPlan, CropSegment, DebugSnapshot, DisplayLike, RegionBounds } from '../shared/types';
import { createCropPlan } from './geometry';

let debugMode = false;

export function setScreenshotDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

function toDisplayLike(): DisplayLike[] {
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds
  }));
}

function friendlyCaptureError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (process.platform === 'darwin') {
    return new Error(
      [
        '截图失败。macOS 可能还没有授予屏幕录制权限。',
        '请打开“系统设置 > 隐私与安全性 > 屏幕录制”，允许本应用录制屏幕，然后重启应用。',
        message
      ].join('\n')
    );
  }

  return new Error(
    [
      '截图失败，请确认系统允许此应用捕获屏幕，且当前没有安全策略阻止截图。',
      `原始错误：${message}`
    ].join('\n')
  );
}

async function maybeWriteDebugPng(buffer: Buffer, snapshot: DebugSnapshot): Promise<void> {
  if (!debugMode) {
    return;
  }

  const tempDir = app.getPath('temp');
  await cleanupDebugPngs(tempDir);
  const filename = `study-region-tutor-${Date.now()}-${snapshot.displayId}.png`;
  await writeFile(join(tempDir, filename), buffer);
}

async function cleanupDebugPngs(tempDir: string): Promise<void> {
  const entries = await readdir(tempDir).catch(() => []);
  const snapshots = await Promise.all(
    entries
      .filter((entry) => /^study-region-tutor-\d+-.+\.png$/.test(entry))
      .map(async (entry) => {
        const path = join(tempDir, entry);
        const stats = await stat(path).catch(() => undefined);
        return stats ? { path, mtimeMs: stats.mtimeMs } : undefined;
      })
  );
  const stale = snapshots
    .filter((item): item is { path: string; mtimeMs: number } => Boolean(item))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(20);

  await Promise.all(stale.map((item) => rm(item.path, { force: true }).catch(() => undefined)));
}

async function captureSegment(display: DisplayLike, segment: CropSegment): Promise<Buffer> {
  const physicalWidth = Math.round(display.bounds.width * display.scaleFactor);
  const physicalHeight = Math.round(display.bounds.height * display.scaleFactor);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: physicalWidth,
      height: physicalHeight
    }
  });
  const source = sources.find((candidate) => Number(candidate.display_id) === display.id);

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('No matching screen source was returned by the operating system. Try using one display.');
  }

  let image = source.thumbnail.crop(segment.cropPixels);

  if (image.isEmpty()) {
    throw new Error('The cropped screenshot is empty. Try moving the selection inside one display.');
  }

  if (
    segment.outputPixels.width !== segment.cropPixels.width ||
    segment.outputPixels.height !== segment.cropPixels.height
  ) {
    image = image.resize({
      width: segment.outputPixels.width,
      height: segment.outputPixels.height,
      quality: 'best'
    });
  }

  return image.toPNG();
}

function writeSegment(target: PNG, segmentPng: PNG, outputPixels: RegionBounds): void {
  const width = Math.min(segmentPng.width, outputPixels.width, target.width - outputPixels.x);
  const height = Math.min(segmentPng.height, outputPixels.height, target.height - outputPixels.y);

  for (let y = 0; y < height; y += 1) {
    const targetStart = ((outputPixels.y + y) * target.width + outputPixels.x) * 4;
    const sourceStart = y * segmentPng.width * 4;
    segmentPng.data.copy(target.data, targetStart, sourceStart, sourceStart + width * 4);
  }
}

function composeSegments(plan: CropPlan, segmentBuffers: Array<{ segment: CropSegment; buffer: Buffer }>): Buffer {
  const target = new PNG({
    width: plan.outputPixels.width,
    height: plan.outputPixels.height
  });

  target.data.fill(0);

  for (const { segment, buffer } of segmentBuffers) {
    writeSegment(target, PNG.sync.read(buffer), segment.outputPixels);
  }

  return PNG.sync.write(target);
}

export async function captureRegionAsDataUrl(region: RegionBounds): Promise<string> {
  try {
    const displays = toDisplayLike();
    const plan = createCropPlan(region, displays);
    const segmentBuffers = [];

    for (const segment of plan.segments) {
      const display = displays.find((candidate) => candidate.id === segment.displayId);

      if (!display) {
        throw new Error('The selected display disappeared before capture.');
      }

      segmentBuffers.push({
        segment,
        buffer: await captureSegment(display, segment)
      });
    }

    const buffer = segmentBuffers.length === 1 ? segmentBuffers[0].buffer : composeSegments(plan, segmentBuffers);
    await maybeWriteDebugPng(buffer, {
      region,
      displayId: segmentBuffers.length === 1 ? segmentBuffers[0].segment.displayId : `multi-${segmentBuffers.length}`,
      scaleFactor: plan.outputScaleFactor,
      cropPixels: plan.cropPixels
    });

    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    throw friendlyCaptureError(error);
  }
}
