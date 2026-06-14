/**
 * Threads Studio 営業/紹介用スライド生成（美容サロン向け）
 *   node scripts/make-pitch-slides-beauty.cjs
 * 出力: threads-studio-pitch-beauty.pptx
 */
const pptxgen = require('pptxgenjs');

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10" x 5.625"
pres.title = 'Threads Studio — 美容サロン向け';
pres.author = '株式会社しっとる';

// ─── パレット（信頼感のある紺＋白＋アクセント緑＋限定感のローズ）─────────
const C = {
  navy: '1E3A5F',
  navyDark: '152B47',
  white: 'FFFFFF',
  bgSoft: 'F4F7FB',
  cardBg: 'FFFFFF',
  green: '2D9D78',
  greenSoft: 'D9F0E6',
  greenDark: '047857',
  text: '1F2937',
  textMute: '64748B',
  divider: 'E2E8F0',
  accent: 'F59E0B',
  rose: 'F43F5E',
  roseSoft: 'FFF1F2',
  roseDark: '9F1239',
  yellowSoft: 'FEF3C7',
  yellowDark: '92400E',
  blueSoft: 'DBEAFE',
  blueDark: '1E40AF',
};

const FONT_TITLE = 'Hiragino Sans';
const FONT_BODY = 'Hiragino Sans';

const TOTAL = 20;

// ─── 共通ヘルパ ──────────────────────────────────────────────
function pageHeader(slide, title, subtitle) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 0.45, w: 0.12, h: 0.55,
    fill: { color: C.green }, line: { type: 'none' },
  });
  slide.addText(title, {
    x: 0.75, y: 0.4, w: 8.7, h: 0.6,
    fontFace: FONT_TITLE, fontSize: 22, bold: true, color: C.navy, margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.75, y: 0.95, w: 8.7, h: 0.4,
      fontFace: FONT_BODY, fontSize: 11.5, color: C.textMute, margin: 0,
    });
  }
  slide.addShape(pres.shapes.LINE, {
    x: 0.5, y: 1.4, w: 9.0, h: 0,
    line: { color: C.divider, width: 1 },
  });
}
function pageFooter(slide, num) {
  slide.addText('Threads Studio  |  株式会社しっとる', {
    x: 0.5, y: 5.25, w: 6, h: 0.25,
    fontFace: FONT_BODY, fontSize: 9, color: C.textMute, margin: 0,
  });
  slide.addText(`${num} / ${TOTAL}`, {
    x: 8.5, y: 5.25, w: 1, h: 0.25,
    fontFace: FONT_BODY, fontSize: 9, color: C.textMute, align: 'right', margin: 0,
  });
}
function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: opts.fill || C.cardBg }, line: { type: 'none' },
    shadow: { type: 'outer', color: '000000', blur: 8, offset: 1, angle: 90, opacity: 0.05 },
  });
}

// ════════════════════════════════════════════════════════════════
// 1. 表紙
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 1.6, w: 0.25, h: 1.5,
    fill: { color: C.green }, line: { type: 'none' },
  });
  s.addText('Threads Studio', {
    x: 0.8, y: 1.15, w: 8.5, h: 0.9,
    fontFace: FONT_TITLE, fontSize: 42, bold: true, color: C.white, margin: 0,
  });
  s.addText('美容サロンのための AI 投稿運用ツール', {
    x: 0.8, y: 2.0, w: 8.5, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 19, color: C.white, margin: 0,
  });
  s.addText('景表法・薬機法に配慮した、事実ベースの地域集客投稿を自動で。', {
    x: 0.8, y: 2.5, w: 8.5, h: 0.4,
    fontFace: FONT_BODY, fontSize: 13, color: 'BFD0E5', margin: 0,
  });

  // 3つのスタットチップ
  const stats = [
    { big: '月¥4,980〜', small: '個人サロンでも始められる価格' },
    { big: '1日5分', small: '確認だけで運用が回る' },
    { big: '15業界', small: '法令ベースで自動チェック' },
  ];
  const sw = 2.8, sh = 1.05, sy = 3.3;
  stats.forEach((st, i) => {
    const x = 0.8 + i * (sw + 0.1);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: sy, w: sw, h: sh,
      fill: { color: '2A4D78' }, line: { color: C.green, width: 1 },
    });
    s.addText(st.big, {
      x, y: sy + 0.1, w: sw, h: 0.5,
      fontFace: FONT_TITLE, fontSize: 22, bold: true, color: C.green,
      align: 'center', margin: 0,
    });
    s.addText(st.small, {
      x, y: sy + 0.62, w: sw, h: 0.35,
      fontFace: FONT_BODY, fontSize: 10, color: 'BFD0E5',
      align: 'center', margin: 0,
    });
  });

  s.addText('提供：株式会社しっとる', {
    x: 0.8, y: 4.8, w: 6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11, color: 'BFD0E5', margin: 0,
  });
  s.addText('https://threads-studio.com', {
    x: 0.8, y: 5.1, w: 6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11, color: C.green, margin: 0,
  });
}

