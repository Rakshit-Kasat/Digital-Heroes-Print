/**
 * Server-side validation of a design document sent from the browser.
 * The browser is untrusted: sizes and bleed are overwritten from the
 * product, images must live in the user's own upload folder, and every
 * string and number is bounded.
 */
import { z } from "zod";
import { FONT_IDS } from "./fonts";
import type { DesignDoc } from "./types";
import { isOwnedUpload } from "@/lib/storage-path";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const mm = z.number().finite().min(-1000).max(2000);
const base = { id: z.string().min(1).max(40), x: mm, y: mm, w: z.number().finite().positive().max(2000), h: z.number().finite().positive().max(2000), rotation: z.number().finite().min(-360).max(360), locked: z.boolean().optional() };

const Text = z.object({
  ...base, type: z.literal("text"), text: z.string().max(2000), font: z.enum(FONT_IDS as [string, ...string[]]), bold: z.boolean().optional(),
  size: z.number().finite().min(2).max(1000), color, align: z.enum(["left", "center", "right"]),
  fit: z.object({ shrinkToFit: z.boolean(), minPt: z.number().min(2).max(1000), maxPt: z.number().min(2).max(1000), tracking: z.number().min(-200).max(1000).optional() }).optional(),
  field: z.string().regex(/^[A-Za-z0-9 _-]{1,40}$/).optional(),
});
const Image = z.object({ ...base, type: z.literal("image"), src: z.string().max(300), pxW: z.number().int().positive().optional(), pxH: z.number().int().positive().optional() });
const Shape = z.object({ ...base, type: z.enum(["rect", "ellipse"]), fill: z.union([color, z.literal("none")]), stroke: color.optional(), strokeWidth: z.number().min(0).max(50).optional(), radius: z.number().min(0).max(500).optional() });

export const DesignDocSchema = z.object({
  version: z.literal(1),
  background: color,
  elements: z.array(z.discriminatedUnion("type", [Text, Image, Shape])).max(200),
});

export function parseDoc(input: unknown, owner: string, size: { widthMm: number; heightMm: number; bleedMm: number; safeMm: number }): DesignDoc {
  const doc = DesignDocSchema.parse(input);
  for (const el of doc.elements) {
    if (el.type === "image" && !isOwnedUpload(el.src, owner)) throw new Error("Images must be uploaded through the designer.");
  }
  return { ...doc, ...size } as DesignDoc;
}
