/**
 * The design document: ONE format shared by the browser designer, the live
 * proof preview and the server print engine. Because every renderer reads the
 * same JSON, "what is approved is what is printed" (PRD §06).
 *
 * Units: positions and sizes in millimetres, measured from the TRIM box's
 * top-left corner. Font sizes in points (1 pt = 0.3528 mm).
 */

export type FontId = "lato" | "anton" | "archivo" | "alfa" | "vibes" | "courier";

/** Per-placeholder fitting rules (PRD §04 / §07). */
export interface FitRule {
  shrinkToFit: boolean; // reduce size until the text fits its box
  minPt: number;        // never smaller than this (legibility floor)
  maxPt: number;        // never larger than this
  tracking?: number;    // letter spacing in 1/1000 em (can be negative)
}

interface Base {
  id: string;
  x: number;        // mm
  y: number;        // mm
  w: number;        // mm
  h: number;        // mm
  rotation: number; // degrees, around the element centre
  locked?: boolean; // template furniture the customer cannot move
}

export interface TextElement extends Base {
  type: "text";
  text: string;
  font: FontId;
  bold?: boolean;
  size: number;   // pt (the requested size; fitting may reduce it)
  color: string;  // #rrggbb
  align: "left" | "center" | "right";
  fit?: FitRule;
  field?: string; // CSV column that replaces `text` in variable-data merges
}

export interface ImageElement extends Base {
  type: "image";
  src: string;    // storage path ("uploads/…") or data: URL
}

export interface ShapeElement extends Base {
  type: "rect" | "ellipse";
  fill: string;   // #rrggbb or "none"
  stroke?: string;
  strokeWidth?: number; // mm
  radius?: number;      // mm (rect corners)
}

export type DesignElement = TextElement | ImageElement | ShapeElement;

export interface DesignDoc {
  version: 1;
  widthMm: number;
  heightMm: number;
  bleedMm: number;   // artwork extends this far past the trim edge
  safeMm: number;    // elements must stay this far inside the trim edge
  background: string;
  elements: DesignElement[];
}

/**
 * Templates are size-independent: x/y/w/h are fractions (0..1) of the trim
 * size and text `size` is a fraction of the trim HEIGHT. instantiateTemplate()
 * turns one into a DesignDoc for any configured size.
 */
export interface TemplateDoc {
  background: string;
  elements: Array<
    | (Omit<TextElement, "size"> & { size: number })
    | ImageElement
    | ShapeElement
  >;
}

/** The customer's product configuration (PRD §04: configured, not pre-listed). */
export interface ProductConfig {
  widthMm: number;
  heightMm: number;
  materialId: string;
  quantity: number;
}
