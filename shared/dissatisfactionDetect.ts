/**
 * お客様のメッセージが「ご不満・使うのをやめそうな声」かを見分ける。
 *
 * ★自動応答がそれらしく答えられても（aiConfident=1）、ご不満は担当者が受けるべきもの。
 *   2026-10-01 香取様 #52「提案される投稿案は文章としては不自然なことがほとんど…
 *   自分でAIを使って投稿する方が労力がありません」に、自動応答が「✕を押すと学習します」と
 *   返しただけで、担当者には届かず needsHuman=0 のまま残っていた（2週間公開ゼロ・見送り34本）。
 *   答えは返してよいが、担当者にも必ず知らせる。
 *
 * 操作のお尋ね（「解約の方法を教えて」）は自動応答で足りるので、ここでは拾わない。
 * 判定を変えるときは server/dissatisfactionDetect.test.ts の実例も合わせて直すこと。
 */
import { isPastedContent } from "./requestKind";

const DISSATISFACTION_RE =
  /(不自然|使い物にならな|使えな(い|かった)|意味がな|意味ない|役に立たな|期待外れ|期待はずれ|がっかり|残念です|不満|満足できな|そのまま(投稿|使)(しよう|おう)?とは思|自分で(AI|ＡＩ)?(を使って)?(作|書|投稿)(っ|成し|い)?た(方|ほう)が|労力が|手間が(かか|増え)|やめようと|やめたい|辞めたい|退会したい|解約しようと|解約を考え|続けるか迷|お金の無駄|お金を払う価値)/;

export function isDissatisfaction(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  // 投稿文の貼り付け（「〜は意味がない」と書いた投稿など）はご不満ではない
  if (isPastedContent(t)) return false;
  return DISSATISFACTION_RE.test(t);
}
