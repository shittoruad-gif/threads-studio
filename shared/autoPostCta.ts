/**
 * 自動投稿の末尾に付けるCTA（行動喚起）の組み立て。
 *
 * かつてCTAは
 *   「初回体験のご相談は、プロフィールのリンクからLINEへどうぞ😊」
 * という固定文だった。これは登録内容に関係なく出るため、
 *
 *   - 公式LINEを持っていない店舗が「LINEへどうぞ」と案内してしまう
 *   - 来店型でない事業者（Web制作・広告運用等）が「初回体験」と案内してしまう
 *
 * という、事実と違う誘導が実際に発生した（2026-08-22 検出。
 * 株式会社しっとる＝LINE未開設、たきもと鍼灸整骨院＝リンク未登録の2件）。
 *
 * ここでは**登録されているリンクの種類だけ**を根拠にCTAを決める。
 * 案内できる先が1つも登録されていなければ、CTAは付けない。
 * 誘導先が無いのに誘導するより、CTAが無いほうが害が小さい。
 */

import { parseProjectLinks, type ProjectLink } from './projectLinks';
import { isLocalCatchmentBusiness } from './businessScope';

export interface CtaSourceProject {
  links?: string | null;
  /** 旧形式の単一URL（linksが空のときだけ見る） */
  ctaLink?: string | null;
  businessType?: string | null;
  /** 'personal'=個人ブランディングモード（来店・予約の言葉を使わない） */
  mode?: string | null;
}

/** 相談の呼び方。来店型は「ご相談・ご予約」、それ以外は「ご相談」 */
function consultWord(isLocal: boolean): string {
  return isLocal ? 'ご相談・ご予約' : 'ご相談';
}

/**
 * 投稿末尾のCTA文を作る。案内先が無ければ null（CTAなし）。
 *
 * @param project 店舗のリンク登録状況
 */
export function buildCtaText(project: CtaSourceProject): string | null {
  const links: ProjectLink[] = parseProjectLinks(project.links);
  const personal = project.mode === 'personal';
  const isLocal = !personal && isLocalCatchmentBusiness(project.businessType);
  const has = (t: string) => links.some((l) => l.type === t && !!l.url);

  // 1. 公式LINE がある場合だけ、LINEへ案内する
  if (has('line')) {
    if (personal) {
      // 個人ブランディング: 来店・予約の言葉を使わず、続きを読む導線として案内
      return 'もっと詳しい話は、プロフィールのリンクから公式LINEでお届けしています😊';
    }
    return `${consultWord(isLocal)}は、プロフィールのリンクから公式LINEへどうぞ😊\n無理な勧誘はありません。`;
  }

  // 2. ネット予約がある場合（個人モードでは予約導線を出さない）
  if (!personal && has('reservation')) {
    return 'ご予約は、プロフィールのリンクからどうぞ😊\n空き状況はその場でご確認いただけます。';
  }

  // 3. その他のリンク（HP・Instagram等）、または旧形式の単一URL
  if (links.length > 0 || (project.ctaLink && project.ctaLink.trim())) {
    return '詳しくは、プロフィールのリンクからご覧ください😊';
  }

  // 4. 案内できる先が無い。存在しない窓口へ誘導しないため、CTAは付けない
  return null;
}
