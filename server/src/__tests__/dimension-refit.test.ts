import { describe, it, expect } from "vitest";
import { computeRefitDimensions } from "../lib/dimension-refit.js";

describe("dimension-refit — computeRefitDimensions", () => {
  const original = { width_mm: 80, height_mm: 60, depth_mm: 40 };

  it("scales proportionally when 1 dimension is provided", () => {
    const result = computeRefitDimensions({
      original,
      updated: { width_mm: 100 },
    });
    // scale = 100/80 = 1.25
    expect(result.uniformScale).toBeCloseTo(1.25);
    expect(result.dimensions.width_mm).toBe(100);
    expect(result.dimensions.height_mm).toBeCloseTo(75);
    expect(result.dimensions.depth_mm).toBeCloseTo(50);
  });

  it("uses average scale when 2 dimensions are provided", () => {
    const result = computeRefitDimensions({
      original,
      updated: { width_mm: 160, height_mm: 120 },
    });
    // width scale = 160/80 = 2, height scale = 120/60 = 2 → avg = 2
    expect(result.uniformScale).toBeCloseTo(2);
    expect(result.dimensions.width_mm).toBe(160);
    expect(result.dimensions.height_mm).toBe(120);
    expect(result.dimensions.depth_mm).toBeCloseTo(80);
  });

  it("returns user dimensions as-is when all 3 are provided", () => {
    const result = computeRefitDimensions({
      original,
      updated: { width_mm: 100, height_mm: 200, depth_mm: 50 },
    });
    expect(result.uniformScale).toBeNull();
    expect(result.dimensions).toEqual({
      width_mm: 100,
      height_mm: 200,
      depth_mm: 50,
    });
  });

  it("returns original unchanged when no dimensions are provided", () => {
    const result = computeRefitDimensions({
      original,
      updated: {},
    });
    expect(result.uniformScale).toBe(1);
    expect(result.dimensions).toEqual(original);
  });

  it("handles height-only refit correctly", () => {
    const result = computeRefitDimensions({
      original,
      updated: { height_mm: 30 },
    });
    // scale = 30/60 = 0.5
    expect(result.uniformScale).toBeCloseTo(0.5);
    expect(result.dimensions.width_mm).toBeCloseTo(40);
    expect(result.dimensions.height_mm).toBe(30);
    expect(result.dimensions.depth_mm).toBeCloseTo(20);
  });

  it("handles depth + width refit with different ratios", () => {
    const result = computeRefitDimensions({
      original,
      updated: { width_mm: 120, depth_mm: 60 },
    });
    // width scale = 120/80 = 1.5, depth scale = 60/40 = 1.5 → avg = 1.5
    expect(result.uniformScale).toBeCloseTo(1.5);
    expect(result.dimensions.width_mm).toBe(120);
    expect(result.dimensions.height_mm).toBeCloseTo(90);
    expect(result.dimensions.depth_mm).toBe(60);
  });
});
