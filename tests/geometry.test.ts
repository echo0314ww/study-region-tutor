import { describe, expect, it } from 'vitest';
import { createCropPlan, getVirtualBounds } from '../src/main/geometry';
import type { DisplayLike } from '../src/shared/types';

const displays: DisplayLike[] = [
  {
    id: 1,
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  },
  {
    id: 2,
    scaleFactor: 2,
    bounds: { x: 1920, y: 0, width: 1440, height: 900 }
  }
];

describe('geometry', () => {
  it('computes virtual display bounds', () => {
    expect(getVirtualBounds(displays)).toEqual({ x: 0, y: 0, width: 3360, height: 1080 });
  });

  it('converts selected DIP region to physical pixels on HiDPI displays', () => {
    const plan = createCropPlan({ x: 2020, y: 100, width: 300, height: 180 }, displays);

    expect(plan.displayId).toBe(2);
    expect(plan.cropPixels).toEqual({ x: 200, y: 200, width: 600, height: 360 });
    expect(plan.segments).toHaveLength(1);
  });

  it('clamps regions to the chosen display', () => {
    const plan = createCropPlan({ x: 3300, y: 820, width: 200, height: 200 }, displays);

    expect(plan.displayId).toBe(2);
    expect(plan.cropPixels).toEqual({ x: 2760, y: 1640, width: 120, height: 160 });
  });

  it('creates multiple crop segments for selections spanning displays', () => {
    const plan = createCropPlan({ x: 1800, y: 100, width: 300, height: 120 }, displays);

    expect(plan.outputScaleFactor).toBe(2);
    expect(plan.outputPixels).toEqual({ x: 0, y: 0, width: 600, height: 240 });
    expect(plan.segments).toEqual([
      {
        displayId: 1,
        sourceDipBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        sourceDipRegion: { x: 1800, y: 100, width: 120, height: 120 },
        cropPixels: { x: 1800, y: 100, width: 120, height: 120 },
        outputPixels: { x: 0, y: 0, width: 240, height: 240 }
      },
      {
        displayId: 2,
        sourceDipBounds: { x: 1920, y: 0, width: 1440, height: 900 },
        sourceDipRegion: { x: 1920, y: 100, width: 180, height: 120 },
        cropPixels: { x: 0, y: 200, width: 360, height: 240 },
        outputPixels: { x: 240, y: 0, width: 360, height: 240 }
      }
    ]);
  });

  it('handles displays with negative coordinates', () => {
    const negativeDisplays: DisplayLike[] = [
      {
        id: 1,
        scaleFactor: 1,
        bounds: { x: -1280, y: 0, width: 1280, height: 720 }
      },
      {
        id: 2,
        scaleFactor: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 }
      }
    ];
    const plan = createCropPlan({ x: -80, y: 50, width: 160, height: 100 }, negativeDisplays);

    expect(plan.segments.map((segment) => segment.cropPixels)).toEqual([
      { x: 1200, y: 50, width: 80, height: 100 },
      { x: 0, y: 50, width: 80, height: 100 }
    ]);
    expect(plan.segments.map((segment) => segment.outputPixels)).toEqual([
      { x: 0, y: 0, width: 80, height: 100 },
      { x: 80, y: 0, width: 80, height: 100 }
    ]);
  });
});
