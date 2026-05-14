import { app, desktopCapturer, screen } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
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

  const filename = `study-region-tutor-${Date.now()}-${snapshot.displayId}.png`;
  await writeFile(join(app.getPath('temp'), filename), buffer);
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
  const source =
    sources.find((candidate) => Number(candidate.display_id) === display.id) ??
    sources.find((candidate) => candidate.name.includes(String(display.id))) ??
    sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('No screen source was returned by the operating system.');
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
    for (let x = 0; x < width; x += 1) {
      const targetIndex = ((outputPixels.y + y) * target.width + outputPixels.x + x) * 4;
      const sourceIndex = (y * segmentPng.width + x) * 4;

      target.data[targetIndex] = segmentPng.data[sourceIndex];
      target.data[targetIndex + 1] = segmentPng.data[sourceIndex + 1];
      target.data[targetIndex + 2] = segmentPng.data[sourceIndex + 2];
      target.data[targetIndex + 3] = segmentPng.data[sourceIndex + 3];
    }
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
