"use client";
/**
 * The design surface. The artwork itself is drawn by the SAME svgNodes()
 * the server uses for proofs; on top sits a thin interaction layer (hit
 * areas, selection frame, resize and rotate handles) in the same mm
 * coordinate system, so a pointer position converts straight to millimetres.
 *
 * Print-area lock (PRD §06): every move, resize and rotation is passed
 * through constrainBox(), so a customer element cannot leave the safe area.
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { constrainBox, printArea, type Box } from "@/lib/layout/constrain";
import { svgNodes, svgRoot } from "@/lib/design/svg";
import { renderSvgNodes } from "@/components/svg-tree";
import type { Layout } from "@/lib/design/layout";
import type { DesignDoc, DesignElement } from "@/lib/design/types";

type Mode = "move" | "resize" | "rotate";
interface Drag { mode: Mode; id: string; start: Box; p0: { x: number; y: number }; origin: DesignDoc; corner: [number, number]; ratio: boolean }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function patchElement(doc: DesignDoc, id: string, patch: Partial<DesignElement>): DesignDoc {
  return { ...doc, elements: doc.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as DesignElement) : e)) };
}

/** Constrain a box to the safe area and round to 0.01 mm. */
export function placeBox(doc: DesignDoc, box: Box): Box {
  const c = constrainBox(box, printArea(doc));
  return { x: r2(c.x), y: r2(c.y), w: r2(c.w), h: r2(c.h), rotation: r2(c.rotation) };
}

const CORNERS: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

