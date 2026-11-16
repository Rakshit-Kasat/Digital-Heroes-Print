/**
 * The storage path rule (src/lib/storage-path.ts). These are the exact
 * tricks from the security review: "..", URL-encoded dots, backslashes,
 * and another customer's folder.
 */
import { describe, expect, it } from "vitest";
import { isOwnedUpload, isSafePath } from "@/lib/storage-path";

const me = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const design = "33333333-3333-4333-8333-333333333333";

describe("storage paths", () => {
  it("accepts the paths the app makes", () => {
    expect(isSafePath(`uploads/${me}/${design}/logo-1a2b3c4d.png`)).toBe(true);
    expect(isSafePath("print-files/orders/DH-001005/DH-001005_product-labels_20261117_Print.pdf")).toBe(true);
    expect(isSafePath("proofs/DH-001005/v2.png")).toBe(true);
  });

  it("rejects traversal and encoded tricks", () => {
    for (const p of [
      `uploads/${me}/../print-files/x.pdf`,
      `uploads/${me}/./x.png`,
      `uploads/${me}/%2e%2e/x.png`,
      `uploads/${me}\\..\\x.png`,
      `uploads/${me}//x.png`,
      "uploads",
      "",
    ]) expect(isSafePath(p), p).toBe(false);
  });

  it("only allows the customer's own folder", () => {
    expect(isOwnedUpload(`uploads/${me}/${design}/a.png`, me, design)).toBe(true);
    expect(isOwnedUpload(`uploads/${me}/${design}/a.png`, me)).toBe(true);
    expect(isOwnedUpload(`uploads/${other}/${design}/a.png`, me)).toBe(false);
    expect(isOwnedUpload(`uploads/${me}/other-design/a.png`, me, design)).toBe(false);
    expect(isOwnedUpload(`uploads/${me}/`, me)).toBe(false);
    expect(isOwnedUpload(`print-files/${me}/a.pdf`, me)).toBe(false);
  });
});