// ════════════════════════════════════════════════════════════════
// 2. 美容サロンオーナーが抱える集客の悩み
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '美容サロンオーナーが抱える集客の悩み', 'こんな状況、思い当たりませんか？');

  const items = [
    { t: '既存顧客の指名固定で新規が増えない', d: '常連様は安定するも、新しいお客様の流入が止まっている' },
    { t: 'インスタは更新しているのに集客に直結しない', d: '写真は撮るが文章はおざなり。フォロワーは増えても来店に繋がらない' },
    { t: '法令で書きたいことが書けない', d: '「美白」「効く」「シミが消える」が使えず、投稿の手が止まる' },
    { t: '投稿する時間がない', d: '営業中は施術と接客で手一杯、夜は疲れて文章が書けない' },
    { t: '競合の中で埋もれる', d: '近所にサロンが増え、選ばれる理由を発信できていない' },
  ];
  const baseY = 1.65;
  const rowH = 0.65;
  items.forEach((it, i) => {
    const y = baseY + i * rowH;
    s.addShape(pres.shapes.OVAL, {
      x: 0.7, y: y + 0.05, w: 0.4, h: 0.4,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(String(i + 1), {
      x: 0.7, y: y + 0.05, w: 0.4, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 13, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(it.t, {
      x: 1.3, y: y, w: 7.8, h: 0.3,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.navy, margin: 0,
    });
    s.addText(it.d, {
      x: 1.3, y: y + 0.28, w: 7.8, h: 0.3,
      fontFace: FONT_BODY, fontSize: 11, color: C.textMute, margin: 0,
    });
  });
  // 締めのメッセージ
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 4.95, w: 8.6, h: 0.32,
    fill: { color: C.yellowSoft }, line: { type: 'none' },
  });
  s.addText('→ どれも「やり方が悪い」のではなく、構造的に難しい問題です。', {
    x: 0.7, y: 4.95, w: 8.6, h: 0.32,
    fontFace: FONT_BODY, fontSize: 11, bold: true, color: C.yellowDark,
    align: 'center', valign: 'middle', margin: 0,
  });
  pageFooter(s, 2);
}

// ════════════════════════════════════════════════════════════════
// 3. そもそも Threads とは？
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, 'そもそも Threads（スレッズ）とは？', 'Meta社が運営する、テキスト主体の新しいSNS');

  // 左：ロゴ的なボックス＋一文要約
  card(s, 0.7, 1.65, 3.5, 3.5);
  s.addShape(pres.shapes.OVAL, {
    x: 1.7, y: 1.95, w: 1.5, h: 1.5,
    fill: { color: C.navy }, line: { type: 'none' },
  });
  s.addText('@', {
    x: 1.7, y: 1.95, w: 1.5, h: 1.5,
    fontFace: FONT_TITLE, fontSize: 60, bold: true, color: C.green,
    align: 'center', valign: 'middle', margin: 0,
  });
  s.addText('Threads', {
    x: 0.7, y: 3.6, w: 3.5, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 22, bold: true, color: C.navy,
    align: 'center', margin: 0,
  });
  s.addText('Instagramを作ったMeta社の\nテキスト型SNS', {
    x: 0.7, y: 4.15, w: 3.5, h: 0.8,
    fontFace: FONT_BODY, fontSize: 11, color: C.textMute,
    align: 'center', margin: 0,
  });

  // 右：4つのポイント
  const facts = [
    { t: '運営会社', d: 'Meta社（Instagram・Facebookと同じ会社）' },
    { t: 'サービス開始', d: '2023年7月。日本でも急速にユーザーが拡大中' },
    { t: '投稿のスタイル', d: 'テキスト主体（最大500文字）。写真・動画も投稿可' },
    { t: '使われ方', d: '「Xの代わり」として認知度が急上昇。\nInstagramアカウントでそのまま始められる' },
  ];
  facts.forEach((f, i) => {
    const y = 1.7 + i * 0.88;
    card(s, 4.4, y, 4.9, 0.78);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 4.4, y, w: 0.08, h: 0.78,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(f.t, {
      x: 4.6, y: y + 0.05, w: 4.6, h: 0.3,
      fontFace: FONT_TITLE, fontSize: 12, bold: true, color: C.navy, margin: 0,
    });
    s.addText(f.d, {
      x: 4.6, y: y + 0.32, w: 4.6, h: 0.45,
      fontFace: FONT_BODY, fontSize: 10, color: C.text, margin: 0,
    });
  });

  pageFooter(s, 3);
}

// ════════════════════════════════════════════════════════════════
// 4. なぜSNS運用は続かないのか（3つの壁）
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, 'なぜ美容サロンのSNS運用は続かないのか', '止まる原因は、ほぼ次の3つです');

  const walls = [
    {
      label: '時間の壁',
      icon: '時',
      title: '「投稿1本に30分」が積み重なる',
      d: '何を書くか考える時間、規制に違反していないか確認する時間、誤字脱字チェック ── 1本作るのに30分。週5本で月10時間。施術と接客の合間にはまず確保できない。',
    },
    {
      label: '規制の壁',
      icon: '法',
      title: '「美白」「効く」が書けない',
      d: '景品表示法・薬機法・医療広告ガイドライン。どこまでが安全な表現か、明確な線引きを毎回判断するのは現実的ではない。結果、当たり障りのない投稿になり、誰にも刺さらない。',
    },
    {
      label: 'センスの壁',
      icon: 'セ',
      title: '「何が伸びるか」がわからない',
      d: '1行目に何を書くか、地域名はどこに入れるか、写真とテキストのバランスは。アルゴリズムは変わり続け、感覚で書いても伸びない。誰かに聞こうにも、業界に詳しい人がいない。',
    },
  ];
  const cw = 2.85, ch = 3.3, gx = 0.15;
  walls.forEach((wl, i) => {
    const x = 0.7 + i * (cw + gx);
    card(s, x, 1.7, cw, ch);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.7, w: cw, h: 0.5,
      fill: { color: C.rose }, line: { type: 'none' },
    });
    s.addText(wl.label, {
      x, y: 1.7, w: cw, h: 0.5,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addShape(pres.shapes.OVAL, {
      x: x + cw / 2 - 0.35, y: 2.35, w: 0.7, h: 0.7,
      fill: { color: C.roseSoft }, line: { type: 'none' },
    });
    s.addText(wl.icon, {
      x: x + cw / 2 - 0.35, y: 2.35, w: 0.7, h: 0.7,
      fontFace: FONT_TITLE, fontSize: 22, bold: true, color: C.roseDark,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(wl.title, {
      x: x + 0.15, y: 3.15, w: cw - 0.3, h: 0.55,
      fontFace: FONT_TITLE, fontSize: 12.5, bold: true, color: C.navy,
      align: 'center', margin: 0,
    });
    s.addText(wl.d, {
      x: x + 0.2, y: 3.75, w: cw - 0.4, h: 1.2,
      fontFace: FONT_BODY, fontSize: 10, color: C.text, margin: 0,
    });
  });

  pageFooter(s, 4);
}

// ════════════════════════════════════════════════════════════════
// 5. なぜThreadsが美容サロンに向くのか
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, 'なぜ Threads が美容サロンに向くのか', '2026年時点の集客特性 ── 他SNSと違うポイント');

  const reasons = [
    { t: 'テキスト主体で十分に伸びる', d: 'インスタの写真投稿に「言葉」を補完。\n写真の作り込みなしでも届く。' },
    { t: '地域おすすめが強い', d: '1行目に地域名を入れると、近くに住む人の\nタイムラインに優先表示される仕様。' },
    { t: '近隣到達でCVに直結', d: '万バズは不要。近所の数百〜数千人に\n確実に届けば、来店に繋がる。' },
    { t: 'インスタアカウントで即開始', d: '既存のInstagramアカウントでそのまま\n開設可能。新規ID作成も不要。' },
  ];
  const cardW = 4.3, cardH = 1.6, gapX = 0.25, gapY = 0.2;
  const startX = 0.7, startY = 1.7;
  reasons.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    card(s, x, y, cardW, cardH);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.08, h: cardH,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(r.t, {
      x: x + 0.25, y: y + 0.15, w: cardW - 0.35, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.navy, margin: 0,
    });
    s.addText(r.d, {
      x: x + 0.25, y: y + 0.6, w: cardW - 0.35, h: 0.95,
      fontFace: FONT_BODY, fontSize: 11, color: C.text, margin: 0,
    });
  });

  // 補足
  s.addText('※ Instagramは写真前提・Xは速報前提。美容サロンの「地域×言葉で選ばれる」運用と最も相性が良いのがThreadsです。', {
    x: 0.7, y: 5.0, w: 8.6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10.5, italic: true, color: C.textMute, margin: 0,
  });
  pageFooter(s, 5);
}

