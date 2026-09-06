import { describe, it, expect } from "vitest";
import { classifyThreadsError } from "../shared/accountRestriction";
describe("Threadsエラーの分類", () => {
  it("制限・停止", () => {
    expect(classifyThreadsError('{"message":"(#10) Application does not have permission for this action","type":"OAuthException","code":10}')).toBe("restricted");
    expect(classifyThreadsError("Your account has been suspended")).toBe("restricted");
  });
  it("トークン失効", () => {
    expect(classifyThreadsError('{"message":"Invalid OAuth access token - Cannot parse access token","code":190}')).toBe("token");
  });
  it("レート制限", () => {
    expect(classifyThreadsError('{"message":"(#4) Application request limit reached","code":4}')).toBe("rate");
  });
  it("その他", () => { expect(classifyThreadsError("Media ID is not available")).toBe("none"); });
});
