/**
 * 公式LINEに届いた自由文が「投稿の中身についてのご希望」かを見分け、書き方の決まり（shared/ownerRules.ts）の文に整える。
 *
 * ★2026-11-03 三上様「そのような問い合わせに対して、自動的にきちんと反映できるようなシステムを組み込んで」。
 *   10/12「〇〇をお勧めしたい」、10/14「〇〇の話題はいらない」がご質問として自動応答に回り、
 *   自動の返事は「担当者が責任をもって登録させていただきます」「NGワードをご自身で登録して」で終わった。
 *   needsHuman=0 のため誰も対応せず、設定には何も入らず、その後もいらないと言われた話題の投稿が公開された。
 *   ご希望はもう文に書いてくださっているので、決まりの文に整えて「登録する」ボタン1つで入るようにする。
 *
 * 決めごと
 *  - 取りこぼしより横取りの害が大きい。当たるのは「何を（〇〇）」と「どうしてほしい（いらない／勧めたい／減らして）」が
 *    両方そろった短い文だけ。ご質問（どこ・どう・？）、操作の相談、困りごとの言葉が入っていたら当てない。
 *  - 当たっても勝手には入れない。必ず「登録する／直して登録する／登録しない」をお客様に押していただく。
 *  - 決まりの文は言い切り（「〜は書かない」「〜をおすすめする」）・1つ80字まで（OWNER_RULES.maxLen）。
 *  - サーバーのビルド対象がES5のため正規表現に u フラグは使わない。
 *
 * 判定を変えるときは server/contentRequest.test.ts の当たる文・当たらない文も合わせて直す。
 */
import { OWNER_RULES } from "./ownerRules";

export type ContentRequestKind = "avoid" | "include" | "style";

export type ContentRuleProposal = {
  kind: ContentRequestKind;
  /** 決まりの文（言い切り・80字まで） */
  rule: string;
  /** 避けたい話題の言葉（NGワードにも入れられる短い名詞）。無ければ undefined */
  ngWord?: string;
};

export type ContentRequest = {
  rules: ContentRuleProposal[];
  source: "rule" | "ai";
};

/** supportQuestions.category に入れる分類（管理画面・取りこぼし点検で拾う） */
export const CONTENT_RULE_CATEGORY = "投稿の決まり";

/** supportQuestions.handledBy に入れる印（「自動で反映済み」と分かるように） */
export const CONTENT_RULE_HANDLED_BY = {
  registered: "自動（書き方の決まりに登録）",
  declined: "自動（お客様が登録しないを選択）",
} as const;

/** 1回の確認で出す決まりの数 */
const MAX_RULES_PER_PROPOSAL = 5;

/** 困りごと・操作のお尋ね（requestKind.ts の SUPPORT_QUESTION_RE と同じ考え方） */
const TROUBLE_RE =
  /(できません|できない|エラー|不具合|届かない|届きません|来ない|来ません|入れません|ログイン|連携|解約|請求|お支払|支払い|料金|プラン|やり方|どうすれば|どうしたら|どうやって|方法|教えて|反映されない|表示されない|直し方|止め方|わからない|分からない|わかりません|分かりません)/;

/** お尋ねの形（？・疑問詞）。「〜してもらえますか」のようなお願いの形はここに入れない（下で言い換えてから見る） */
const QUESTION_RE = /([?？]|どこ|どう|なぜ|なんで|何|いつ|どれ|どの|ですか|でしょうか|ますか|ませんか)/;

/** 「〜してもらえますか？」のようなお願いの言い方を「〜してほしい」にそろえる */
const POLITE_ASK_RE = /(して|に)?(もらえますか|もらえませんか|いただけますか|いただけませんか|頂けますか|頂けませんか|お願いできますか|もらえる|くれる|くれますか|くれませんか)[?？。！!]*$/;

