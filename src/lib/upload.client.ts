"use client";
/**
 * Direct browser -> Supabase Storage uploads. Large artwork never passes
 * through our server: the browser sends it straight into the customer's own
 * folder (storage policy: first path segment must equal auth.uid()), then a
 * server action checks the file and links it to the design.
 */
import { browserClient } from "@/lib/supabase/browser";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // matches the bucket limit

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", pdf: "application/pdf", ai: "application/postscript", csv: "text/csv" };

export function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Uploads a file and returns its "uploads/<uid>/<design>/<name>" path. */
export async function uploadToDesign(file: File, uid: string, designId: string, prefix: string): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files can be up to 15 MB.");
  const ext = extOf(file.name);
  const key = `${uid}/${designId}/${prefix}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await browserClient().storage.from("uploads").upload(key, file, { contentType: MIME[ext] ?? "application/octet-stream", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return `uploads/${key}`;
}

/** Natural size of an image file (0 × 0 for SVGs without a set size). */
export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}
