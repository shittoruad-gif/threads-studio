import { beforeEach, describe, expect, it } from "vitest";
import {
  LINK_CODE_MAX_FAILURES,
  LINK_CODE_WINDOW_MS,
  LINK_EMAIL_MAX_SENDS,
  LINK_EMAIL_WINDOW_MS,
  __resetLineLinkGuardForTest,
  canTryLinkCode,
  clearLinkCodeFailures,
  recordLinkCodeFailure,
  takeLinkEmailSend,
} from "./lineLinkGuard";

// DB・ネットワークを使わない（メモリの数え方だけを確かめる）
describe("lineLinkGuard: 6桁の連携番号の総当たり対策", () => {
  beforeEach(() => __resetLineLinkGuardForTest());

  it("打ち間違いが上限に達するまでは照合できる", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LINK_CODE_MAX_FAILURES - 1; i++) recordLinkCodeFailure("U1", t0 + i);
    expect(canTryLinkCode("U1", t0 + 10)).toBe(true);
  });

  it("上限に達したら止まり、時間がたてば戻る", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LINK_CODE_MAX_FAILURES; i++) recordLinkCodeFailure("U1", t0 + i);
    expect(canTryLinkCode("U1", t0 + 10)).toBe(false);
    expect(canTryLinkCode("U1", t0 + LINK_CODE_WINDOW_MS + 10)).toBe(true);
  });

  it("別のLINEには影響しない・連携できたら記録が消える", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LINK_CODE_MAX_FAILURES; i++) recordLinkCodeFailure("U1", t0 + i);
    expect(canTryLinkCode("U2", t0 + 10)).toBe(true);
    clearLinkCodeFailures("U1");
    expect(canTryLinkCode("U1", t0 + 10)).toBe(true);
  });
});

describe("lineLinkGuard: 連携メールの連打対策", () => {
  beforeEach(() => __resetLineLinkGuardForTest());

  it("同じLINEからは1時間に上限まで", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < LINK_EMAIL_MAX_SENDS; i++) {
      expect(takeLinkEmailSend("U1", `a${i}@example.com`, t0 + i)).toBe(true);
    }
    expect(takeLinkEmailSend("U1", "z@example.com", t0 + 100)).toBe(false);
    expect(takeLinkEmailSend("U1", "z@example.com", t0 + LINK_EMAIL_WINDOW_MS + 100)).toBe(true);
  });

  it("同じアドレスへは、LINEを変えても上限まで（大文字小文字は同じ扱い）", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < LINK_EMAIL_MAX_SENDS; i++) {
      expect(takeLinkEmailSend(`U${i}`, "Victim@Example.com", t0 + i)).toBe(true);
    }
    expect(takeLinkEmailSend("U9", "victim@example.com", t0 + 100)).toBe(false);
  });
});
