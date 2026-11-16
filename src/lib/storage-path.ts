/**
 * One rule for every storage path the app reads, writes or signs.
 *
 * Why: paths look like "bucket/folder/file". If a customer could slip in
 * "..", "%2e%2e" or a backslash, a path that starts with their own folder
 * could still point at another bucket once the storage API normalises it.
 * So every segment must be a plain name: letters, digits, "_", "-", ".",
 * not starting with "." (which rules out "." and ".."), and no "%" or "\".
 * The same rule is enforced again in the database (migration 0005).
 */
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** True when `path` is "bucket/key" made only of plain segments. */
export function isSafePath(path: string): boolean {
  if (typeof path !== "string" || path.length > 512) return false;
  const parts = path.split("/");
  return parts.length >= 2 && parts.every((p) => SEGMENT.test(p));
}

/** True when `path` is a safe path inside this user's upload folder (optionally one design's subfolder). */
export function isOwnedUpload(path: string, uid: string, folder?: string): boolean {
  const prefix = folder ? `uploads/${uid}/${folder}/` : `uploads/${uid}/`;
  return isSafePath(path) && path.startsWith(prefix) && path.length > prefix.length;
}
