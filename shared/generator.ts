import { nanoid } from "nanoid";
import { GenerateOptions, Post, ProjectInputs, Template, Tone } from "./types";

// 安全フィルタ: 広告規制・誇大表現を回避
const UNSAFE_PATTERNS = [
  // 医療系表現（あはき法・柔道整復師法・医師法対応）
  { pattern: /治る|治す|治療する/g, replacement: "整える" },
  { pattern: /治療(?!院)/g, replacement: "施術" },
  { pattern: /診断/g, replacement: "カウンセリング" },
  { pattern: /完治/g, replacement: "サポート" },
  { pattern: /根本改善/g, replacement: "根本からサポート" },
  { pattern: /に効く|に効果がある/g, replacement: "にアプローチする" },
  { pattern: /改善します/g, replacement: "を目指します" },
  { pattern: /改善する/g, replacement: "を目指す" },
  // 誇大表現（景品表示法対応）
  { pattern: /必ず|絶対|100%/g, replacement: "" },
  { pattern: /最高|最強|No\.1|ナンバーワン|日本一/g, replacement: "おすすめ" },
  { pattern: /劇的|驚異的|奇跡/g, replacement: "心地よい" },
  { pattern: /唯一無二/g, replacement: "こだわりの" },
  // 美容系（薬機法対応）
  { pattern: /アンチエイジング/g, replacement: "エイジングケア" },
  { pattern: /若返り|若返る/g, replacement: "ハリツヤ" },
  { pattern: /シミが消える|シワが消える/g, replacement: "肌を整える" },
  // フィットネス系
  { pattern: /必ず痩せる|絶対痩せる/g, replacement: "理想の体型を目指せる" },
];

function applySafetyFilter(text: string): string {
  let filtered = text;
  for (const { pattern, replacement } of UNSAFE_PATTERNS) {
    filtered = filtered.replace(pattern, replacement);
  }
  return filtered;
}

// トーンに応じた語尾調整
function applyTone(text: string, tone: Tone): string {
  switch (tone) {
    case "polite":
      return text
        .replace(/です。/g, "でございます。")
        .replace(/ます。/g, "ます。")
        .replace(/ください/g, "くださいませ");
    case "casual":
      return text
        .replace(/です。/g, "だよ。")
        .replace(/ます。/g, "るよ。")
        .replace(/ください/g, "してね");
    case "professional":
      return text; // デフォルトのまま
    default:
      return text;
  }
}

// テンプレート変数を置換
function replaceTemplateVariables(
  template: string,
  inputs: ProjectInputs
): string {
  let result = template;
  for (const [key, value] of Object.entries(inputs)) {
    if (value) {
      const regex = new RegExp(`{{${key}}}`, "g");
      result = result.replace(regex, value);
    }
  }
  // 未入力の変数を削除
  result = result.replace(/{{[^}]+}}/g, "");
  return result;
}

// 文字数制限を適用
function truncateToLimit(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}

// スレッド生成メイン関数
export function generateThread(
  template: Template,
  inputs: ProjectInputs,
  options: GenerateOptions
): Post[] {
  const { tone, maxCharsPerPost, postCount } = options;
  const rules = postCount
    ? template.outputRules.slice(0, postCount)
    : template.outputRules;

  const posts: Post[] = rules.map((rule, index) => {
    let content = replaceTemplateVariables(rule.contentTemplate, inputs);
    content = applySafetyFilter(content);
    content = applyTone(content, tone);
    content = truncateToLimit(content, maxCharsPerPost);

    return {
      id: nanoid(),
      content: content.trim(),
      order: index,
    };
  });

  return posts.filter((post) => post.content.length > 0);
}

// ハッシュタグ候補生成（ダミー実装、後でAI接続可能）
export function generateHashtags(inputs: ProjectInputs): string[] {
  const tags: string[] = [];
  if (inputs.storeName) tags.push(`#${inputs.storeName.replace(/\s/g, "")}`);
  if (inputs.target) {
    const targetKeywords = inputs.target.split(/[、,]/);
    targetKeywords.forEach((kw) => {
      const cleaned = kw.trim().replace(/\s/g, "");
      if (cleaned) tags.push(`#${cleaned}`);
    });
  }
  tags.push("#SNS運用", "#店舗集客", "#マーケティング");
  return tags.slice(0, 5);
}

// フック案生成（ダミー実装、後でAI接続可能）
export function generateHooks(inputs: ProjectInputs): string[] {
  const hooks: string[] = [];
  if (inputs.target && inputs.problem) {
    hooks.push(`${inputs.target}の方、${inputs.problem}で困っていませんか？`);
    hooks.push(`【必見】${inputs.target}向け｜${inputs.problem}を解決する方法`);
    hooks.push(`${inputs.problem}…その悩み、放置していませんか？`);
  }
  if (inputs.storeName) {
    hooks.push(`${inputs.storeName}が教える、今日から使える豆知識`);
  }
  hooks.push("知らないと損する！今すぐチェック👇");
  return hooks.slice(0, 5);
}
