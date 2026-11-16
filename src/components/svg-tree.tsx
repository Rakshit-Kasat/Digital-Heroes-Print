/**
 * Turns the renderer's SvgNode tree into React elements. Keys come from the
 * element ids, so while dragging React only patches attributes: images are
 * not re-created and do not flicker.
 */
import { createElement, type ReactNode } from "react";
import type { SvgNode } from "@/lib/design/svg";

// SVG attribute names -> React prop names ("font-family" -> "fontFamily").
const prop = (k: string) => (k === "xml:space" ? "xmlSpace" : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

export function renderSvgNodes(nodes: Array<SvgNode | string>): ReactNode[] {
  return nodes.map((node) => {
    if (typeof node === "string") return node;
    const props: Record<string, string> = { key: node.key };
    for (const [k, v] of Object.entries(node.attrs)) props[prop(k)] = v;
    return createElement(node.tag, props, node.children ? renderSvgNodes(node.children) : undefined);
  });
}