/** アプリ・お知らせ・設定の言葉（これが「何を」に入っていたら、投稿の中身ではなく設定のご希望） */
const APP_WORD_RE =
  /(確認|承認|通知|案内|お知らせ|メール|LINE|ライン|読み物|朝のまとめ|カード|自動|ボタン|画面|設定|アプリ|固定|ピン|プラン|アカウント|ログイン|Threads|スレッズ|メニュー|友だち|友達|紹介コード|紹介制度|予約)/i;

/** 指すものが分からない言葉（「この辺を使って」「これはいらない」）。決まりの文にできない */
const DEMONSTRATIVE_RE = /^(この辺|このへん|この|その|あの|これ|それ|あれ|ここ|そこ|こちら|そちら|こういう|そういう|ああいう|こんな|そんな|あんな|同じ|いつもの|今日の|昨日の|さっきの|今の|前の)(の|ような|みたいな|感じ|系|へん|辺)?$/;

/** 時の言葉だけ（「毎日の投稿はいらない」は投稿を止めたいご相談で、話題の決まりではない） */
const TIME_ONLY_RE = /^(毎日|今日|明日|昨日|朝|夜|夕方|土日|週末|平日|休み|休日|毎朝|毎晩|毎週|今週|来週|今月|来月)$/;

/** 写真・リンクのこと（写真つきの投稿・ご案内先URLは別の受け口がある） */
const MEDIA_WORD_RE = /(写真|画像|動画|映像|URL|リンク|ＵＲＬ)/i;

/** あいさつ・前置きだけの行（ほかの行が決まりになれば、あってもよい） */
const CUSHION_RE =
  /^(お世話になっております|お世話になります|おつかれさまです|お疲れ様です|お疲れさまです|いつもありがとうございます|ありがとうございます|よろしくお願い(いた)?します|宜しくお願い(致)?します|すみません|すいません|あと|それと|それから|また|あの|えっと|お願いです|お願いがあります|ご相談です|要望です|ご要望です)[。．、！!～〜ｗw]*$/;

function len(s: string): number {
  return Array.from(s).length;
}

/** 「何を」の部分の前後のつなぎ言葉を外し、並びを「や」でそろえる */
export function cleanTopic(raw: string): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/^(もう|あの|あと|それと|それから|また|できれば|なるべく|できるだけ|今後は|今後|これからは|これから|次から|今度から|基本的に|あまり|あんまり)[、,\s　]*/, "");
  s = s.replace(/^(もう|もっと)[、,\s　]*/, "");
  s = s.replace(/(のこと|の事|っていう|という|みたいな|とか|など|なんか|関係|関連|に関する|についての|について|関係の|系の|系)$/, "");
  s = s.replace(/(のこと|の事|っていう|という|みたいな|とか|など)$/, "");
  s = s.replace(/[、,，・\/／]\s*/g, "や").replace(/(や)+/g, "や").replace(/^や|や$/g, "");
  return s.trim();
}

/** 「何を」に使えるか（2〜30字・指すものが分かる・アプリの言葉ではない） */
function usableTopic(x: string): boolean {
  const n = len(x);
  if (n < 2 || n > 30) return false;
  if (DEMONSTRATIVE_RE.test(x) || TIME_ONLY_RE.test(x)) return false;
  if (APP_WORD_RE.test(x) || MEDIA_WORD_RE.test(x)) return false;
  if (/^(投稿|話題|話|ネタ|内容|文章|文)$/.test(x)) return false;
  if (/(同じ|似た|似てる|似ている|ワンパターン)/.test(x)) return false; // 「同じような投稿はいらない」は別の受け口（freshTopic）
  if (/[0-9０-９]{3,}/.test(x)) return false;
  return true;
}

