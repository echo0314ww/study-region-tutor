import type { CropPlan, CropSegment, DisplayLike, RegionBounds } from '../shared/types';

const MIN_CAPTURE_SIZE = 4;

function intersectionArea(a: RegionBounds, b: RegionBounds): number {
  const intersection = intersectionRegion(a, b);

  return intersection ? intersection.width * intersection.height : 0;
}

function intersectionRegion(a: RegionBounds, b: RegionBounds): RegionBounds | undefined {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    x: left,
    y: top,
    width,
    height
  };
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

function cropPixelsFor(display: DisplayLike, sourceDipRegion: RegionBounds): RegionBounds {
  return {
    x: Math.round((sourceDipRegion.x - display.bounds.x) * display.scaleFactor),
    y: Math.round((sourceDipRegion.y - display.bounds.y) * display.scaleFactor),
    width: Math.round(sourceDipRegion.width * display.scaleFactor),
    height: Math.round(sourceDipRegion.height * display.scaleFactor)
  };
}

function outputPixelsFor(region: RegionBounds, sourceDipRegion: RegionBounds, outputScaleFactor: number): RegionBounds {
  return {
    x: Math.round((sourceDipRegion.x - region.x) * outputScaleFactor),
    y: Math.round((sourceDipRegion.y - region.y) * outputScaleFactor),
    width: Math.round(sourceDipRegion.width * outputScaleFactor),
    height: Math.round(sourceDipRegion.height * outputScaleFactor)
  };
}

function createSegment(display: DisplayLike, sourceDipRegion: RegionBounds, region: RegionBounds, outputScaleFactor: number): CropSegment {
  return {
    displayId: display.id,
    sourceDipBounds: display.bounds,
    sourceDipRegion,
    cropPixels: cropPixelsFor(display, sourceDipRegion),
    outputPixels: outputPixelsFor(region, sourceDipRegion, outputScaleFactor)
  };
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
  if (region.width < MIN_CAPTURE_SIZE || region.height < MIN_CAPTURE_SIZE) {
    throw new Error('The selected region is too small to capture.');
  }

  const intersectingDisplays = displays
    .map((display) => ({
      display,
      sourceDipRegion: intersectionRegion(region, display.bounds)
    }))
    .filter((item): item is { display: DisplayLike; sourceDipRegion: RegionBounds } => Boolean(item.sourceDipRegion));
  const outputScaleFactor = Math.max(...intersectingDisplays.map((item) => item.display.scaleFactor), 1);
  const segments = intersectingDisplays
    .map((item) => createSegment(item.display, item.sourceDipRegion, region, outputScaleFactor))
    .filter((segment) => segment.cropPixels.width > 0 && segment.cropPixels.height > 0);

  if (segments.length > 0) {
    const primarySegment = segments[0];

    return {
      displayId: primarySegment.displayId,
      sourceDipBounds: primarySegment.sourceDipBounds,
      cropPixels: primarySegment.cropPixels,
      outputScaleFactor,
      outputPixels: {
        x: 0,
        y: 0,
        width: Math.round(region.width * outputScaleFactor),
        height: Math.round(region.height * outputScaleFactor)
      },
      segments
    };
  }

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
  const sourceDipRegion = {
    x: sourceDipBounds.x + localDipX,
    y: sourceDipBounds.y + localDipY,
    width: localDipWidth,
    height: localDipHeight
  };
  const cropPixels = cropPixelsFor(display, sourceDipRegion);
  const fallbackOutputScaleFactor = display.scaleFactor;
  const segment = createSegment(display, sourceDipRegion, region, fallbackOutputScaleFactor);

  return {
    displayId: display.id,
    sourceDipBounds,
    cropPixels,
    outputScaleFactor: fallbackOutputScaleFactor,
    outputPixels: {
      x: 0,
      y: 0,
      width: Math.round(localDipWidth * fallbackOutputScaleFactor),
      height: Math.round(localDipHeight * fallbackOutputScaleFactor)
    },
    segments: [segment]
  };
}
