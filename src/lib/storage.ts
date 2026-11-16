/**
 * Storage helpers. Paths are written "bucket/key" everywhere in the app
 * (e.g. "uploads/<uid>/logo.png", "print-files/orders/DH-001001/…"), so a
 * single string says where a file lives. All buckets are private: browsers
 * only ever get short-lived signed URLs, issued after a permission check.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/server";
import type { DesignDoc } from "@/lib/design/types";
import type { ImageMap } from "@/lib/print/render";
import { isSafePath } from "@/lib/storage-path";

export function splitPath(path: string): { bucket: string; key: string } {
  // Every storage call goes through here, so an unsafe path never reaches the API.
  if (!isSafePath(path)) throw new Error("Invalid file path.");
  const i = path.indexOf("/");
  return { bucket: path.slice(0, i), key: path.slice(i + 1) };
}

export function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", pdf: "application/pdf", zip: "application/zip", csv: "text/csv", ai: "application/postscript" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

export async function uploadFile(path: string, body: Uint8Array | Buffer | string, contentType = mimeFor(path)) {
  const { bucket, key } = splitPath(path);
  const { error } = await adminClient().storage.from(bucket).upload(key, body, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
  return path;
}

export async function downloadFile(path: string): Promise<Uint8Array> {
  const { bucket, key } = splitPath(path);
  const { data, error } = await adminClient().storage.from(bucket).download(key);
  if (error || !data) throw new Error(`Download failed for ${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Signed URL valid for `seconds` (default 10 min). Optional download filename. */
export async function signedUrl(path: string, seconds = 600, download?: string): Promise<string | null> {
  const { bucket, key } = splitPath(path);
  const { data } = await adminClient().storage.from(bucket).createSignedUrl(key, seconds, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

export async function signedUrls(paths: string[], seconds = 600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all([...new Set(paths)].map(async (p) => { const u = await signedUrl(p, seconds); if (u) out[p] = u; }));
  return out;
}

/** Fetches every image a design references, for server-side rendering. */
export async function loadImages(doc: DesignDoc): Promise<ImageMap> {
  const map: ImageMap = new Map();
  const srcs = [...new Set(doc.elements.flatMap((e) => (e.type === "image" ? [e.src] : [])))];
  await Promise.all(srcs.map(async (src) => {
    if (src.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(src);
      if (m) map.set(src, { mime: m[1], bytes: Buffer.from(m[2], "base64") });
    } else {
      map.set(src, { mime: mimeFor(src), bytes: await downloadFile(src) });
    }
  }));
  return map;
}

/** Image paths referenced by a design (to sign for the browser editor). */
export function imagePaths(doc: DesignDoc | null): string[] {
  return doc ? doc.elements.flatMap((e) => (e.type === "image" && !e.src.startsWith("data:") ? [e.src] : [])) : [];
}