/** NGワードにも入れられる短い名詞か（言葉そのものが投稿に出ると困るもの） */
function ngWordOf(x: string): string | undefined {
  const w = x.replace(/^[「『]|[」』]$/g, "").trim();
  if (len(w) < 2 || len(w) > 15) return undefined;
  if (/や/.test(w) && len(w) > 8) return undefined; // 並びは決まりの文だけにする
  if (/(っぽい|的な|ような|みたいな|すぎる|過ぎる)$/.test(w)) return undefined;
  if (/[をにがはで]/.test(w.slice(-1))) return undefined;
  return w;
}

function fit(rule: string): string | null {
  const r = rule.replace(/[。．]+$/, "").trim();
  if (len(r) < 4 || len(r) > OWNER_RULES.maxLen) return null;
  return r;
}

/** 書き方（絵文字・長さ・改行・ハッシュタグ・口調・言い換え・締め）のご希望を1行から読む */
function styleRule(line: string): ContentRuleProposal | null {
  const s = line;
  // 「この投稿を短くして」のような1本だけの直しは、その投稿の書き直し（決まりではない）
  if (/(この|今日の|さっきの|今の|昨日の|明日の)(投稿|文|文章)/.test(s)) return null;

  if (/絵文字/.test(s)) {
    if (/(なし|無し|いらない|要らない|いりません|使わないで|使わない|やめて|入れないで|つけないで|付けないで|不要|禁止|ゼロ|0個)/.test(s)) return { kind: "style", rule: "絵文字は使わない" };
    if (/(減らして|少なく|少なめ|控えめ|ひかえめ|多すぎ|多過ぎ|多い)/.test(s)) return { kind: "style", rule: "絵文字は少なめにする（1つの投稿に1〜2個まで）" };
    if (/(増やして|多め|多く|もっと(使|入|付|つけ))/.test(s)) return { kind: "style", rule: "絵文字を多めに使う" };
    return null;
  }
  if (/(ハッシュタグ|タグ|#|＃)/.test(s) && /(なし|無し|いらない|要らない|つけないで|付けないで|入れないで|やめて|不要)/.test(s)) {
    return { kind: "style", rule: "ハッシュタグは付けない" };
  }
  if (/改行/.test(s)) {
    if (/(増やして|多め|多く|もっと)/.test(s)) return { kind: "style", rule: "改行を多めにして読みやすくする" };
    if (/(減らして|少なく|少なめ|多すぎ|多過ぎ)/.test(s)) return { kind: "style", rule: "改行は少なめにする" };
    return null;
  }
  // 長さ（「短くして」「長すぎる」）。投稿・文章の話か、ほぼそれだけの一言のときだけ
  const aboutPost = /(投稿|文章|文|本文)/.test(s) || len(s) <= 14;
  if (aboutPost && /((もっと|もう少し|もうちょっと|もうちょい)?短く(して|書いて|まとめて|お願い)|短め(に|で)(して|書いて|お願い)?|長すぎ|長過ぎ|長い(です|ので|から))/.test(s)) {
    return { kind: "style", rule: "投稿は短めに書く" };
  }
  if (aboutPost && /((もっと|もう少し|もうちょっと)長く(して|書いて|お願い)|長め(に|で)(して|書いて|お願い)?|短すぎ|短過ぎ)/.test(s)) {
    return { kind: "style", rule: "投稿は長めにしっかり書く" };
  }
  // 口調
  if (/(敬語|です・?ます|ですます|丁寧な(言葉|口調))/.test(s) && /(で|に)(書いて|して|お願い|統一)/.test(s)) return { kind: "style", rule: "です・ます調の丁寧な言葉で書く" };
  if (/(タメ口|ため口|くだけた|砕けた|フランク|親しみやすい)/.test(s) && /(で|に|く)(書いて|して|お願い)|口調/.test(s)) return { kind: "style", rule: "親しみやすい、くだけた口調で書く" };
  if (/(硬い|かたい|堅い)/.test(s) && /(柔らかく|やわらかく|やさしく|優しく)/.test(s)) return { kind: "style", rule: "やわらかい口調で書く" };
  // 「A」ではなく「B」と書いて
  {
    const m = s.match(/[「『]([^」』]{1,20})[」』](?:じゃなくて|ではなく|ではなくて|でなく|じゃなく|より)[、,\s　]*[「『]([^」』]{1,20})[」』](?:と|で|に)?(?:書いて|して|呼んで|言って|お願い|統一)/);
    if (m) {
      const r = fit(`「${m[1]}」ではなく「${m[2]}」と書く`);
      return r ? { kind: "style", rule: r } : null;
    }
  }
  // 最後は「〜」で締めて
  {
    const m = s.match(/(?:最後|締め|しめ|文末)(?:は|に|を)?(?:必ず|いつも)?[、\s　]*[「『]([^」』]{2,40})[」』](?:で締めて|でしめて|で終わって|と書いて|を入れて|を付けて|をつけて|にして|で終わらせて)/);
    if (m) {
      const r = fit(`最後は「${m[1]}」で締める`);
      return r ? { kind: "style", rule: r } : null;
    }
  }
  return null;
}

const AVOID_VERB =
  "(?:いらない|要らない|いりません|要りません|不要|なしで|無しで|なしでお願いします|やめてほしい|やめて欲しい|やめてください|やめて下さい|やめて|止めてほしい|止めて欲しい|控えてほしい|控えて欲しい|控えてください|控えて|避けてほしい|避けて欲しい|避けてください|避けて|NG|ＮＧ)";
const AVOID_WRITE_VERB =
  "(?:書かないで|出さないで|入れないで|使わないで|触れないで|載せないで|取り上げないで|扱わないで)(?:ほしい|欲しい|ください|下さい|もらいたい|いただきたい)?";
const TAIL = "(?:です|でお願いします|でお願いいたします|にしてください|にして欲しい|にしてほしい|と思います|と思っています|です。)?[。．！!〜～ｗw]*$";

const AVOID_NOUN_RE = new RegExp(
  `^(.{2,40}?)(の|に関する|関係の|系の|っぽい|みたいな|的な|という|っていう)?(話題|話|ネタ|投稿|内容|記事|言い方|言葉|表現|ワード|フレーズ|呼び方|書き方)(?:は|も|を)?(?:もう|あまり|あんまり)?${AVOID_VERB}${TAIL}`,
);
const AVOID_WRITE_RE = new RegExp(
  `^(.{2,40}?)(?:のこと|の事|の話|の話題|という言葉|って言葉|という言い方)?(?:は|も|を)?(?:投稿に|投稿で|投稿には|文章に|本文に)?(?:は|も)?${AVOID_WRITE_VERB}${TAIL}`,
);

/** 避けたい話題・言葉を1行から読む */
function avoidRule(line: string): ContentRuleProposal | null {
  let m = line.match(AVOID_NOUN_RE);
  const noun = m ? m[3] : "";
  const like = m && /^(っぽい|みたいな|的な)$/.test(m[2] ?? "") ? m[2] : "";
  let writeVerb = "";
  if (!m) {
    m = line.match(AVOID_WRITE_RE);
    if (!m) return null;
    const v = line.match(/(書かないで|出さないで|入れないで|使わないで|触れないで|載せないで|取り上げないで|扱わないで)/);
    writeVerb = v ? v[1] : "";
  }
  const rawTopic = m[1];
  const quoted = rawTopic.match(/^[「『]([^」』]{1,30})[」』]$/);
  const x = quoted ? quoted[1].trim() : cleanTopic(rawTopic);
  if (!usableTopic(x)) return null;
  const isWording = Boolean(quoted) || /(言い方|言葉|表現|ワード|フレーズ|呼び方|書き方)/.test(noun) || (writeVerb === "使わないで" && !/(話|話題|ネタ|こと|事)/.test(rawTopic));
  if (isWording) {
    const r = fit(`「${x}」という言い方は使わない`);
    return r ? { kind: "avoid", rule: r, ngWord: ngWordOf(x) } : null;
  }
  const r = like || /(っぽい|的な|ような|みたいな)$/.test(x)
    ? fit(`${x.replace(/(っぽい|的な|ような|みたいな)$/, "")}っぽい投稿は書かない`)
    : fit(`${x}の話題は書かない`);
  // 「宣伝っぽい投稿」は言葉そのものではなく雰囲気の話。「宣伝」をNGワードにすると関係のない文まで言い換わる
  return r ? { kind: "avoid", rule: r, ngWord: like ? undefined : ngWordOf(x) } : null;
}

const RECOMMEND_RE = new RegExp(
  `^(.{2,40}?)(?:を|も|は)?(?:もっと|どんどん|積極的に)?(お勧め|おすすめ|オススメ|お薦め|推し|推奨|紹介|宣伝|アピール|PR|ＰＲ)(?:を)?(?:し)?(?:たい|ていきたい|していきたい|してほしい|して欲しい|してください|して下さい|してもらいたい|していただきたい|したいです|させたい)${TAIL}`,
);
const MORE_RE = new RegExp(
  `^(?:もっと|もう少し)?(.{2,40}?)(?:の話|の話題|のこと|の事|について|に関する話|の投稿)(?:を|も)?(?:もっと|もう少し)?(増やして|多めに|多くして|もっと書いて|もっと入れて|もっと出して)(?:ほしい|欲しい|ください|下さい|もらいたい)?${TAIL}`,
);
const MORE2_RE = new RegExp(
  `^もっと(.{2,40}?)(?:の話|の話題|のこと|の事|について|に関する話)(?:を|も)?(書いて|入れて|出して|取り上げて)(?:ほしい|欲しい|ください|下さい|もらいたい)${TAIL}`,
);
const INCLUDE_RE = new RegExp(
  `^(.{2,40}?)(?:の話|の話題|のこと)?(?:を|も)(?:投稿に|投稿で|文章に)?(?:もっと|どんどん|積極的に|毎回|必ず)?(入れて|使って|取り入れて|取り上げて|盛り込んで|混ぜて|載せて)(?:ほしい|欲しい|ください|下さい|もらいたい|いただきたい)${TAIL}`,
);

/** 入れてほしい中身を1行から読む */
function includeRule(line: string): ContentRuleProposal | null {
  {
    const m = line.match(RECOMMEND_RE);
    if (m) {
      const x = cleanTopic(m[1]);
      if (!usableTopic(x)) return null;
      const verb = /(紹介|宣伝|アピール|PR|ＰＲ)/.test(m[2]) ? "紹介する" : "おすすめする";
      const r = fit(`${x}を${verb}`);
      return r ? { kind: "include", rule: r } : null;
    }
  }
  for (const re of [MORE_RE, MORE2_RE]) {
    const m = line.match(re);
    if (m) {
      const x = cleanTopic(m[1]);
      if (!usableTopic(x)) return null;
      const r = fit(`${x}の話を多めに入れる`);
      return r ? { kind: "include", rule: r } : null;
    }
  }
  {
    const m = line.match(INCLUDE_RE);
    if (m) {
      const x = cleanTopic(m[1]);
      if (!usableTopic(x)) return null;
      const r = fit(`${x}を投稿に取り入れる`);
      return r ? { kind: "include", rule: r } : null;
    }
  }
  return null;
}

/** 1行を決まりの文にする。当たらなければ null */
export function ruleFromLine(rawLine: string): ContentRuleProposal | null {
  let line = String(rawLine ?? "").trim().replace(/^[\s　]*[-・•*①-⑳0-9０-９.．)）]+\s*/, "").trim();
  if (!line) return null;
  // 「〜してもらえますか？」はお願いの形。「〜してほしい」にそろえてから見る
  if (POLITE_ASK_RE.test(line)) line = line.replace(POLITE_ASK_RE, (_m, p1) => (p1 === "に" ? "にしてほしい" : "してほしい"));
  if (QUESTION_RE.test(line)) return null;
  if (TROUBLE_RE.test(line)) return null;
  return styleRule(line) ?? avoidRule(line) ?? includeRule(line);
}

