import type { CropPlan, DisplayLike, RegionBounds } from '../shared/types';

const MIN_CAPTURE_SIZE = 4;

function intersectionArea(a: RegionBounds, b: RegionBounds): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function selectDisplay(region: RegionBounds, displays: DisplayLike[]): DisplayLike | undefined {
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;
  const centered = displays.find((display) => {
    const { bounds } = display;
    return (
      centerX >= bounds.x &&
      centerX <= bounds.x + bounds.width &&
      centerY >= bounds.y &&
      centerY <= bounds.y + bounds.height
    );
  });

  if (centered) {
    return centered;
  }

  return displays
    .map((display) => ({ display, area: intersectionArea(region, display.bounds) }))
    .sort((a, b) => b.area - a.area)[0]?.display;
}

export function getVirtualBounds(displays: DisplayLike[]): RegionBounds {
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function createCropPlan(region: RegionBounds, displays: DisplayLike[]): CropPlan {
  const display = selectDisplay(region, displays);

  if (!display) {
    throw new Error('No display is available for capture.');
  }

  const sourceDipBounds = display.bounds;
  const localDipX = clamp(region.x - sourceDipBounds.x, 0, sourceDipBounds.width);
  const localDipY = clamp(region.y - sourceDipBounds.y, 0, sourceDipBounds.height);
  const maxDipWidth = Math.max(0, sourceDipBounds.width - localDipX);
  const maxDipHeight = Math.max(0, sourceDipBounds.height - localDipY);
  const localDipWidth = clamp(region.width, 0, maxDipWidth);
  const localDipHeight = clamp(region.height, 0, maxDipHeight);

  if (localDipWidth < MIN_CAPTURE_SIZE || localDipHeight < MIN_CAPTURE_SIZE) {
    throw new Error('The selected region is too small to capture.');
  }

  // Electron display bounds are in DIP coordinates while desktopCapturer thumbnails
  // are pixel images. Multiplying by scaleFactor keeps crops correct on HiDPI displays.
  const cropPixels = {
    x: Math.round(localDipX * display.scaleFactor),
    y: Math.round(localDipY * display.scaleFactor),
    width: Math.round(localDipWidth * display.scaleFactor),
    height: Math.round(localDipHeight * display.scaleFactor)
  };

  return {
    displayId: display.id,
    sourceDipBounds,
    cropPixels
  };
}
