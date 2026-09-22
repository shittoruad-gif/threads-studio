/**
 * マイグレーションの「もう在るので飛ばしてよい」判定。
 *
 * ★なぜ切り出したか（2026-09-23 夜間整備で見つけた不具合）
 *
 * 起動時のマイグレーションは、既にある table/column/index（MySQL の
 * errno 1050 / 1060 / 1061）を「適用済み」とみなして次の文へ進む作りだった。
 * ところが実際に投げられるのは drizzle が包んだ Error で、errno は
 * **e.errno ではなく e.cause.errno** に入っている。実測：
 *
 *     raw mysql2 → errno = 1060
 *     drizzle     → errno = undefined / cause.errno = 1060
 *
 * そのため判定が一度も成立せず、次のことが起きる。
 *
 *  1. 1文目が「もう在る」だけで **break** し、同じファイルの2文目以降が実行されない
 *     （＝新しい列が永久に追加されない）
 *  2. 適用済みとして記録されないので、**再起動のたびに同じ失敗をくり返す**
 *  3. そのたびに `notifyOwner` で「本番マイグレーション失敗」が飛ぶ
 *
 * 実際に `0092_pending_plan_change.sql` がこの状態になっていた（列は
 * 起動時のスキーマ補正が先に足していたため、1文目が 1060 で落ちていた）。
 * 本番でも、手作業で先に DDL を当てたファイルで同じことが起きる。
 */

/** 「もう在る」を表す MySQL の errno（1050=table / 1060=column / 1061=index） */
const ALREADY_EXISTS_ERRNO = new Set([1050, 1060, 1061]);

/** 同じ意味の SQLSTATE（ドライバが errno を載せない経路むけの保険） */
const ALREADY_EXISTS_SQLSTATE = new Set(["42S01", "42S21", "42000"]);

/**
 * 例外の cause を辿って MySQL の errno を取り出す。
 * drizzle は元のエラーを `cause` に入れて包み直すため、直下だけを見てはいけない。
 */
export function mysqlErrno(err: unknown): number | undefined {
  let cur: any = err;
  for (let depth = 0; cur && typeof cur === "object" && depth < 5; depth++) {
    if (typeof cur.errno === "number") return cur.errno;
    cur = cur.cause;
  }
  return undefined;
}

/** 例外の cause を辿って SQLSTATE を取り出す。 */
export function mysqlSqlState(err: unknown): string | undefined {
  let cur: any = err;
  for (let depth = 0; cur && typeof cur === "object" && depth < 5; depth++) {
    if (typeof cur.sqlState === "string") return cur.sqlState;
    cur = cur.cause;
  }
  return undefined;
}

/**
 * 「もう在るので飛ばしてよい」エラーか。
 * errno が取れないときだけ、SQLSTATE と文面で補う。
 */
export function isAlreadyExistsError(err: unknown): boolean {
  const errno = mysqlErrno(err);
  if (errno !== undefined) return ALREADY_EXISTS_ERRNO.has(errno);

  const state = mysqlSqlState(err);
  const message = String((err as any)?.message ?? "");
  if (state && ALREADY_EXISTS_SQLSTATE.has(state) && /exists|Duplicate/i.test(message)) return true;
  return /Duplicate column name|Duplicate key name|already exists/i.test(message);
}
