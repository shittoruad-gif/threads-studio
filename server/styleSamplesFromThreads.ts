/**
 * 本人がもともとThreadsに投稿していた文章を「文体のお手本」に自動で取り込む（2026-09-07 三上様指示）。
 *
 * これまで projects.styleSamples はアプリの入力欄に手で貼る前提で、19店舗中2店舗（Moveact）しか入っていなかった。
 * 本人の投稿がある場合はそれを見本にする方が確実なので、連携時に自動で拾う。
 *  - 対象：連携日より前の本人の投稿（返信を除く・40字以上）。表示数の多い順に最大6件、合計2000字まで
 *  - 手で入れた見本がある場合は上書きしない（空のときだけ入れる）
 *  - 話題ではなく文体（口調・絵文字・改行・1文の長さ）を真似る用途。プロンプト側でその旨を指示済み
 */
import * as db from "./db";

const THREADS = "https://graph.threads.net/v1.0";
const MAX_SAMPLES = 6;
const MAX_CHARS = 2000;
const MIN_LEN = 40;

export async function collectOwnPostSamples(account: { threadsUserId: string; accessToken: string; createdAt?: Date | string | null }): Promise<{ samples: string[]; considered: number }> {
  const connect = account.createdAt ? new Date(account.createdAt).getTime() : Date.now();
  const get = async (u: string) => (await fetch(u)).json() as any;
  let url = `${THREADS}/${account.threadsUserId}/threads?fields=id,text,timestamp,is_reply&limit=100&access_token=${account.accessToken}`;
  const posts: any[] = [];
  for (let i = 0; i < 2 && url; i++) { const r = await get(url); if (r?.error) break; posts.push(...(r.data ?? [])); url = r.paging?.next || ""; }
  const own = posts.filter((p) => !p.is_reply && new Date(p.timestamp).getTime() < connect && Array.from(String(p.text || "")).length >= MIN_LEN);
  const scored: Array<{ text: string; views: number }> = [];
  for (const p of own.slice(0, 40)) {
    let views = 0;
    try { const r = await get(`${THREADS}/${p.id}/insights?metric=views&access_token=${account.accessToken}`); views = Number(r?.data?.[0]?.values?.[0]?.value ?? r?.data?.[0]?.total_value?.value ?? 0); } catch { views = 0; }
    scored.push({ text: String(p.text).trim(), views });
  }
  scored.sort((a, b) => b.views - a.views);
  const out: string[] = []; let total = 0;
  for (const s of scored) {
    const len = Array.from(s.text).length;
    if (out.length >= MAX_SAMPLES || total + len > MAX_CHARS) break;
    out.push(s.text); total += len;
  }
  return { samples: out, considered: own.length };
}

/** 連携時：そのアカウントの担当店舗（無ければ先頭の店舗）の styleSamples が空なら入れる */
export async function fillStyleSamplesForAccount(accountId: number, opts: { force?: boolean } = {}): Promise<{ filled: boolean; count: number; projectId?: string; reason?: string }> {
  const acct: any = await db.getThreadsAccountById(accountId);
  if (!acct?.accessToken) return { filled: false, count: 0, reason: "no token" };
  const projects: any[] = ((await db.getProjectsByUserId(Number(acct.userId))) || []).filter((p) => !String(p.id).startsWith("demo_"));
  const project: any = (acct.defaultProjectId && projects.find((p) => p.id === acct.defaultProjectId)) || projects[0];
  if (!project) return { filled: false, count: 0, reason: "no project" };
  if (String(project.styleSamples || "").trim() && !opts.force) return { filled: false, count: 0, projectId: project.id, reason: "already set (manual)" };
  const { samples, considered } = await collectOwnPostSamples(acct);
  if (samples.length < 3) return { filled: false, count: samples.length, projectId: project.id, reason: `own posts too few (${considered})` };
  await db.updateProject(project.id, { styleSamples: samples.join("\n---\n") } as any);
  return { filled: true, count: samples.length, projectId: project.id };
}
