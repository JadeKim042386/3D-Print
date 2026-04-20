import { describe, it, expect } from "vitest";
import { classifyShape } from "../lib/shape-classifier.js";
import { generateParametricStl } from "../lib/parametric-generator.js";
import { buildDimensionAwarePrompt } from "../lib/dimension-prompt.js";
import { scaleBufferToDimensions } from "../lib/dimension-scaler.js";
import { validateDimensions } from "../lib/dimension-validator.js";

// ---------------------------------------------------------------------------
// shape-classifier tests
// ---------------------------------------------------------------------------

describe("shape-classifier", () => {
  it("classifies 'box' prompts as parametric", () => {
    const r = classifyShape("a storage box for desk items");
    expect(r.category).toBe("parametric");
    expect(r.parametricType).toBe("box");
  });

  it("classifies 'stand' prompts as parametric", () => {
    const r = classifyShape("phone stand for desk");
    expect(r.category).toBe("parametric");
    expect(r.parametricType).toBe("stand");
  });

  it("classifies 'cylinder' prompts as parametric", () => {
    const r = classifyShape("a solid cylinder");
    expect(r.category).toBe("parametric");
    expect(r.parametricType).toBe("cylinder");
  });

  it("classifies 'mug' as organic despite box-like shape", () => {
    const r = classifyShape("a coffee mug");
    expect(r.category).toBe("organic");
  });

  it("classifies 'dragon' as organic", () => {
    const r = classifyShape("a dragon figurine");
    expect(r.category).toBe("organic");
  });

  it("classifies 'bracket' as parametric", () => {
    const r = classifyShape("an L-bracket wall mount");
    expect(r.category).toBe("parametric");
    expect(r.parametricType).toBe("bracket");
  });

  it("organic override beats parametric keyword (mug + box)", () => {
    const r = classifyShape("a box-shaped mug");
    expect(r.category).toBe("organic");
  });

  it("unknown prompts default to organic", () => {
    const r = classifyShape("something complex and artistic");
    expect(r.category).toBe("organic");
  });
});

// ---------------------------------------------------------------------------
// parametric-generator tests
// ---------------------------------------------------------------------------

describe("parametric-generator", () => {
  const dims = { width_mm: 80, height_mm: 60, depth_mm: 40 };

  it("generates a valid binary STL for a box", () => {
    const buf = generateParametricStl({ type: "box", dimensions: dims });
    // Check STL header magic area (at least has triangle count)
    const triCount = buf.readUInt32LE(80);
    expect(triCount).toBeGreaterThan(0);
    expect(buf.length).toBe(80 + 4 + triCount * 50);
  });

  it("box AABB matches requested dimensions exactly", async () => {
    const buf = generateParametricStl({ type: "box", dimensions: dims });
    const result = await scaleBufferToDimensions(buf, dims, "stl");
    // After 'scaling' with same target, actual dims should match — or if the
    // parametric output is already correct, scaleBuffer re-measures close to target
    const validation = validateDimensions(dims, result.actualDimensions, 0.1);
    // Proportional scale will fit within box — so max error should be very small
    expect(validation.max_error_mm).toBeLessThan(1);
  });

  it("generates a valid binary STL for a cylinder", () => {
    const buf = generateParametricStl({ type: "cylinder", dimensions: dims });
    const triCount = buf.readUInt32LE(80);
    expect(triCount).toBeGreaterThan(0);
  });

  it("generates a valid binary STL for a tube", () => {
    const buf = generateParametricStl({ type: "tube", dimensions: dims });
    const triCount = buf.readUInt32LE(80);
    expect(triCount).toBeGreaterThan(0);
  });

  it("generates a valid binary STL for a bracket", () => {
    const buf = generateParametricStl({ type: "bracket", dimensions: dims });
    const triCount = buf.readUInt32LE(80);
    expect(triCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// dimension-prompt tests
// ---------------------------------------------------------------------------

describe("dimension-prompt", () => {
  it("includes all three dimensions in the enriched prompt", () => {
    const result = buildDimensionAwarePrompt("a coffee mug", {
      width_mm: 80, height_mm: 90, depth_mm: 80,
    });
    expect(result).toContain("80mm");
    expect(result).toContain("90mm");
    expect(result).toContain("coffee mug");
    expect(result).toContain("precisely designed");
    expect(result).toContain("3D printing");
  });

  it("includes size context for small objects", () => {
    const result = buildDimensionAwarePrompt("a ring", {
      width_mm: 20, height_mm: 5, depth_mm: 20,
    });
    expect(result).toContain("small");
  });

  it("includes size context for large objects", () => {
    const result = buildDimensionAwarePrompt("a shelf", {
      width_mm: 400, height_mm: 200, depth_mm: 150,
    });
    expect(result).toContain("large");
  });
});
