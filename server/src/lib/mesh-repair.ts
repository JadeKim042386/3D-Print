/**
 * mesh-repair.ts
 *
 * Conservative auto-repair for STL meshes.
 * Currently supports flipping inverted normals to match winding order.
 */

export interface RepairResult {
  buffer: Buffer;
  repairsApplied: string[];
  normalsFlipped: number;
}

/**
 * Repair an STL mesh by flipping inverted normals.
 *
 * For each triangle, computes the winding-order normal via cross product
 * and compares with the stored normal. If they disagree (dot product < 0),
 * swaps v1 ↔ v2 to fix winding order and recalculates the stored normal.
 *
 * Returns a new buffer (does not mutate input).
 */
export function repairStlMesh(buf: Buffer): RepairResult {
  const repairsApplied: string[] = [];

  if (buf.length < 84) {
    return { buffer: buf, repairsApplied: [], normalsFlipped: 0 };
  }

  const triCount = buf.readUInt32LE(80);
  if (triCount === 0) {
    return { buffer: buf, repairsApplied: [], normalsFlipped: 0 };
  }

  // Work on a copy
  const out = Buffer.from(buf);
  let normalsFlipped = 0;

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    // Read stored normal
    const nx = out.readFloatLE(offset);
    const ny = out.readFloatLE(offset + 4);
    const nz = out.readFloatLE(offset + 8);

    // Read vertices
    const v0x = out.readFloatLE(offset + 12);
    const v0y = out.readFloatLE(offset + 16);
    const v0z = out.readFloatLE(offset + 20);
    const v1x = out.readFloatLE(offset + 24);
    const v1y = out.readFloatLE(offset + 28);
    const v1z = out.readFloatLE(offset + 32);
    const v2x = out.readFloatLE(offset + 36);
    const v2y = out.readFloatLE(offset + 40);
    const v2z = out.readFloatLE(offset + 44);

    // Compute winding-order normal
    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    const dot = nx * cx + ny * cy + nz * cz;

    if (dot < 0) {
      // Swap v1 and v2 to fix winding order
      out.writeFloatLE(v2x, offset + 24);
      out.writeFloatLE(v2y, offset + 28);
      out.writeFloatLE(v2z, offset + 32);
      out.writeFloatLE(v1x, offset + 36);
      out.writeFloatLE(v1y, offset + 40);
      out.writeFloatLE(v1z, offset + 44);

      // Update stored normal to match new winding (negated since swap reverses cross product)
      const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (len > 0) {
        out.writeFloatLE(-cx / len, offset);
        out.writeFloatLE(-cy / len, offset + 4);
        out.writeFloatLE(-cz / len, offset + 8);
      }

      normalsFlipped++;
    }

    offset += 50;
  }

  if (normalsFlipped > 0) {
    repairsApplied.push(`Flipped ${normalsFlipped} inverted normals`);
  }

  return { buffer: out, repairsApplied, normalsFlipped };
}