export function DesignCanvas({ layout, imageUrls, selectedId, onSelect, onLive, onCommit, onEditText, label }: {
  layout: Layout;
  imageUrls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLive: (doc: DesignDoc) => void;
  onCommit: (origin: DesignDoc) => void;
  onEditText: (id: string) => void;
  label: string;
}) {
  const doc = layout.doc;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [mmPerPx, setMmPerPx] = useState(0.3);
  const [snap, setSnap] = useState({ v: false, h: false });
  const b = doc.bleedMm, W = doc.widthMm, H = doc.heightMm;

  // Handles are a fixed number of screen pixels, whatever the zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => { if (svg.clientWidth) setMmPerPx((W + 2 * b) / svg.clientWidth); });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [W, b]);

  const toMm = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  function begin(e: RPointerEvent, el: DesignElement, mode: Mode, corner: [number, number] = [1, 1]) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    if (el.locked) return; // template furniture: selectable for colour, never movable
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, id: el.id, start: { x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation }, p0: toMm(e), origin: doc, corner, ratio: el.type === "image" || e.shiftKey };
  }

  function move(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toMm(e), s = d.start;
    let box: Box;
    if (d.mode === "move") {
      box = { ...s, x: s.x + p.x - d.p0.x, y: s.y + p.y - d.p0.y };
      // Magnetic centre lines: snap when the element's centre is within 6 px.
      const tol = 6 * mmPerPx;
      const v = Math.abs(box.x + box.w / 2 - W / 2) < tol, h = Math.abs(box.y + box.h / 2 - H / 2) < tol;
      if (v) box.x = W / 2 - box.w / 2;
      if (h) box.y = H / 2 - box.h / 2;
      if (v !== snap.v || h !== snap.h) setSnap({ v, h });
    } else if (d.mode === "resize") {
      // Keep the OPPOSITE corner fixed, working in the element's own rotated frame.
      const rad = (s.rotation * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      const [sx, sy] = d.corner;
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const ax = cx - (sx * s.w / 2) * cos + (sy * s.h / 2) * sin;
      const ay = cy - (sx * s.w / 2) * sin - (sy * s.h / 2) * cos;
      const dx = p.x - ax, dy = p.y - ay;
      const lx = cos * dx + sin * dy, ly = -sin * dx + cos * dy; // pointer in local axes
      let w = Math.max(2, sx * lx), h = Math.max(2, sy * ly);
      if (d.ratio || e.shiftKey) { const k = Math.max(w / s.w, h / s.h); w = s.w * k; h = s.h * k; }
      const ncx = ax + (sx * w / 2) * cos - (sy * h / 2) * sin;
      const ncy = ay + (sx * w / 2) * sin + (sy * h / 2) * cos;
      box = { x: ncx - w / 2, y: ncy - h / 2, w, h, rotation: s.rotation };
    } else {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      else if (Math.abs(a - Math.round(a / 90) * 90) < 4) a = Math.round(a / 90) * 90; // gentle snap to square
      a = ((a + 540) % 360) - 180;
      box = { ...s, rotation: a };
    }
    onLive(patchElement(d.origin, d.id, placeBox(doc, box)));
  }

  function end() {
    if (!drag.current) return;
    onCommit(drag.current.origin);
    drag.current = null;
    setSnap({ v: false, h: false });
  }

  const sel = doc.elements.find((e) => e.id === selectedId) ?? null;
  const px = mmPerPx;
  const root = svgRoot(layout);

  return (
    <svg
      ref={svgRef}
      viewBox={root.viewBox}
      role="img"
      aria-label={label}
      className="block h-auto max-h-[70vh] w-full touch-none select-none"
      onPointerDown={() => onSelect(null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {renderSvgNodes(svgNodes(layout, { guides: true, resolveImage: (src) => imageUrls[src] ?? "" }))}

      {/* The bleed strip is cut off: wash it out so customers see what is lost. */}
      <path d={`M${-b} ${-b}h${W + 2 * b}v${H + 2 * b}h${-(W + 2 * b)}z M0 0v${H}h${W}v${-H}z`} fill="#ffffff" fillOpacity={0.55} fillRule="evenodd" pointerEvents="none" />

      {snap.v && <line x1={W / 2} x2={W / 2} y1={-b} y2={H + b} stroke="#C4105F" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {snap.h && <line y1={H / 2} y2={H / 2} x1={-b} x2={W + b} stroke="#C4105F" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}

      {/* Hit areas, in paint order so the top-most element wins. */}
      {doc.elements.map((el) => {
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
        return (
          <rect
            key={el.id}
            x={el.x} y={el.y} width={el.w} height={el.h}
            transform={el.rotation ? `rotate(${el.rotation} ${cx} ${cy})` : undefined}
            fill="transparent"
            className={el.locked ? "cursor-pointer" : "cursor-move"}
            onPointerDown={(e) => begin(e, el, "move")}
            onDoubleClick={() => el.type === "text" && onEditText(el.id)}
          />
        );
      })}

      {sel && (
        <g transform={sel.rotation ? `rotate(${sel.rotation} ${sel.x + sel.w / 2} ${sel.y + sel.h / 2})` : undefined}>
          <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="none" stroke="#C4105F" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray={sel.locked ? "4 3" : undefined} pointerEvents="none" />
          {!sel.locked && (
            <>
              {CORNERS.map(([sx, sy]) => (
                <rect
                  key={`${sx}${sy}`}
                  x={sel.x + (sx > 0 ? sel.w : 0) - 5 * px} y={sel.y + (sy > 0 ? sel.h : 0) - 5 * px}
                  width={10 * px} height={10 * px}
                  fill="#fff" stroke="#C4105F" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  className={sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize"}
                  onPointerDown={(e) => begin(e, sel, "resize", [sx, sy])}
                />
              ))}
              {(() => {
                // Rotation handle above the box, or below it when the box touches the top edge.
                const below = sel.y - 30 * px < -b;
                const y0 = below ? sel.y + sel.h : sel.y, dir = below ? 1 : -1;
                return (
                  <>
                    <line x1={sel.x + sel.w / 2} x2={sel.x + sel.w / 2} y1={y0} y2={y0 + dir * 18 * px} stroke="#C4105F" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    <circle cx={sel.x + sel.w / 2} cy={y0 + dir * 22 * px} r={6 * px} fill="#C4105F" className="cursor-grab" onPointerDown={(e) => begin(e, sel, "rotate")}>
                      <title>Drag to rotate</title>
                    </circle>
                  </>
                );
              })()}
            </>
          )}
        </g>
      )}
    </svg>
  );
}