// ════════════════════════════════════════════════════════════════
// 6. Threads Studio ができること
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, 'Threads Studio ができること', '投稿のネタ作りから自動投稿まで、丸ごとAIに任せられる');

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 1.65, w: 8.6, h: 0.95,
    fill: { color: C.navy }, line: { type: 'none' },
  });
  s.addText('「何を書こう」と悩む時間を、お客様に戻す。', {
    x: 0.7, y: 1.65, w: 8.6, h: 0.95,
    fontFace: FONT_TITLE, fontSize: 21, bold: true, color: C.white,
    align: 'center', valign: 'middle', margin: 0,
  });

  const pillars = [
    { n: 'ネタ作り', sub: 'AIが文章を生成', d: 'サロンの業種・地域・強みからAIが投稿文を生成。13種類の型から選べる。共感／実績／地元ネタ／Q&A／ストーリー…' },
    { n: '運用代行', sub: '自動で毎日投稿', d: '毎日決まった時間に自動投稿。手を動かさなくても発信が続く。営業中・休業日でも勝手に投稿される。' },
    { n: '安全性', sub: '規制と事実を守る', d: '業界規制と事実ベースを徹底。「言ってはいけない」を自動で回避。架空エピソードや盛った数字は出さない設計。' },
  ];
  const pw = 2.85, gap = 0.2, py = 2.85, ph = 2.25;
  pillars.forEach((p, i) => {
    const x = 0.7 + i * (pw + gap);
    card(s, x, py, pw, ph);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: py, w: pw, h: 0.08,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(p.n, {
      x, y: py + 0.2, w: pw, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 18, bold: true, color: C.navy,
      align: 'center', margin: 0,
    });
    s.addText(p.sub, {
      x, y: py + 0.7, w: pw, h: 0.3,
      fontFace: FONT_BODY, fontSize: 11, color: C.green,
      align: 'center', margin: 0,
    });
    s.addText(p.d, {
      x: x + 0.2, y: py + 1.05, w: pw - 0.4, h: 1.15,
      fontFace: FONT_BODY, fontSize: 10.5, color: C.text, margin: 0,
    });
  });
  pageFooter(s, 6);
}

// ════════════════════════════════════════════════════════════════
// 7. 5つの具体的メリット
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, 'サロンオーナーが得られる 5つの具体的メリット', '感覚ではなく、数字で変わるもの');

  const benefits = [
    { num: '1', big: '1投稿 20分 → 2分', label: '時間削減', d: '考える・書く・規制チェックの工程をAIが代行。月20本投稿なら 6時間 → 40分。' },
    { num: '2', big: '代行費 月5〜30万 → ¥4,980〜', label: 'コスト削減', d: 'SNS代行は月5〜15万、美容サロン特化なら月15万＋初期費10万が相場。1/10以下で、しかもサロンの言葉で書ける。' },
    { num: '3', big: '15業界の法令を内蔵', label: 'リスク回避', d: '景表法・薬機法・医療広告ガイドラインの違反リスクをAI側で自動回避。「うっかり違反」を構造的に防ぐ。' },
    { num: '4', big: '13タイプ × 量産機能', label: 'ネタ切れ防止', d: '毎日違う切り口で書ける。当たった投稿は別バージョン5本に量産。' },
    { num: '5', big: '近隣のタイムラインに届く', label: '地域集客', d: '1行目に地域名を自動配置。Threadsの地域おすすめロジックに乗りやすい構造。' },
  ];
  // 上段3つ
  const tw = 2.85, th = 1.65;
  benefits.slice(0, 3).forEach((b, i) => {
    const x = 0.7 + i * (tw + 0.15);
    const y = 1.65;
    card(s, x, y, tw, th);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: tw, h: 0.06, fill: { color: C.green }, line: { type: 'none' },
    });
    s.addShape(pres.shapes.OVAL, {
      x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.4,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(b.num, {
      x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(b.label, {
      x: x + 0.6, y: y + 0.15, w: tw - 0.7, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.green, bold: true, margin: 0,
    });
    s.addText(b.big, {
      x: x + 0.15, y: y + 0.6, w: tw - 0.3, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 13.5, bold: true, color: C.navy, margin: 0,
    });
    s.addText(b.d, {
      x: x + 0.15, y: y + 1.05, w: tw - 0.3, h: 0.55,
      fontFace: FONT_BODY, fontSize: 9.5, color: C.text, margin: 0,
    });
  });
  // 下段2つ（中央寄せ）
  const bw = 4.35, bh = 1.65;
  benefits.slice(3).forEach((b, i) => {
    const x = 0.7 + i * (bw + 0.2);
    const y = 3.45;
    card(s, x, y, bw, bh);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: bw, h: 0.06, fill: { color: C.green }, line: { type: 'none' },
    });
    s.addShape(pres.shapes.OVAL, {
      x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.4,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(b.num, {
      x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(b.label, {
      x: x + 0.6, y: y + 0.15, w: bw - 0.7, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.green, bold: true, margin: 0,
    });
    s.addText(b.big, {
      x: x + 0.15, y: y + 0.6, w: bw - 0.3, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.navy, margin: 0,
    });
    s.addText(b.d, {
      x: x + 0.15, y: y + 1.05, w: bw - 0.3, h: 0.55,
      fontFace: FONT_BODY, fontSize: 10, color: C.text, margin: 0,
    });
  });

  pageFooter(s, 7);
}

// ════════════════════════════════════════════════════════════════
// 8. Before / After シナリオ
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '導入前と導入後 ── 1日の流れはこう変わる', '個人経営の美容サロン（指名制・1人運営）を想定');

  // Before
  card(s, 0.7, 1.65, 4.2, 3.5, { fill: 'FFF5F5' });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 1.65, w: 4.2, h: 0.5, fill: { color: C.rose }, line: { type: 'none' },
  });
  s.addText('Before  ── 導入前', {
    x: 0.7, y: 1.65, w: 4.2, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
    align: 'center', valign: 'middle', margin: 0,
  });
  const beforeRows = [
    { t: '朝',   d: 'インスタの写真は撮ったが、何を書こうか思いつかない' },
    { t: '昼',   d: '営業中。お客様対応で投稿どころではない' },
    { t: '夕方', d: '「美白」と書きそうになり消す。当たり障りない文に' },
    { t: '夜',   d: '疲れて投稿せず、SNSは月に2〜3回しか動かない' },
    { t: '結果', d: '常連様の指名は安定するも、新規来店はゼロ' },
  ];
  beforeRows.forEach((r, i) => {
    const y = 2.25 + i * 0.55;
    s.addText(r.t, {
      x: 0.85, y, w: 0.7, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 11, bold: true, color: C.roseDark,
      valign: 'middle', margin: 0,
    });
    s.addText(r.d, {
      x: 1.55, y, w: 3.3, h: 0.45,
      fontFace: FONT_BODY, fontSize: 9.5, color: C.text,
      valign: 'middle', margin: 0,
    });
  });

  // After
  card(s, 5.1, 1.65, 4.2, 3.5, { fill: 'F0FDF4' });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.65, w: 4.2, h: 0.5, fill: { color: C.green }, line: { type: 'none' },
  });
  s.addText('After  ── 導入後', {
    x: 5.1, y: 1.65, w: 4.2, h: 0.5,
    fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
    align: 'center', valign: 'middle', margin: 0,
  });
  const afterRows = [
    { t: '朝',   d: '7:30、AIが自動投稿（前夜にスケジュール済み）' },
    { t: '昼',   d: '休憩3分で内容確認。気になれば1タップで修正' },
    { t: '夕方', d: 'コメントが来たらAI下書きで返信。施術の合間でOK' },
    { t: '夜',   d: '翌日分を3本まとめて生成・予約。週1の運用でも回る' },
    { t: '結果', d: '地域名×具体性の投稿が積み上がる。新規来店が安定化' },
  ];
  afterRows.forEach((r, i) => {
    const y = 2.25 + i * 0.55;
    s.addText(r.t, {
      x: 5.25, y, w: 0.7, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 11, bold: true, color: C.greenDark,
      valign: 'middle', margin: 0,
    });
    s.addText(r.d, {
      x: 5.95, y, w: 3.3, h: 0.45,
      fontFace: FONT_BODY, fontSize: 9.5, color: C.text,
      valign: 'middle', margin: 0,
    });
  });

  pageFooter(s, 8);
}

