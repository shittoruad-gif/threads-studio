/**
 * 起動時マイグレーションの「もう在る」判定の番人。
 *
 * ここが効かなくなると、同じファイルの2文目以降が実行されないまま
 * 「失敗」扱いで記録されず、再起動のたびに同じ失敗をくり返す
 * （2026-09-23 に 0092_pending_plan_change.sql で実際に起きていた）。
 */
import { describe, it, expect } from "vitest";
import { isAlreadyExistsError, mysqlErrno } from "./migrationErrors";

/** drizzle が投げる形（元のエラーを cause に入れて包み直す） */
function drizzleWrapped(errno: number, message: string) {
  const original: any = new Error(message);
  original.errno = errno;
  original.sqlState = "42S21";
  const wrapped: any = new Error(`Failed query: ALTER TABLE ...\nparams: `);
  wrapped.cause = original;
  return wrapped;
}

describe("isAlreadyExistsError", () => {
  it("drizzle に包まれた 1060（列がもう在る）を飛ばしてよいと判定する", () => {
    // ★これが本体。e.errno だけを見ていた頃は undefined で、ここが false になっていた
    const err = drizzleWrapped(1060, "Duplicate column name 'pendingPlanId'");
    expect(mysqlErrno(err)).toBe(1060);
    expect(isAlreadyExistsError(err)).toBe(true);
  });

  it("drizzle に包まれた 1050（表がもう在る）・1061（索引がもう在る）も飛ばす", () => {
    expect(isAlreadyExistsError(drizzleWrapped(1050, "Table 'x' already exists"))).toBe(true);
    expect(isAlreadyExistsError(drizzleWrapped(1061, "Duplicate key name 'idx_x'"))).toBe(true);
  });

  it("包まれていない素の mysql2 エラーもこれまでどおり飛ばす", () => {
    const raw: any = new Error("Duplicate column name 'zeroPostDays'");
    raw.errno = 1060;
    expect(isAlreadyExistsError(raw)).toBe(true);
  });

  it("本物の失敗（文法エラー 1064・表が無い 1146）は飛ばさない", () => {
    expect(isAlreadyExistsError(drizzleWrapped(1064, "You have an error in your SQL syntax"))).toBe(false);
    expect(isAlreadyExistsError(drizzleWrapped(1146, "Table 'threads_studio.nope' doesn't exist"))).toBe(false);
  });

  it("errno がどこにも無いエラーは、文面に手がかりが無ければ失敗として扱う", () => {
    expect(isAlreadyExistsError(new Error("connection lost"))).toBe(false);
    expect(isAlreadyExistsError(undefined)).toBe(false);
  });

  it("cause が何重でも errno を見つける（将来ラッパーが増えても落ちない）", () => {
    const inner = drizzleWrapped(1060, "Duplicate column name 'x'");
    const outer: any = new Error("wrapped again");
    outer.cause = inner;
    expect(isAlreadyExistsError(outer)).toBe(true);
  });

  it("cause が自分を指していても無限に辿らない", () => {
    const loop: any = new Error("loop");
    loop.cause = loop;
    expect(() => isAlreadyExistsError(loop)).not.toThrow();
    expect(isAlreadyExistsError(loop)).toBe(false);
  });
});