/**
 * 公式LINEの自由文が「投稿の中身についてのご希望」なら、決まりの文の案を返す（規則だけで判定）。
 * 1つでも「ご希望でもあいさつでもない行」があれば当てない（ご質問が混じった文を横取りしない）。
 */
export function detectContentRequest(text: string): ContentRequest | null {
  const s = String(text ?? "").trim();
  if (!s || len(s) > 160) return null;
  const lines = s
    .split(/\r?\n|。|．/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 6) return null;
  const rules: ContentRuleProposal[] = [];
  for (const l of lines) {
    if (CUSHION_RE.test(l)) continue;
    const r = ruleFromLine(l);
    if (!r) return null;
    if (!rules.some((x) => x.rule === r.rule)) rules.push(r);
  }
  if (rules.length === 0) return null;
  return { rules: rules.slice(0, MAX_RULES_PER_PROPOSAL), source: "rule" };
}

/**
 * 投稿の中身についてのご希望「らしい」か（言い回しで広めに見る）。
 *   規則で決まりの文にできなかったのに、ここに当たるものは、自動の返事で済ませずに担当者へ回す
 *   （10/14 のように「NGワードをご自身で登録して」と答えたまま誰も対応しない、を防ぐ）。
 */
export function looksLikeContentWish(text: string): boolean {
  const s = String(text ?? "").trim();
  if (!s || len(s) > 300) return false;
  if (TROUBLE_RE.test(s) && !/(話題|ネタ|言い方|言葉|表現)/.test(s)) return false;
  const avoid = /(話題|話|ネタ|内容|言葉|言い方|表現|ワード|フレーズ)[^。！？\n]{0,8}(いらない|要らない|いりません|不要|やめて|書かないで|出さないで|入れないで|使わないで|触れないで|避けて|控えて|なしで|無しで)/.test(s);
  const include = (/(お勧め|おすすめ|オススメ|お薦め|推し|宣伝|アピール)[^。！？\n]{0,4}(したい|していきたい|してほしい|して欲しい|してください)/.test(s) && !APP_WORD_RE.test(s))
    || /(話題|話|ネタ|こと)[^。！？\n]{0,6}(増やして|多めに|もっと書いて|もっと入れて)/.test(s);
  const style = /(絵文字|ハッシュタグ|改行|口調|敬語|タメ口)[^。！？\n]{0,10}(減らして|増やして|なしで|無しで|いらない|やめて|使わないで|少なく|多く|控えめ)/.test(s);
  return avoid || include || style;
}