// ════════════════════════════════════════════════════════════════
// 9. 差別化① 業界規制を内蔵チェック
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '差別化①  業界規制を内蔵チェック', '景品表示法・薬機法・医療広告ガイドラインに対応した自動回避');

  card(s, 0.7, 1.65, 4.1, 3.45);
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 1.65, w: 4.1, h: 0.45,
    fill: { color: 'FEE2E2' }, line: { type: 'none' },
  });
  s.addText('AIが自動で避ける表現', {
    x: 0.85, y: 1.65, w: 3.95, h: 0.45,
    fontFace: FONT_TITLE, fontSize: 13, bold: true, color: 'B91C1C',
    valign: 'middle', margin: 0,
  });
  const ng = ['美白', '効く', 'シミが消える', 'ニキビが治る', '痩せる', '永久脱毛', '若返り', '日本一', '絶対'];
  ng.forEach((w, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    s.addText(`× ${w}`, {
      x: 0.9 + col * 1.3, y: 2.25 + row * 0.55, w: 1.3, h: 0.4,
      fontFace: FONT_BODY, fontSize: 13, color: 'B91C1C', bold: true, margin: 0,
    });
  });
  s.addText('美容サロンは景品表示法・薬機法上、「効く」「美白」「シミが消える」等が使えません。', {
    x: 0.9, y: 4.05, w: 3.8, h: 0.95,
    fontFace: FONT_BODY, fontSize: 10, color: C.text, italic: true, margin: 0,
  });

  card(s, 5.2, 1.65, 4.1, 3.45);
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 1.65, w: 4.1, h: 0.45,
    fill: { color: C.greenSoft }, line: { type: 'none' },
  });
  s.addText('AIが自動で言い換える表現', {
    x: 5.35, y: 1.65, w: 3.95, h: 0.45,
    fontFace: FONT_TITLE, fontSize: 13, bold: true, color: '047857',
    valign: 'middle', margin: 0,
  });
  const ok = ['お手入れ', 'ケアする', '整える', '丁寧に仕上げる', 'ハリのある質感', '明るい印象', '心地よい時間', 'こだわっています', '可能な範囲で'];
  ok.forEach((w, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    s.addText(`○ ${w}`, {
      x: 5.4 + col * 1.3, y: 2.25 + row * 0.55, w: 1.3, h: 0.4,
      fontFace: FONT_BODY, fontSize: 12, color: '047857', bold: true, margin: 0,
    });
  });
  s.addText('AIが業種を見て、最初から安全な表現で生成。オーナーが規制を覚える必要はありません。', {
    x: 5.4, y: 4.05, w: 3.8, h: 0.95,
    fontFace: FONT_BODY, fontSize: 10, color: C.text, italic: true, margin: 0,
  });
  pageFooter(s, 9);
}

// ════════════════════════════════════════════════════════════════
// 10. 差別化② 事実ベース生成
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '差別化②  事実ベース生成（捏造ゼロ）', '架空のお客様・盛った実績を、AIに作らせない');

  card(s, 0.7, 1.65, 4.3, 3.45);
  s.addText('はじめにAIが8つの質問', {
    x: 0.9, y: 1.8, w: 4.0, h: 0.4,
    fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.navy, margin: 0,
  });
  const qs = [
    '普段の話し方・口調',
    '他サロンではなく選ばれる理由',
    '使ってよい実績の数字（年数・人数等）',
    '実在のお客様エピソード（仮名可）',
    '渡せる特典（LINE登録特典・初回相談等）',
    '絶対に書きたくないこと',
    '好みの投稿スタイル',
    'マーケティング技法をフル活用するか',
  ];
  qs.forEach((q, i) => {
    s.addText(`${i + 1}. ${q}`, {
      x: 0.9, y: 2.25 + i * 0.32, w: 4.0, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10.5, color: C.text, margin: 0,
    });
  });

  card(s, 5.2, 1.65, 4.1, 1.55);
  s.addText('答えてもらった事実だけを使う', {
    x: 5.4, y: 1.8, w: 3.7, h: 0.4,
    fontFace: FONT_TITLE, fontSize: 13, bold: true, color: C.green, margin: 0,
  });
  s.addText('「実績は無い」と答えたサロンでは、AIは数字を出しません。「お客様エピソードは無い」と答えれば、架空の物語を作りません。', {
    x: 5.4, y: 2.25, w: 3.7, h: 0.95,
    fontFace: FONT_BODY, fontSize: 11, color: C.text, margin: 0,
  });

  card(s, 5.2, 3.3, 4.1, 1.8);
  s.addText('「絶対に書かない」リスト', {
    x: 5.4, y: 3.45, w: 3.7, h: 0.4,
    fontFace: FONT_TITLE, fontSize: 13, bold: true, color: C.green, margin: 0,
  });
  s.addText('オーナーが「業界批判はしない」「料金は出さない」「個人情報は載せない」などを登録 → AIが厳守。コンプライアンスの最後の砦になります。', {
    x: 5.4, y: 3.9, w: 3.7, h: 1.1,
    fontFace: FONT_BODY, fontSize: 11, color: C.text, margin: 0,
  });
  pageFooter(s, 10);
}

