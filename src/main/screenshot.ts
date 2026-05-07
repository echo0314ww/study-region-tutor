import { app, desktopCapturer, screen } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { DebugSnapshot, DisplayLike, RegionBounds } from '../shared/types';
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

export async function captureRegionAsDataUrl(region: RegionBounds): Promise<string> {
  try {
    const displays = toDisplayLike();
    const plan = createCropPlan(region, displays);
    const display = displays.find((candidate) => candidate.id === plan.displayId);

    if (!display) {
      throw new Error('The selected display disappeared before capture.');
    }

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

    // The thumbnail is a bitmap of the selected physical display. cropPixels has
    // already converted from Electron DIP coordinates into physical pixels.
    const cropped = source.thumbnail.crop(plan.cropPixels);

    if (cropped.isEmpty()) {
      throw new Error('The cropped screenshot is empty. Try moving the selection inside one display.');
    }

    const buffer = cropped.toPNG();
    await maybeWriteDebugPng(buffer, {
      region,
      displayId: display.id,
      scaleFactor: display.scaleFactor,
      cropPixels: plan.cropPixels
    });

    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    throw friendlyCaptureError(error);
  }
}