/**
 * 自動の答え（supportBot）が出した決まりの案を使ってよい文か。
 *   投稿の中身・書き方に触れていて、やり方・場所・不具合のお尋ねではないものだけ
 *   （「絵文字はどうやって入れるの？」に決まりの案が付いてきても使わない）。
 */
export function aiMayProposeRules(text: string): boolean {
  const s = String(text ?? "").trim();
  if (!s || len(s) > 300) return false;
  if (!/(投稿|話題|話|ネタ|内容|言葉|言い方|表現|絵文字|ハッシュタグ|改行|口調|文章|書い|書か|勧め|おすすめ|オススメ|紹介|宣伝|アピール|呼びかけ|町名|締め|短く|長く|入れて|使って|出さない)/.test(s)) return false;
  if (/(どこ|どうやって|どうすれば|どうしたら|やり方|方法|なぜ|なんで|いつ|いくら|何件|何回|何通)/.test(s)) return false;
  if (/(できません|できない|エラー|不具合|届かない|届きません|来ない|来ません|ログイン|連携|解約|請求|支払)/.test(s)) return false;
  return true;
}

/**
 * AIが出した決まりの文の案を整える。使えなければ null。
 *   「決まり：」の頭・句点・かぎかっこの外側を外し、担当者・AI・お尋ねの形の入った文は捨てる。
 */