// ════════════════════════════════════════════════════════════════
// 11. 差別化③ 地域集客最適化
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '差別化③  地域集客に最適化', '2026年Threadsアルゴリズムの最新傾向に対応');

  const left = [
    { t: '1行目に地域名を自動配置', d: 'Threadsの地域おすすめロジックが反応する最重要シグナル' },
    { t: 'テキスト主体・画像なしでも到達', d: '撮影機材なしで運用可能。テキスト投稿が優遇される傾向' },
    { t: '生のURLは本文に貼らない', d: 'プロフィールのリンクに誘導する形に統一。到達低下を回避' },
  ];
  const right = [
    { t: 'バズより近隣到達', d: '万単位の拡散は不要。近所の数百人に届けば来店に繋がる' },
    { t: '返信を生む投稿設計', d: 'いいねよりコメントが評価される時代。問いかけで終わる構成' },
    { t: 'リアルタイム実況型を搭載', d: '「今日のお客様はこんなお悩みで」など現場感のある投稿パターン' },
  ];
  function col(items, x0) {
    items.forEach((it, i) => {
      const y = 1.65 + i * 1.1;
      card(s, x0, y, 4.2, 0.95);
      s.addShape(pres.shapes.OVAL, {
        x: x0 + 0.15, y: y + 0.15, w: 0.35, h: 0.35,
        fill: { color: C.greenSoft }, line: { type: 'none' },
      });
      s.addText('✓', {
        x: x0 + 0.15, y: y + 0.15, w: 0.35, h: 0.35,
        fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.green,
        align: 'center', valign: 'middle', margin: 0,
      });
      s.addText(it.t, {
        x: x0 + 0.6, y: y + 0.1, w: 3.55, h: 0.35,
        fontFace: FONT_TITLE, fontSize: 12.5, bold: true, color: C.navy, margin: 0,
      });
      s.addText(it.d, {
        x: x0 + 0.6, y: y + 0.45, w: 3.55, h: 0.45,
        fontFace: FONT_BODY, fontSize: 10, color: C.textMute, margin: 0,
      });
    });
  }
  col(left, 0.7);
  col(right, 5.1);
  pageFooter(s, 11);
}

// ════════════════════════════════════════════════════════════════
// 12. 実際の生成サンプル
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '実際にAIが生成する投稿サンプル', '「渋谷区代々木／美容室／髪のうねりに悩む30代女性向け」と入力した場合');

  // 入力サマリ
  card(s, 0.7, 1.6, 8.6, 0.7, { fill: 'EEF2FF' });
  s.addText('業種: 美容室  /  地域: 渋谷区代々木  /  ターゲット: 髪のうねり・パサつきに悩む30代女性  /  型: 共感型', {
    x: 0.9, y: 1.6, w: 8.2, h: 0.7,
    fontFace: FONT_BODY, fontSize: 10.5, color: C.blueDark,
    valign: 'middle', margin: 0,
  });

  // 生成結果（Threads風の投稿カード）
  card(s, 0.7, 2.4, 5.6, 2.75);
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 2.4, w: 5.6, h: 0.4, fill: { color: C.navy }, line: { type: 'none' },
  });
  s.addText('AI生成 ── 投稿本文', {
    x: 0.85, y: 2.4, w: 5.4, h: 0.4,
    fontFace: FONT_BODY, fontSize: 10, bold: true, color: C.white,
    valign: 'middle', margin: 0,
  });
  s.addText(
    '渋谷区代々木で、髪のうねりとパサつきに悩む30代の方へ。\n\nシャンプー直後はまとまるのに、夕方になると広がってくる。\nそんな日が続いていませんか？\n\n当店は完全予約制の小さなサロンで、髪と頭皮に優しい薬剤を厳選。\nお手入れの時間を含めて、ゆったりお過ごしいただけます。\n\n「ちょっと相談だけでも」の段階で大丈夫です。',
    {
      x: 0.9, y: 2.9, w: 5.3, h: 2.2,
      fontFace: FONT_BODY, fontSize: 10.5, color: C.text, margin: 0,
    }
  );

  // 右側：解説
  card(s, 6.4, 2.4, 2.9, 2.75);
  s.addText('ここを自動でやっています', {
    x: 6.55, y: 2.5, w: 2.65, h: 0.35,
    fontFace: FONT_TITLE, fontSize: 11, bold: true, color: C.green, margin: 0,
  });
  const points = [
    '✓ 1行目に地域名',
    '✓ ターゲット特有の悩みを具体化',
    '✓ 「美白」「効く」は不使用',
    '✓ 強みを事実だけで明記',
    '✓ 行動ハードルを下げる締め',
  ];
  points.forEach((p, i) => {
    s.addText(p, {
      x: 6.55, y: 2.9 + i * 0.4, w: 2.65, h: 0.35,
      fontFace: FONT_BODY, fontSize: 10, color: C.text, margin: 0,
    });
  });
  pageFooter(s, 12);
}

// ════════════════════════════════════════════════════════════════
// 13. 主要機能一覧
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '主要機能一覧', '集客に必要な機能を一つのツールに集約');

  const features = [
    { n: 'AI投稿生成 13タイプ', d: '地元ネタ／実績／共感／Q&A／ストーリー 他' },
    { n: '自動投稿スケジューラ', d: '毎日決まった時間に短い単発投稿を自動配信' },
    { n: '予約投稿', d: '日時を指定して1回送信。キャンペーン告知に' },
    { n: '固定投稿（ピン留め用）', d: 'プロフィール最上部用の自己紹介投稿' },
    { n: '量産（変奏）', d: '当たった投稿を別バージョンで5本一気に生成' },
    { n: 'コメント返信支援', d: 'AI下書き付きで素早く対応' },
    { n: '投稿分析', d: 'インプレッション・いいね・コメントを一覧確認' },
    { n: '複数アカウント切替', d: '院ごとに別Threadsアカウントを1クリックで切替' },
    { n: '業界規制チェック', d: '15業界の法令ベースで自動回避' },
  ];
  const cw = 2.85, ch = 1.05, gx = 0.2, gy = 0.2;
  features.forEach((f, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.7 + col * (cw + gx);
    const y = 1.65 + row * (ch + gy);
    card(s, x, y, cw, ch);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: 0.06,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(f.n, {
      x: x + 0.2, y: y + 0.15, w: cw - 0.4, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 12.5, bold: true, color: C.navy, margin: 0,
    });
    s.addText(f.d, {
      x: x + 0.2, y: y + 0.55, w: cw - 0.4, h: 0.5,
      fontFace: FONT_BODY, fontSize: 10, color: C.textMute, margin: 0,
    });
  });
  pageFooter(s, 13);
}

