/**
 * 自動の答え（server/supportBot.ts）に、実際にはだれも行わない約束が入っていないかを見る。
 *
 * ★2026-10-12 ご質問 #56：自動の答えが「担当者が責任をもって登録させていただきます」と約束したが、
 *   confident=true の答えは担当者に届かない（needsHuman=0・通知なし）ため、だれも登録しなかった。
 *   プロンプトで禁じていても（SYSTEM_PROMPT の 8.）出ることがあるので、出力も機械で調べる。
 *   当たったら「答えられた」と扱わず（confident=false）、担当者へ回して通知する。
 *
 * 当てないもの
 *  - お客様ご自身の操作のご案内（「設定メニューからご登録いただけます」）
 *  - 条件つきの説明（「『Zoom希望』とお送りいただければ、担当者より日程のご連絡をいたします」）
 *    ＝お客様が送った時点で別の受け口が担当者へ届けるため
 */

/** 作業をする人（こちら側） */
const ACTOR_RE = /(担当者|担当の者|担当スタッフ|スタッフ|運営|サポート担当|サポートチーム|私ども|わたくしども|弊社|当方|当社|こちらで|こちら側|こちらの方で|こちらから)/;

/** こちらがする作業 */
const ACTION_RE = /(登録|設定|反映|修正|変更|追加|入力|対応|手配|調整|確認|連絡|返事|返信|おつなぎ|お繋ぎ|つなぎ|お伝え|伝え|共有|作成|お作り|直し|削除|停止|再開)/;

/** 約束の言い切り（〜いたします／〜させていただきます／〜しておきます／〜します） */
const PROMISE_RE = /(いたします|致します|させていただきます|させて頂きます|しておきます|しておく|いたしますので|します(ね|ので)?$|します(ね)?、|ますので|まいります|参ります|お約束)/;

/** お客様の操作を条件にした説明（「〜すると」「〜いただければ」） */
const CONDITIONAL_RE = /(ば、|ば|と、|たら|押すと|送ると|選ぶと|お送りいただくと|押していただくと|お選びいただくと|場合は|際は|ときは|時は)/;

/** 1文が、守る人のいない約束か */
export function isUnkeptPromiseSentence(sentence: string): boolean {
  const s = String(sentence ?? "").trim().replace(/[。．！!]+$/, "");
  if (!s) return false;
  if (/責任を(もって|持って)/.test(s)) return true;
  if (!ACTOR_RE.test(s) || !ACTION_RE.test(s) || !PROMISE_RE.test(s)) return false;
  // 「担当者に聞く」を押してください／担当者にお問い合わせください＝お客様への操作のお願い
  if (/(ください|下さい|いただけます|頂けます|いただけません|できます)$/.test(s)) return false;
  // 「担当者の前に作業があるか」で条件つきかを見る（「〜いただければ、担当者より…」）
  const i = s.search(ACTOR_RE);
  if (i > 0 && CONDITIONAL_RE.test(s.slice(0, i))) return false;
  return true;
}

/** 答えの中に、守る人のいない約束があるか */
export function hasUnkeptPromise(answer: string | null | undefined): boolean {
  return String(answer ?? "")
    .split(/[。．！!\n]/)
    .some((s) => isUnkeptPromiseSentence(s));
}