export function sanitizeRuleText(raw: unknown): string | null {
  let r = String(raw ?? "").trim();
  r = r.replace(/^(決まり|きまり|ルール)[\s　]*[:：]?[\s　]*/, "");
  r = r.replace(/^[「『](.+)[」』]$/, "$1").trim();
  r = r.replace(/[。．]+$/, "").trim();
  if (!r || /\n/.test(r)) return null;
  if (len(r) < 4 || len(r) > OWNER_RULES.maxLen) return null;
  if (/(担当者|こちらで|当方|弊社|AI|ＡＩ|https?:|[?？])/i.test(r)) return null;
  if (APP_WORD_RE.test(r) && !/(呼びかけ|Meta|メタ)/i.test(r)) return null;
  return r;
}

/** AIの案（配列）→ 決まりの案。1つも使えなければ null */
export function contentRequestFromAi(rules: unknown): ContentRequest | null {
  if (!Array.isArray(rules)) return null;
  const out: ContentRuleProposal[] = [];
  for (const raw of rules) {
    const r = sanitizeRuleText(raw);
    if (r && !out.some((x) => x.rule === r)) out.push({ kind: /(書かない|使わない|入れない|出さない|触れない|避ける)/.test(r) ? "avoid" : "include", rule: r });
  }
  return out.length ? { rules: out.slice(0, MAX_RULES_PER_PROPOSAL), source: "ai" } : null;
}