// ════════════════════════════════════════════════════════════════
// 14. 他選択肢との比較
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '他の選択肢との比較', 'サロンオーナーが実際に選びそうな4つの方法');

  // ヘッダ行
  const colXs = [0.7, 2.85, 4.6, 6.35, 8.1];
  const colW = [2.1, 1.7, 1.7, 1.7, 1.4];
  const headers = ['', '自分で書く', '代行業者', '汎用AI(ChatGPT等)', 'Threads Studio'];
  const headerY = 1.55;
  headers.forEach((h, i) => {
    const isUs = i === 4;
    s.addShape(pres.shapes.RECTANGLE, {
      x: colXs[i], y: headerY, w: colW[i], h: 0.45,
      fill: { color: isUs ? C.green : C.navy }, line: { type: 'none' },
    });
    s.addText(h, {
      x: colXs[i], y: headerY, w: colW[i], h: 0.45,
      fontFace: FONT_TITLE, fontSize: 10.5, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
  });

  // 行データ
  const rows = [
    ['月コスト', '¥0', '¥50,000〜300,000', '¥0〜3,000', '¥4,980〜'],
    ['初期費用', '¥0', '¥100,000〜500,000', '¥0', '¥0'],
    ['時間負担', '高い（1本30分）', '低い', '中（指示は必要）', '低い（1本2分）'],
    ['業界規制チェック', '自分で判断', '業者の知識次第', 'なし', '内蔵自動回避'],
    ['事実ベース', '○', '○（要伝達）', '×（架空が出る）', '○（8問で担保）'],
    ['地域最適化', '自分で工夫', '業者次第', 'なし', '自動配置'],
    ['自動投稿', '×', '○', '×', '○'],
  ];
  const rowH = 0.4;
  rows.forEach((r, i) => {
    const y = headerY + 0.45 + i * rowH;
    // 背景（縞）
    if (i % 2 === 0) {
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.7, y, w: 8.8, h: rowH,
        fill: { color: 'FFFFFF' }, line: { type: 'none' },
      });
    } else {
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.7, y, w: 8.8, h: rowH,
        fill: { color: 'F1F5F9' }, line: { type: 'none' },
      });
    }
    // Threads Studio列ハイライト
    s.addShape(pres.shapes.RECTANGLE, {
      x: colXs[4], y, w: colW[4], h: rowH,
      fill: { color: C.greenSoft }, line: { type: 'none' },
    });
    r.forEach((v, j) => {
      const isLabel = j === 0;
      const isUs = j === 4;
      s.addText(v, {
        x: colXs[j], y, w: colW[j], h: rowH,
        fontFace: isLabel ? FONT_TITLE : FONT_BODY,
        fontSize: isLabel ? 10 : 9.5,
        bold: isLabel || isUs,
        color: isUs ? C.greenDark : (isLabel ? C.navy : C.text),
        align: isLabel ? 'left' : 'center',
        valign: 'middle',
        margin: isLabel ? { l: 5, r: 5, t: 0, b: 0 } : 0,
      });
    });
  });
  s.addText('※ 代行業者の月額相場は投稿のみで5万円〜、美容サロン特化型代理店で15〜30万円が一般的（2026年5月現在の公開価格を参照）。', {
    x: 0.7, y: 4.85, w: 8.8, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, italic: true, color: C.textMute, margin: 0,
  });
  s.addText('出典: b-step.net / bizboost.ssalon.net / stock-sun.com 他、運用代行サービスの公開料金ページ', {
    x: 0.7, y: 5.1, w: 8.8, h: 0.25,
    fontFace: FONT_BODY, fontSize: 8, italic: true, color: C.textMute, margin: 0,
  });
  pageFooter(s, 14);
}

// ════════════════════════════════════════════════════════════════
// 15. 人件費で考える ── 経営者の時間 vs スタッフ vs サービス
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '人件費で考える ── どれが一番安くつくか', '月20本投稿（1本30分）= 月10時間 の運用を想定');

  const options = [
    {
      label: 'オーナーが自分でやる',
      sub: '機会損失で計算',
      bg: 'FEE2E2', titleColor: 'B91C1C',
      cost: '月 ¥60,000〜150,000相当',
      detail: 'オーナーの時間単価は施術単価で換算。\nカット・カラー¥6,000〜15,000/h × 月10時間。\nその時間を施術にあてれば\n10人分の売上機会。',
      verdict: '機会損失が大きい',
      verdictColor: 'B91C1C',
    },
    {
      label: 'スタッフに任せる',
      sub: '人件費 + 教育コスト',
      bg: 'FEF3C7', titleColor: '92400E',
      cost: '月 ¥15,000〜30,000',
      detail: '時給¥1,200〜1,500 × 月10時間 ≒ ¥14,000。\n+ 業界規制を覚えてもらう教育時間。\n+ 退職時の引き継ぎコスト。\n+ 違反リスクはオーナーが負う。',
      verdict: '人件費 + 人材リスク',
      verdictColor: '92400E',
    },
    {
      label: 'Threads Studio',
      sub: 'サービス利用',
      bg: 'D9F0E6', titleColor: '047857',
      cost: '月 ¥4,980〜',
      detail: 'オーナーは週5分の確認のみ。\n規制チェック内蔵 = 教育不要。\n退職もしない（ツールなので）。\n投稿の質はAIで均質化。',
      verdict: '最安かつ最低リスク',
      verdictColor: '047857',
    },
  ];

  const cw = 2.85, ch = 3.15, gx = 0.15;
  options.forEach((o, i) => {
    const x = 0.7 + i * (cw + gx);
    const y = 1.6;
    card(s, x, y, cw, ch);
    // ヘッダ帯
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: 0.55,
      fill: { color: o.bg }, line: { type: 'none' },
    });
    s.addText(o.label, {
      x, y: y + 0.06, w: cw, h: 0.3,
      fontFace: FONT_TITLE, fontSize: 13, bold: true, color: o.titleColor,
      align: 'center', margin: 0,
    });
    s.addText(o.sub, {
      x, y: y + 0.32, w: cw, h: 0.22,
      fontFace: FONT_BODY, fontSize: 9.5, color: o.titleColor,
      align: 'center', margin: 0,
    });
    // 金額（大）
    s.addText(o.cost, {
      x: x + 0.1, y: y + 0.7, w: cw - 0.2, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.navy,
      align: 'center', margin: 0,
    });
    // 区切り線
    s.addShape(pres.shapes.LINE, {
      x: x + 0.4, y: y + 1.2, w: cw - 0.8, h: 0,
      line: { color: C.divider, width: 1 },
    });
    // 詳細
    s.addText(o.detail, {
      x: x + 0.15, y: y + 1.3, w: cw - 0.3, h: 1.4,
      fontFace: FONT_BODY, fontSize: 9.5, color: C.text, margin: 0,
    });
    // 判定帯
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: y + ch - 0.4, w: cw, h: 0.4,
      fill: { color: o.bg }, line: { type: 'none' },
    });
    s.addText(o.verdict, {
      x, y: y + ch - 0.4, w: cw, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 11, bold: true, color: o.verdictColor,
      align: 'center', valign: 'middle', margin: 0,
    });
  });

  // 下部の経営者向けひとこと
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 4.9, w: 8.6, h: 0.32,
    fill: { color: C.navy }, line: { type: 'none' },
  });
  s.addText('オーナーの1時間は施術1人分の売上。スタッフの1時間は給与。── 月¥4,980 はどちらより圧倒的に安い。', {
    x: 0.7, y: 4.9, w: 8.6, h: 0.32,
    fontFace: FONT_TITLE, fontSize: 11, bold: true, color: C.white,
    align: 'center', valign: 'middle', margin: 0,
  });
  pageFooter(s, 15);
}

