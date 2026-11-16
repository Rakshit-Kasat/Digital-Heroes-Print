/**
 * Print-area locking (PRD §06): customer elements must stay inside the safe
 * area (the trim inset by safe_mm). Used live by the designer while dragging,
 * scaling and rotating, and again on the server as a preflight check.
 * Rotation is respected: we clamp the rotated element's bounding box.
 */
import type { DesignDoc } from "@/lib/design/types";

export interface Box { x: number; y: number; w: number; h: number; rotation: number }
export interface Area { x: number; y: number; w: number; h: number }

export function printArea(doc: Pick<DesignDoc, "widthMm" | "heightMm" | "safeMm">): Area {
  return { x: doc.safeMm, y: doc.safeMm, w: doc.widthMm - 2 * doc.safeMm, h: doc.heightMm - 2 * doc.safeMm };
}

/** Axis-aligned bounds of a box rotated about its centre. */
export function rotatedBounds(b: Box) {
  const r = (b.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
  const bw = b.w * cos + b.h * sin;
  const bh = b.w * sin + b.h * cos;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return { minX: cx - bw / 2, minY: cy - bh / 2, maxX: cx + bw / 2, maxY: cy + bh / 2, bw, bh };
}

/** Shrink (keeping proportions) then slide the box so it sits inside the area. */
export function constrainBox(box: Box, area: Area): Box {
  let { w, h } = box;
  const first = rotatedBounds(box);
  const scale = Math.min(1, area.w / first.bw, area.h / first.bh);
  const cx0 = box.x + box.w / 2, cy0 = box.y + box.h / 2;
  if (scale < 1) { w *= scale; h *= scale; }

  const b = rotatedBounds({ x: cx0 - w / 2, y: cy0 - h / 2, w, h, rotation: box.rotation });
  let dx = 0, dy = 0;
  if (b.minX < area.x) dx = area.x - b.minX; else if (b.maxX > area.x + area.w) dx = area.x + area.w - b.maxX;
  if (b.minY < area.y) dy = area.y - b.minY; else if (b.maxY > area.y + area.h) dy = area.y + area.h - b.maxY;
  return { x: cx0 - w / 2 + dx, y: cy0 - h / 2 + dy, w, h, rotation: box.rotation };
}

/** True when the (rotated) box lies inside the area, within a 0.05 mm tolerance. */
export function isInside(box: Box, area: Area): boolean {
  const b = rotatedBounds(box);
  const t = 0.05;
  return b.minX >= area.x - t && b.minY >= area.y - t && b.maxX <= area.x + area.w + t && b.maxY <= area.y + area.h + t;
}
