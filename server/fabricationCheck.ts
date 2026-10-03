/**
 * 作り話チェックの通信部分（指示文・検証は shared/fabricationCheck.ts）。
 * 確認そのものが失敗したときは null を返す（呼び出し側は既存の機械ガードだけで判断する）。
 */
import { invokeLLM } from './_core/llm';
import {
  buildFabricationPrompt, parseFabricationResult, ruleBasedFabrications, mergeFabrications, FABRICATION_SCHEMA, type FabricationItem,
} from '../shared/fabricationCheck';

/** 確認に使うモデル。失敗時は invokeLLM が既定のモデルでやり直す */
export const FABRICATION_CHECK_MODEL = 'gemini-3.8-flash';

export async function checkFabrication(draft: string, facts: string): Promise<FabricationItem[] | null> {
  // 料金・保証の言葉は機械で確実に拾う（AIの確認が失敗しても、これだけは必ず効く）
  const rule = ruleBasedFabrications(draft, facts);
  try {
    const res = await invokeLLM({
      model: FABRICATION_CHECK_MODEL,
      temperature: 0,
      response_format: FABRICATION_SCHEMA,
      messages: [{ role: 'user', content: buildFabricationPrompt(draft, facts) }],
    });
    const ai = parseFabricationResult(String(res.choices[0]?.message?.content ?? ''), draft);
    if (ai === null) return rule.length > 0 ? rule : null;
    return mergeFabrications(ai, rule);
  } catch (e) {
    console.warn(`[fabricationCheck] 確認できませんでした: ${(e as Error)?.message?.slice(0, 200)}`);
    return rule.length > 0 ? rule : null;
  }
}

/** 登録情報を1つの文字列にまとめる（ラベル付き・空は省く） */
export function factsText(parts: Array<[string, unknown]>): string {
  const lines: string[] = [];
  for (const [label, v] of parts) {
    if (v == null) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const t = String(s).trim();
    if (!t || t === '[]' || t === '{}' || t === 'null') continue;
    lines.push(`【${label}】\n${t}`);
  }
  return lines.join('\n\n');
}