// ════════════════════════════════════════════════════════════════
// 16. 導入の流れ
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '導入の流れ', '初日に投稿が出るまで、おおよそ10分');

  const steps = [
    { n: 'STEP 1', t: 'アカウント作成', d: 'メール登録または既存のGoogleアカウントで開始（無料）' },
    { n: 'STEP 2', t: 'Threadsアカウントを連携', d: 'ワンクリック認証。複数アカウントの切替もこのあと可能' },
    { n: 'STEP 3', t: 'プロジェクト作成', d: 'サロンの業種・地域・ターゲット・主な悩み・強みを入力' },
    { n: 'STEP 4', t: 'AIカウンセリング（8問）→ 生成開始', d: '質問に答えるとAIがそのサロンの言葉で投稿を作り始めます' },
  ];
  const sx = 0.7, sy = 1.65, sw = 8.6, sh = 0.78, gap = 0.15;
  steps.forEach((st, i) => {
    const y = sy + i * (sh + gap);
    card(s, sx, y, sw, sh);
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y, w: 1.4, h: sh,
      fill: { color: C.navy }, line: { type: 'none' },
    });
    s.addText(st.n, {
      x: sx, y, w: 1.4, h: sh,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(st.t, {
      x: sx + 1.6, y: y + 0.12, w: sw - 1.8, h: 0.32,
      fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.navy, margin: 0,
    });
    s.addText(st.d, {
      x: sx + 1.6, y: y + 0.4, w: sw - 1.8, h: 0.35,
      fontFace: FONT_BODY, fontSize: 11, color: C.text, margin: 0,
    });
  });
  s.addText('※ 無料プランで動作確認 → 合えば有料プランへ。クレジット情報は有料へ切替時のみ入力。', {
    x: 0.7, y: 4.85, w: 8.8, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, italic: true, color: C.textMute, margin: 0,
  });
  pageFooter(s, 16);
}

// ════════════════════════════════════════════════════════════════
// 17. 料金プラン
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '料金プラン', 'すべて税込／クレジットカード決済（Visa・Mastercard・JCB・AMEX）');

  // 上段：キャンペーン
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7, y: 1.6, w: 8.6, h: 0.32,
    fill: { color: C.rose }, line: { type: 'none' },
  });
  s.addText('期間限定キャンペーン（3回課金で自動終了・終了後はフリープランに戻ります）', {
    x: 0.7, y: 1.6, w: 8.6, h: 0.32,
    fontFace: FONT_TITLE, fontSize: 11, bold: true, color: C.white,
    align: 'center', valign: 'middle', margin: 0,
  });
  const cps = [
    { name: 'ライト キャンペーン', price: '¥2,980', sub: '/月 ×3回' },
    { name: 'プロ キャンペーン', price: '¥6,980', sub: '/月 ×3回' },
    { name: 'ビジネス キャンペーン', price: '¥19,800', sub: '/月 ×3回' },
  ];
  cps.forEach((p, i) => {
    const x = 0.7 + i * 2.9;
    const y = 2.0, w = 2.7, h = 1.3;
    card(s, x, y, w, h, { fill: 'FFF1F2' });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h: 0.06, fill: { color: C.rose }, line: { type: 'none' },
    });
    s.addText(p.name, {
      x, y: y + 0.15, w, h: 0.35,
      fontFace: FONT_TITLE, fontSize: 12, bold: true, color: C.roseDark,
      align: 'center', margin: 0,
    });
    s.addText(p.price, {
      x, y: y + 0.5, w, h: 0.45,
      fontFace: FONT_TITLE, fontSize: 22, bold: true, color: C.roseDark,
      align: 'center', margin: 0,
    });
    s.addText(p.sub, {
      x, y: y + 0.95, w, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.roseDark,
      align: 'center', margin: 0,
    });
  });

  // 下段：通常プラン
  s.addText('通常プラン（継続課金）', {
    x: 0.7, y: 3.45, w: 8.6, h: 0.3,
    fontFace: FONT_TITLE, fontSize: 12, bold: true, color: C.navy, margin: 0,
  });
  const normals = [
    { name: 'ライト', price: '¥4,980', desc: '個人経営の1店舗向け\nAI生成 月10回' },
    { name: 'プロ', price: '¥9,800', desc: 'AI生成無制限\n最人気プラン', popular: true },
    { name: 'ビジネス', price: '¥29,800', desc: '複数店舗・チーム運用' },
    { name: '代理店', price: '¥55,000', desc: '無制限・代理店向け最上位' },
  ];
  normals.forEach((p, i) => {
    const x = 0.7 + i * 2.18;
    const y = 3.8, w = 2.0, h = 1.35;
    card(s, x, y, w, h);
    if (p.popular) {
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w, h: 0.06, fill: { color: C.green }, line: { type: 'none' },
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: x + w - 0.6, y: y + 0.08, w: 0.55, h: 0.22,
        fill: { color: C.green }, line: { type: 'none' },
      });
      s.addText('人気', {
        x: x + w - 0.6, y: y + 0.08, w: 0.55, h: 0.22,
        fontFace: FONT_TITLE, fontSize: 8, bold: true, color: C.white,
        align: 'center', valign: 'middle', margin: 0,
      });
    }
    s.addText(p.name, {
      x, y: y + 0.1, w, h: 0.3,
      fontFace: FONT_TITLE, fontSize: 13, bold: true, color: C.navy,
      align: 'center', margin: 0,
    });
    s.addText(p.price, {
      x, y: y + 0.4, w, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 19, bold: true, color: C.navy,
      align: 'center', margin: 0,
    });
    s.addText('/月', {
      x, y: y + 0.78, w, h: 0.2,
      fontFace: FONT_BODY, fontSize: 9, color: C.textMute,
      align: 'center', margin: 0,
    });
    s.addText(p.desc, {
      x: x + 0.1, y: y + 0.98, w: w - 0.2, h: 0.35,
      fontFace: FONT_BODY, fontSize: 9, color: C.text,
      align: 'center', margin: 0,
    });
  });
  pageFooter(s, 17);
}

