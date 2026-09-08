import { describe, it, expect, beforeAll } from "vitest";
import { createInterestToken, verifyInterestToken } from "./interestToken";
describe("詳細希望トークン", () => {
  beforeAll(() => { process.env.JWT_SECRET = "test-secret"; });
  it("作って検証できる", () => {
    const t = createInterestToken(42, "keiro");
    expect(verifyInterestToken(t)).toEqual({ userId: 42, slug: "keiro" });
  });
  it("改ざんは弾く", () => {
    const t = createInterestToken(42, "keiro");
    expect(verifyInterestToken(t.slice(0, -2) + "zz")).toBeNull();
  });
});
