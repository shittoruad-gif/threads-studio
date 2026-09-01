import { describe, it, expect } from "vitest";
import { LEGAL_VERSION, LEGAL_DOCS } from "../shared/legalVersion";

describe("規約同意の記録", () => {
  it("規約バージョンが決まっている（同意記録に必ず残す値）", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("同意の対象は利用規約・プライバシー・特商法の3点", () => {
    expect(LEGAL_DOCS.map((d) => d.key).sort()).toEqual(["commercial", "privacy", "terms"]);
    for (const d of LEGAL_DOCS) expect(d.path.startsWith("/")).toBe(true);
  });
});