// ════════════════════════════════════════════════════════════════
// 18. 安心して使える設計
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, '安心して使える3つの設計', 'コンプライアンス・データ・コストの3軸で守る');

  const safety = [
    {
      label: 'コンプライアンス保護',
      title: '言ってはいけない表現を構造的にブロック',
      d: '業種選択の時点で対応法令を自動適用。AI生成・量産・コメント返信のすべての出口でフィルタが効きます。「うっかり違反」は構造的に出ません。',
    },
    {
      label: 'データ保護',
      title: '院ごとに分離・第三者提供なし',
      d: 'サロンごとにプロジェクトが分離。投稿内容・カウンセリング回答は他社・他サロンに共有されません。AIの学習には使用されません（外部AI API利用時の設定を含む）。',
    },
    {
      label: 'コスト保護',
      title: '上限超過の請求が起きない仕組み',
      d: 'AI生成にはプラン単位の月間上限を設定。上限を超える生成は実行前にブロックされ、想定外の高額請求は発生しません。',
    },
  ];
  const cw = 2.85, ch = 3.35, gx = 0.15;
  safety.forEach((sf, i) => {
    const x = 0.7 + i * (cw + gx);
    card(s, x, 1.65, cw, ch);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.65, w: cw, h: 0.5,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText(sf.label, {
      x, y: 1.65, w: cw, h: 0.5,
      fontFace: FONT_TITLE, fontSize: 13, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(sf.title, {
      x: x + 0.2, y: 2.3, w: cw - 0.4, h: 0.9,
      fontFace: FONT_TITLE, fontSize: 12, bold: true, color: C.navy,
      align: 'center', margin: 0,
    });
    s.addShape(pres.shapes.LINE, {
      x: x + 0.4, y: 3.25, w: cw - 0.8, h: 0,
      line: { color: C.divider, width: 1 },
    });
    s.addText(sf.d, {
      x: x + 0.2, y: 3.35, w: cw - 0.4, h: 1.6,
      fontFace: FONT_BODY, fontSize: 10, color: C.text, margin: 0,
    });
  });
  pageFooter(s, 18);
}

// ════════════════════════════════════════════════════════════════
// 19. よくあるご質問
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bgSoft };
  pageHeader(s, 'よくあるご質問', '');

  const qas = [
    {
      q: 'AIが作った文章で本当に大丈夫？嘘っぽくなりませんか？',
      a: '8問のカウンセリングでサロンの実情を聞いてから作るので、答えていない数字や架空エピソードはAIが作りません。「事実だけ」で書く設計です。',
    },
    {
      q: '広告規制に違反しないか心配です',
      a: '業種を「美容室／エステ／脱毛／ネイル」等と入れた時点で、対応法令（景品表示法・薬機法・医療広告ガイドライン）の禁止表現がAI側で自動回避されます。「美白」「効く」「シミが消える」が出ない仕組みです。',
    },
    {
      q: 'インスタは既に運用しています。Threadsも必要ですか？',
      a: 'インスタは写真前提、Threadsはテキスト前提。役割が違います。Threadsはお持ちのInstagramアカウントでそのまま開設でき、地域×言葉で近隣の新規層に届けることに強みがあります。両方の併用が最も効果的です。',
    },
    {
      q: '効果は本当にありますか？',
      a: '個別の効果保証はしていません（美容系の集客に「必ず」は禁物）。ただし、地域名×具体性の投稿が近隣のおすすめに乗りやすい仕組みは2026年のThreadsで一貫しています。',
    },
  ];
  const cw = 8.6, ch = 0.82, gy = 0.1;
  qas.forEach((qa, i) => {
    const y = 1.55 + i * (ch + gy);
    card(s, 0.7, y, cw, ch);
    s.addShape(pres.shapes.OVAL, {
      x: 0.85, y: y + 0.12, w: 0.32, h: 0.32,
      fill: { color: C.green }, line: { type: 'none' },
    });
    s.addText('Q', {
      x: 0.85, y: y + 0.12, w: 0.32, h: 0.32,
      fontFace: FONT_TITLE, fontSize: 12, bold: true, color: C.white,
      align: 'center', valign: 'middle', margin: 0,
    });
    s.addText(qa.q, {
      x: 1.25, y: y + 0.08, w: cw - 0.6, h: 0.32,
      fontFace: FONT_TITLE, fontSize: 12, bold: true, color: C.navy, margin: 0,
    });
    s.addText(qa.a, {
      x: 1.25, y: y + 0.4, w: cw - 0.6, h: 0.4,
      fontFace: FONT_BODY, fontSize: 10.5, color: C.text, margin: 0,
    });
  });
  pageFooter(s, 19);
}

// ════════════════════════════════════════════════════════════════
// 20. 次のステップ／CTA
// ════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 1.7, w: 0.25, h: 1.8,
    fill: { color: C.green }, line: { type: 'none' },
  });
  s.addText('まずはお試しください', {
    x: 0.8, y: 1.2, w: 8.5, h: 0.7,
    fontFace: FONT_TITLE, fontSize: 30, bold: true, color: C.white, margin: 0,
  });
  s.addText('ライトキャンペーンなら3ヶ月だけ ¥2,980/月。\n合わなければそのまま終了。継続したい場合だけ通常プランへ。', {
    x: 0.8, y: 1.95, w: 8.5, h: 0.9,
    fontFace: FONT_BODY, fontSize: 13, color: 'CBD5E1', margin: 0,
  });

  // 3つのアクション
  const actions = [
    { big: '①', t: '無料で試す', d: 'メール1分で開始。\n3分で初回投稿が出ます' },
    { big: '②', t: '体験版を見る', d: '生成サンプルを見て\n感触を掴む' },
    { big: '③', t: '相談する', d: 'メールで質問。\n業種特有の悩みも対応' },
  ];
  const aw = 2.7, ah = 1.4, ay = 3.0;
  actions.forEach((a, i) => {
    const x = 0.8 + i * (aw + 0.15);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: ay, w: aw, h: ah,
      fill: { color: '2A4D78' }, line: { color: C.green, width: 1 },
    });
    s.addText(a.big, {
      x, y: ay + 0.1, w: aw, h: 0.4,
      fontFace: FONT_TITLE, fontSize: 18, bold: true, color: C.green,
      align: 'center', margin: 0,
    });
    s.addText(a.t, {
      x, y: ay + 0.5, w: aw, h: 0.35,
      fontFace: FONT_TITLE, fontSize: 13, bold: true, color: C.white,
      align: 'center', margin: 0,
    });
    s.addText(a.d, {
      x: x + 0.1, y: ay + 0.85, w: aw - 0.2, h: 0.55,
      fontFace: FONT_BODY, fontSize: 9.5, color: 'BFD0E5',
      align: 'center', margin: 0,
    });
  });

  // CTAボックス
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: 4.55, w: 8.4, h: 0.55,
    fill: { color: C.white }, line: { type: 'none' },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: 4.55, w: 0.12, h: 0.55,
    fill: { color: C.green }, line: { type: 'none' },
  });
  s.addText('https://threads-studio.com', {
    x: 1.05, y: 4.55, w: 5, h: 0.55,
    fontFace: FONT_TITLE, fontSize: 16, bold: true, color: C.navy,
    valign: 'middle', margin: 0,
  });
  s.addText('お問い合わせ：shittoru.ad@gmail.com', {
    x: 5.5, y: 4.55, w: 3.6, h: 0.55,
    fontFace: FONT_BODY, fontSize: 11, color: C.textMute,
    align: 'right', valign: 'middle', margin: 0,
  });

  s.addText('提供：株式会社しっとる', {
    x: 0.8, y: 5.2, w: 8.5, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, color: '94A3B8', margin: 0,
  });
}

pres.writeFile({ fileName: 'threads-studio-pitch-beauty.pptx' })
  .then((fileName) => console.log(`✅ 出力完了: ${fileName}`));