/**
 * お客様にお出しする確認の文。決まりの文は1行ずつ「」で囲む（ボタンを押す時点で状態が切れていても、
 * この文（supportQuestions.aiAnswer に残す）から読み戻せるように）。
 */
export function buildProposalText(rules: readonly string[], opts?: { multiAccount?: boolean }): string {
  return [
    "投稿の中身についてのご希望ですね。次の決まりとして登録します。よろしいですか。",
    "",
    ...rules.map((r) => `「${r}」`),
    "",
    "登録すると、明日以降に作る投稿から毎回この決まりを守ります。",
    opts?.multiAccount
      ? "どのアカウントの決まりにするか、下から選んでください。言い方を変えたいときは「直して登録する」を押してください。"
      : "言い方を変えたいときは「直して登録する」を押してください。",
  ].join("\n");
}

/** 確認の文から決まりの文を読み戻す（行頭から行末まで「」で囲んだ行だけ） */
export function parseProposalRules(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().match(/^「(.+)」$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => m[1].trim())
    .filter((r) => len(r) >= 2 && len(r) <= OWNER_RULES.maxLen);
}

/** 登録後にお返しする文 */
export function registeredText(rules: readonly string[], opts?: { ngWords?: readonly string[]; account?: string | null; total?: number }): string {
  const who = opts?.account ? `@${opts.account} の` : "";
  return [
    `「${rules.join("」「")}」を${who}書き方の決まりに登録しました。明日以降に作る投稿から反映します。`,
    ...(opts?.ngWords?.length ? [`あわせて「${opts.ngWords.join("」「")}」を使わない言葉（NGワード）にも入れました。`] : []),
    "決まりは「設定」→「書き方の決まり」で見直せます。",
  ].join("\n");
}

export const DECLINED_TEXT =
  "承知しました。決まりには登録しません。\n" +
  "あとから入れたくなったときは「決まり：〜」と送っていただくか、「設定」→「書き方の決まり」から足せます。";

export const FIX_PROMPT_TEXT =
  `登録する決まりの文を、短い文で送ってください（1つ${OWNER_RULES.maxLen}字まで。いくつかある場合は改行で区切ってください）。\n` +
  "例：スポーツ選手の話題は書かない";
