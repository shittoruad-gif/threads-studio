import { describe, it, expect, beforeAll } from "vitest";
import { createApprovalToken, verifyApprovalToken } from "./approvalToken";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-approval-token";
});

describe("承認トークン", () => {
  it("発行したトークンを検証できる", () => {
    const token = createApprovalToken(123, 45, "approve");
    expect(verifyApprovalToken(token)).toEqual({ postId: 123, userId: 45, action: "approve" });
  });

  it("見送り(skip)も往復できる", () => {
    const token = createApprovalToken(7, 8, "skip");
    expect(verifyApprovalToken(token)?.action).toBe("skip");
  });

  it("署名を書き換えたトークンは無効", () => {
    const token = createApprovalToken(123, 45, "approve");
    const [body] = token.split(".");
    expect(verifyApprovalToken(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
  });

  it("中身(投稿ID)を差し替えると署名が合わず無効", () => {
    const token = createApprovalToken(123, 45, "approve");
    const sig = token.split(".")[1];
    const forged = Buffer.from(JSON.stringify({ p: 999, u: 45, a: "approve", e: 9999999999 }), "utf8")
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyApprovalToken(`${forged}.${sig}`)).toBeNull();
  });

  it("別の秘密鍵で作られたトークンは無効", () => {
    const token = createApprovalToken(1, 2, "approve");
    process.env.JWT_SECRET = "another-secret";
    expect(verifyApprovalToken(token)).toBeNull();
    process.env.JWT_SECRET = "test-secret-for-approval-token";
  });

  it("期限切れは無効", () => {
    const token = createApprovalToken(1, 2, "approve", -10);
    expect(verifyApprovalToken(token)).toBeNull();
  });

  it("形式が違う入力でも例外を投げずnullを返す", () => {
    for (const bad of ["", "abc", "a.b.c", null, undefined, 123, {}]) {
      expect(verifyApprovalToken(bad as any)).toBeNull();
    }
  });
});
