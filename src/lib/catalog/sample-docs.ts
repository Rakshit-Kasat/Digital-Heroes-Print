/** Builds concrete DesignDocs for gallery samples and storefront art. */
import "server-only";
import { instantiateTemplate } from "@/lib/design/template";
import type { DesignDoc } from "@/lib/design/types";
import type { Product, Template } from "./types";
import { SAMPLES, type Sample } from "./samples";

export function sampleDoc(sample: Sample, product: Product, template: Template): DesignDoc {
  const doc = instantiateTemplate(template.design, { widthMm: sample.widthMm, heightMm: sample.heightMm }, product);
  return {
    ...doc,
    background: sample.background ?? doc.background,
    elements: doc.elements.map((el) => {
      const text = sample.text?.[el.id];
      const color = sample.colors?.[el.id];
      if (el.type === "text") return { ...el, ...(text !== undefined ? { text } : {}), ...(color ? { color } : {}) };
      if ((el.type === "rect" || el.type === "ellipse") && color) return { ...el, fill: color };
      return el;
    }),
  };
}

/** Every sample that can be rendered with the current catalogue. */
export function resolvedSamples(products: Product[], templates: Template[]) {
  return SAMPLES.flatMap((s) => {
    const product = products.find((p) => p.slug === s.product);
    const template = templates.find((t) => t.product_id === product?.id);
    return product && template ? [{ sample: s, product, doc: sampleDoc(s, product, template) }] : [];
  });
}
