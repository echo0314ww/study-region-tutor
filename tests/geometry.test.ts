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
  });

  it('clamps regions to the chosen display', () => {
    const plan = createCropPlan({ x: 3300, y: 820, width: 200, height: 200 }, displays);

    expect(plan.displayId).toBe(2);
    expect(plan.cropPixels).toEqual({ x: 2760, y: 1640, width: 120, height: 160 });
  });
});
