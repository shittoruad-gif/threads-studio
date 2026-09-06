/**
 * Threadsプロフィールの点検と提案（LINE・アプリ共通）。shared/profileAdvice.ts の材料集め。
 * - 連携アカウントの「いまのプロフィール」はThreads APIから取り直す（連携時の古い値で判定しない）
 * - お店の情報は、そのアカウントの担当プロジェクト（無ければ登録済みの先頭）
 * - ご案内先は登録済みリンク（お客様が選んだ優先先）
 */
import * as db from "./db";
import { buildProfileAdvice, renderProfileAdviceText, type ProfileAdvice } from "../shared/profileAdvice";
import { parseProjectLinks, pickPinnedDestination, LINK_TYPES } from "../shared/projectLinks";

export interface ProfileAdviceResult {
  accountId: number;
  username: string;
  advice: ProfileAdvice;
  text: string;
  /** お店の情報が未登録で、提案文が作れなかった */
  needsSetup: boolean;
}

export async function buildProfileAdviceForAccount(userId: number, accountId: number): Promise<ProfileAdviceResult | null> {
  const account: any = await db.getThreadsAccountById(accountId);
  if (!account || account.userId !== userId) return null;
  let username = String(account.threadsUsername || "");
  let name: string | null = null;
  let biography: string | null = account.biography ?? null;
  let hasPicture = !!account.profilePictureUrl;
  try {
    const { getThreadsUserProfile } = await import("./threadsApi");
    const p: any = await getThreadsUserProfile(account.accessToken);
    if (p?.username) username = String(p.username);
    name = p?.name ? String(p.name) : null;
    biography = p?.threads_biography ?? "";
    hasPicture = !!p?.threads_profile_picture_url;
    // ついでに保存値も新しくしておく（連携時のまま古くなるため）
    await db.updateThreadsAccountProfile(accountId, {
      threadsUsername: username,
      profilePictureUrl: p?.threads_profile_picture_url || undefined,
      biography: p?.threads_biography || undefined,
    }).catch(() => undefined);
  } catch (e) {
    console.warn(`[ProfileAdvice] Threads APIから取れず、保存値で点検 account=${accountId}:`, (e as Error)?.message);
  }
  const projects: any[] = ((await db.getProjectsByUserId(userId)) || []).filter((pj: any) => !String(pj.id).startsWith("demo_") && pj.businessType && pj.area);
  const project: any = (account.defaultProjectId && projects.find((pj: any) => String(pj.id) === String(account.defaultProjectId))) || projects[0] || null;
  const needsSetup = !project;
  let linkUrl: string | null = null, linkName: string | null = null;
  if (project) {
    const dest = pickPinnedDestination(parseProjectLinks(project.links || null));
    if (dest?.link?.url) { linkUrl = String(dest.link.url); linkName = (LINK_TYPES as any)[dest.link.type]?.name ?? dest.link.label ?? null; }
  }
  const advice = buildProfileAdvice(
    { username, name, biography, hasPicture },
    project ? { storeName: project.storeName, businessType: project.businessType, area: project.area, localTerms: project.localTerms, target: project.target, mainProblem: project.mainProblem, strength: project.strength, linkUrl, linkName } : { linkUrl, linkName },
  );
  return { accountId, username, advice, text: renderProfileAdviceText(advice, username), needsSetup };
}

/** LINEに送る一式：点検結果 → 貼るだけの「名前」「自己紹介」→ 手順とアイコン・リンク・ユーザー名の助言 */
export function buildProfileAdviceMessages(r: ProfileAdviceResult): unknown[] {
  const out: unknown[] = [{ type: "text", text: r.text }];
  if (r.needsSetup) {
    out.push({ type: "text", text: "お店の情報が未登録のため、貼るだけの提案文が作れませんでした。先に「はじめの設定」を済ませると、名前と自己紹介の文章をお作りします。" });
    return out;
  }
  const a = r.advice;
  if (a.nameSuggestion) out.push({ type: "text", text: `■ 名前（表示名）に貼る文（長押しでコピー）\n${a.nameSuggestion}` });
  if (a.bioSuggestion) out.push({ type: "text", text: `■ 自己紹介に貼る文（150字以内・長押しでコピー）\n${a.bioSuggestion}` });
  const steps =
    "■ 入れ方\nThreadsアプリ → 右下の人型アイコン →「プロフィールを編集」→ 名前／自己紹介／リンクにそれぞれ貼って「完了」\n\n" +
    `■ アイコン\n${a.pictureAdvice}\n\n` +
    `■ リンク\n${a.linkAdvice}` +
    (a.usernameAdvice ? `\n\n■ ユーザー名\n${a.usernameAdvice}` : "") +
    "\n\n提案文はそのままでも、言い回しを変えても構いません。数字や実績は、はじめの設定で教えていただいた内容だけを使っています。";
  out.push({ type: "text", text: steps });
  return out;
}

/** 連携直後：自己紹介が空なら、公式LINEに提案を1回だけ送る（LINE未連携なら何もしない） */
export async function nudgeAfterConnect(userId: number, username: string): Promise<void> {
  try {
    const accounts: any[] = await db.getThreadsAccountsByUserId(userId);
    const acct = accounts.find((a: any) => a.isActive && String(a.threadsUsername) === String(username));
    if (!acct) return;
    if (String(acct.biography || "").trim().length >= 40) return; // 整っている方には送らない
    const targets = await db.getLineUserIdsForUser(userId);
    if (targets.length === 0) return;
    const r = await buildProfileAdviceForAccount(userId, Number(acct.id));
    if (!r) return;
    const { pushMessages } = await import("./lineNotify");
    const msgs = [{ type: "text", text: `Threads（@${r.username}）がつながりました。\nプロフィールを点検したところ、整えると見つけてもらいやすくなる点がありましたので、貼るだけの文章と一緒にお送りします。` }, ...buildProfileAdviceMessages(r)];
    for (const to of targets) await pushMessages(to, msgs.slice(0, 5));
    console.log(`[ProfileAdvice] 連携直後の提案を送信 user=${userId} @${r.username}`);
  } catch (e) {
    console.error(`[ProfileAdvice] 連携直後の提案に失敗 user=${userId}:`, e);
  }
}
