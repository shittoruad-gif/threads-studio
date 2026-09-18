import { describe, it, expect } from "vitest";
import { classifyRequestKind, isPastedContent, wantsTodayPosts, wantsNgWord, wantsPausePosting, looksLikeAnnouncement, isThanksOrGreeting, looksLikeOwnPostMaterial, looksLikeMaterialOnly, ownPlaceMarkers, wantsHuman, isShortWish } from "../shared/requestKind";
import { isFeatureRequest } from "../shared/requestDetect";

/**
 * AIが答えられなかったご質問のうち、担当者へ自動で通知するのは
 * classifyRequestKind が null（＝ご依頼でも投稿の材料でもない）のものだけ。
 * 実際に届いたご質問で、仕分けが変わっていないかを見る。
 */
describe("担当者へ通知するか（実際に届いたご質問で確認）", () => {
  const notify = (t: string) => classifyRequestKind(t) === null;

  it("困っているご連絡は通知する", () => {
    // #4 株式会社プレステージ様・4日間そのままだったご連絡
    expect(notify("連携したようですが、LINEに戻りません")).toBe(true);
    expect(notify("来月の私の請求額を教えてください")).toBe(true);
    expect(notify("ログインできません")).toBe(true);
    expect(notify("https://lin.ee/ZB0cQ0h")).toBe(true);
  });

  it("投稿文の貼り付けは通知しない", () => {
    // #5 氷見様が送られた固定投稿の文案（絵文字つきの長文）
    const pasted =
      "医学博士・整形外科医ご推薦の整体技術！！🔥 富山県唯一‼️\n\n＼世界レベルの整体技術／\n\n" +
      "【世界の小波津式🥇】(神経の整体)\n・最上級の認定院セミナー！！\n\n「もう無理…」\n\n「手術しかない…」\n\n" +
      "そんなあなたへ。\n\nまだ、諦めないでください。\n\n🌿 よくなる整体院\n富山県滑川市｜約30年｜延べ3万人以上";
    expect(isPastedContent(pasted)).toBe(true);
    expect(notify(pasted)).toBe(false);
  });

  it("実績・お客様のエピソードは通知しない", () => {
    // #3 香取様が送られた症例
    const material =
      "小学生が足を捻って我慢していたが、当院に来てエコー観察したら骨折があった（整形外科で確定診断）、" +
      "当院でリハビリを行い問題なくサッカーに復帰";
    expect(classifyRequestKind(material)).toBe("material");
    expect(notify(material)).toBe(false);
  });

  it("投稿の依頼は通知しない", () => {
    expect(classifyRequestKind("お盆休みの告知を投稿してください")).toBe("post");
    expect(notify("お盆休みの告知を投稿してください")).toBe(false);
  });

  it("疑問符があれば、長くても貼り付け扱いにしない", () => {
    const q = "あ".repeat(200) + "でよろしいでしょうか？";
    expect(isPastedContent(q)).toBe(false);
  });
});

describe("短い投稿文の断片も、ご質問として扱わない", () => {
  it("絵文字つき・3行以上・60字以上は貼り付け扱い（#7 氷見様）", () => {
    const t =
      "富山市から10代から慢性肩こりの20代👩\n" +
      "“こんなに軽くなったことない〜！！”\n" +
      "全身ユルユルになって、ルンルン🎶で帰られました🥺\n" +
      "📍滑川市の一回で効果を実感できる整体院";
    expect(isPastedContent(t)).toBe(true);
    expect(classifyRequestKind(t)).toBe("pasted");
  });

  it("短い困りごとは、貼り付けに巻き込まない", () => {
    expect(isPastedContent("投稿が来ません")).toBe(false);
    expect(isPastedContent("ログインできない\n助けてください")).toBe(false);
    expect(classifyRequestKind("投稿が来ません")).toBe(null);
  });
});

/**
 * 2026-09-08 ご質問 #21（呉服店様）。
 * ご自身の投稿文（前夜に公開ずみ）をそのまま送り返されたのに、
 * 締めの問いかけ「？」があるためご質問として扱われ、
 * 文中の「感じてほしい」に反応して
 * 「ご要望として承りました。夜の更新で反映します」と返していた。
 */
describe("読み手への問いかけで締める投稿文（#21 呉服店様）", () => {
  const post =
    "着物と聞くと、特別な日だけだと思われがち。\n\n" +
    "日常のお出かけにいかがですか？\n\n" +
    "着物をもっともっと身近に感じてほしいと思います😌\n\n" +
    "皆さんはどんな時に着てみたいと思われますか？";

  it("？があっても投稿文として扱う", () => {
    expect(isPastedContent(post)).toBe(true);
    expect(classifyRequestKind(post)).toBe("pasted");
  });

  it("ご要望としては受け取らない（「夜の更新で反映します」と返さない）", () => {
    expect(isFeatureRequest(post)).toBe(false);
  });

  it("はっきりしたご要望は、これまでどおり要望として受け取る", () => {
    expect(isFeatureRequest("そのままコピペできれば、修正しやすいです")).toBe(true);
    expect(isFeatureRequest("岡山市北区京橋町の言い方はやめて欲しい")).toBe(true);
  });

  it("飾りつきの長文でも、困りごとの言葉があればご質問として扱う", () => {
    const q =
      "連携できません😢\n" +
      "Threadsのボタンを押しても戻ってこないんです。\n" +
      "どうすればいいでしょうか？\n" +
      "昨日から何回も試しています。";
    expect(isPastedContent(q)).toBe(false);
  });
});

/**
 * 2026-09-08 ご質問 #22。
 * 「今日の投稿をもう一度みたい」が受け皿の言葉に当たらず自動応答へ回り、
 * 「メニューから『今日の投稿』などをお選びください」とあいまいに答えるだけだった。
 */
describe("今日の投稿を見たいというご依頼（#22）", () => {
  it("実際に届いた言い方でその場に出す", () => {
    expect(wantsTodayPosts("今日の投稿をもう一度みたい")).toBe(true);
    expect(wantsTodayPosts("今日の投稿")).toBe(true);
    expect(wantsTodayPosts("投稿を確認したい")).toBe(true);
    expect(wantsTodayPosts("今日配信予定のもの見せて")).toBe(false); // 「投稿」の語が無いのでAIに任せる
    expect(wantsTodayPosts("承認した投稿をもう一度見る")).toBe(true);
  });

  it("投稿文の貼り付けは巻き込まない", () => {
    const pasted =
      "肩こり、揉みほぐしだけだと結局戻るみたいです。\n" +
      "気持ちいいだけだと根本原因に届かないことが多いんです😅\n" +
      "あなたはどんな時に「また戻った」と感じますか？";
    expect(wantsTodayPosts(pasted)).toBe(false);
  });
});

/**
 * 2026-09-06 ご質問 #10（呉服店様）。
 * 「〇〇の言い方はやめて欲しい」に、AIが「設定メニューから登録できます」と
 * 説明するだけで、お客様がもう一度メニューをたどる必要があった。
 */
describe("使ってほしくない言葉のご要望（#10）", () => {
  it("実際に届いた言い方でNGワードの入力までお通しする", () => {
    expect(wantsNgWord("岡山市北区京橋町の言い方はやめて欲しい")).toBe(true);
    expect(wantsNgWord("化繊の話もやめて欲しい")).toBe(true);
    expect(wantsNgWord("この表現は使わないでください")).toBe(true);
  });

  it("投稿そのものを止めたいご依頼とは取り違えない", () => {
    expect(wantsNgWord("自動投稿をやめてほしい")).toBe(false);
    expect(wantsNgWord("メールの通知をやめてほしい")).toBe(false);
  });
});

/**
 * 2026-09-06 ご質問 #13。
 * 届いたご案内をまるごと引用し、その上に「このやり方がよくわかりません」と
 * 一言だけ書いて送られたのに、本文が長いため投稿文の貼り付けと判定され、
 * 「文章をお送りいただき、ありがとうございます」と返っていた。
 */
describe("引用の上に一言だけ書かれたお尋ね（#13）", () => {
  const asked =
    "このやり方がよくわかりません\n\n\n" +
    "【Meta AI呼びかけ投稿の、やり直しのお願い】\n" +
    "今朝の自動投稿「@meta.ai …」は、Threadsの仕様で自動投稿（API）からだと@meta.aiが" +
    "メンションにならず、Meta AIの返事が付きませんでした。申し訳ありません。\n" +
    "お手数ですが、下の手順で1回だけ投稿してください。今朝の投稿は消さなくて大丈夫です。\n\n" +
    "■ 投稿するアカウント\n@yokunaru4976seitai\n\n" +
    "■ 投稿する文章\n@meta.ai 滑川市上小泉周辺の人に、うちのお店を届けて";

  it("投稿文の貼り付けにしない（ご質問として自動応答へ回す）", () => {
    expect(isPastedContent(asked)).toBe(false);
    expect(classifyRequestKind(asked)).toBe(null);
  });

  it("一言が無い引用は、これまでどおり貼り付け扱い", () => {
    const pasted =
      "医学博士・整形外科医ご推薦の整体技術！！🔥 富山県唯一‼️\n\n＼世界レベルの整体技術／\n\n" +
      "【世界の小波津式🥇】(神経の整体)\n・最上級の認定院セミナー！！\n\n「もう無理…」\n\n" +
      "そんなあなたへ。\n\n🌿 よくなる整体院\n富山県滑川市｜約30年｜延べ3万人以上";
    expect(isPastedContent(pasted)).toBe(true);
  });
});

/**
 * 「投稿を止めてください」は、解約ではなく自動投稿のお休みのご相談。
 * 2026-09-12 夜間整備のLINE全ボタン確認で、「停止」という言葉だけを見て
 * 解約の案内に落ちていたのを直した分。
 */
describe("投稿をお休みしたいご相談（2026-09-12）", () => {
  it.each([
    "投稿を止めてください",
    "しばらく投稿を停止したいです",
    "自動投稿をやめてほしい",
    "配信を少しお休みしたい",
    "投稿をストップしてください",
  ])("お休みのご相談として扱う: %s", (t) => {
    expect(wantsPausePosting(t)).toBe(true);
  });

  it.each([
    "解約したい",
    "退会したいのですが、投稿も止めてください",
    "料金プランを変更したい",
    "投稿を作ってください",
    "今日の投稿を見たい",
  ])("お休みのご相談にしない: %s", (t) => {
    expect(wantsPausePosting(t)).toBe(false);
  });

  it("長い投稿文の貼り付けは巻き込まない", () => {
    const pasted =
      "肩の痛みで動かせない方へ。無理に動かすのは止めてください。\n" +
      "まずは炎症を抑えることが大切です。当院では丁寧にお話を伺います。\n" +
      "ご相談はプロフィールのリンクからどうぞ。";
    expect(wantsPausePosting(pasted)).toBe(false);
  });
});

/**
 * 2026-09-13 夜間整備。香取様へ「出してほしい話題はそのまま送ってください」とお伝えしているのに、
 * 「明日は臨時休診です」のような短い言い切りは、ご質問にもご依頼にも当たらず
 * 「ご用件を下から選んでください」という、何も受け取っていない返事に落ちていた。
 */
describe("お店のお知らせを受け取る（2026-09-13）", () => {
  it.each([
    "明日は臨時休診です",
    "本日は都合により休診いたします",
    "来週の木曜はお休みします",
    "年末年始は12/30から休業です",
    "10/5に体験会をします",
    "今月はキャンペーンをします",
    "来月から営業時間が変わります",
  ])("お知らせとして受け取る: %s", (t) => {
    expect(looksLikeAnnouncement(t)).toBe(true);
  });

  it.each([
    // ご依頼は既存の受け皿（classifyRequestKind）に任せる
    "来週の木曜はお休みなので、そのことを投稿してほしいです",
    "休診日の投稿を作ってください",
    // ご質問は自動応答に任せる
    "休診日は投稿されますか？",
    // 関係のない文
    "ありがとうございます",
    "投稿を止めてください",
    "料金はいくらですか",
  ])("お知らせにしない: %s", (t) => {
    expect(looksLikeAnnouncement(t)).toBe(false);
  });

  it("長い投稿文の貼り付けは巻き込まない（120字を超えるもの）", () => {
    const pasted =
      "秋のお休みのお知らせです。今週は木曜がお休みになります。".repeat(6);
    expect(looksLikeAnnouncement(pasted)).toBe(false);
  });
});

describe("お礼・あいさつだけの一言（2026-09-14）", () => {
  it("お礼・あいさつは、短くお返しする側に回す", () => {
    for (const t of ["ありがとうございます", "ありがとうございました", "ありがとう！", "了解です", "承知しました",
                     "わかりました", "おはようございます", "こんばんは", "お疲れ様です", "よろしくお願いします"]) {
      expect(isThanksOrGreeting(t)).toBe(true);
    }
  });
  it("お礼のあとにご用件が続くものは拾わない（ご用件が埋もれる）", () => {
    expect(isThanksOrGreeting("ありがとうございます。ところで投稿はいつ届きますか？")).toBe(false);
    expect(isThanksOrGreeting("ありがとうございます、明日は臨時休診です")).toBe(false);
  });
  it("ご質問・お知らせは拾わない", () => {
    expect(isThanksOrGreeting("プロプランは1日何回ですか")).toBe(false);
    expect(isThanksOrGreeting("明日は休診です")).toBe(false);
  });
});

describe("ご自身のお店を紹介する文章（2026-09-15 ご質問 #34）", () => {
  // 氷見様のご登録内容（本番の projects より）
  const HIMI = { area: "富山県滑川市上小泉1818-1", storeName: "よくなる整体院｜ 富山 自律神経・慢性腰痛専門" };

  it("ご登録の地域・店名から目印を取り出す", () => {
    expect(ownPlaceMarkers(HIMI)).toEqual(expect.arrayContaining(["富山県", "滑川市", "よくなる整体院"]));
    // 2文字の目印は、ふつうの文にも当たるので返さない
    expect(ownPlaceMarkers({ area: "岡山県" })).toEqual(["岡山県"]);
    expect(ownPlaceMarkers({})).toEqual([]);
  });

  it("実際に届いた文章を、ご質問ではなく投稿の材料として扱う", () => {
    const t = "滑川市では、お子様から90代まで触れるだけの小波津式でケアしています😊\n\n施術で不安なことはありますか？";
    // 飾り・行数・長さで見る従来の判定では拾えない（2行・約52字）
    expect(isPastedContent(t)).toBe(false);
    expect(looksLikeOwnPostMaterial(t, HIMI)).toBe(true);
  });

  it("アプリのことをお尋ねの文章は、これまでどおりご質問として扱う", () => {
    for (const t of [
      "滑川市の投稿が今日は届いていません",
      "よくなる整体院のアカウントを連携したいのですが、やり方を教えてください",
      "滑川市という地域名を設定から消せますか？",
    ]) expect(looksLikeOwnPostMaterial(t, HIMI)).toBe(false);
  });

  it("ご登録の地域・店名が入っていない文章は拾わない", () => {
    expect(looksLikeOwnPostMaterial("今日はいい天気ですね。何か作ってもらえますか？", HIMI)).toBe(false);
    expect(looksLikeOwnPostMaterial("滑川市でケアしています", {})).toBe(false);
  });

  it("引用の上に一言だけ書かれたお尋ねは、これまでどおりご質問として扱う", () => {
    const t = "このやり方がよくわかりません\n滑川市では、お子様から90代まで触れるだけの小波津式でケアしています";
    expect(looksLikeOwnPostMaterial(t, HIMI)).toBe(false);
  });

  it("短い一言は拾わない（ご用件が埋もれる）", () => {
    expect(looksLikeOwnPostMaterial("滑川市です", HIMI)).toBe(false);
  });
});

/**
 * 2026-09-18 夜間整備の通し確認で実測。
 * 知識には答えが載っているのに、疑問の形でも12字以上でもない短いご要望が
 * 「ご用件を下から選んでください」という、何も受け取っていない返事に落ちていた。
 */
describe("短いご要望を受け皿に落とさない（2026-09-18）", () => {
  it.each([
    "投稿の時間を変えたい",
    "スタッフにも触らせたい",
    "もっと関西弁にしたい",
    "投稿を減らしたい",
    "別のアカウントにつなぎ替えたい",
    "領収書がほしい",
    "文章を短くしたいです",
  ])("短いご要望として受け取る: %s", (t) => {
    expect(isShortWish(t)).toBe(true);
  });

  it.each([
    "明日は臨時休診です",           // お知らせ（looksLikeAnnouncement が拾う）
    "ありがとうございます",         // お礼
    "ログインできません",           // 困りごと（looksLikeQuestion が拾う）
    "投稿はいつ届きますか？",       // ご質問
  ])("ご要望ではないものは拾わない: %s", (t) => {
    expect(isShortWish(t)).toBe(false);
  });

  it("長い文は拾わない（12字以上は looksLikeQuestion が先に自動応答へ回す）", () => {
    expect(isShortWish("あ".repeat(41) + "したい")).toBe(false);
  });
});

/**
 * ボタンには「担当者に聞く」があるのに、同じことを文章で打つと何も起きなかった
 * （2026-09-18 夜間整備の通し確認で実測）。
 */
describe("人にお願いしたいご意思（2026-09-18）", () => {
  it.each([
    "担当者に聞きたい",
    "担当の方にお願いします",
    "人と話したい",
    "人に聞きたい",
    "電話で相談したい",
    "問い合わせたい",
  ])("担当者へお通しする: %s", (t) => {
    expect(wantsHuman(t)).toBe(true);
  });

  it.each([
    "投稿の時間を変えたい",
    "ありがとうございます",
    "固定投稿を作りたい",
  ])("関係のない文では担当者送りにしない: %s", (t) => {
    expect(wantsHuman(t)).toBe(false);
  });
});

/**
 * 材料をお送りいただいても、自動応答が「はじめの設定からご自身でご登録ください」と
 * 案内して終わり、aiConfident=1 のため担当者にも届かず、材料はどこにも残らなかった
 * （2026-09-18 夜間整備でローカルQAにて実測）。
 * 自動応答より先に受け止めるため、条件を厳しくした判定を足した。
 */
describe("投稿の材料でしかない文章（2026-09-19）", () => {
  it("本番のご質問 #3（症例3件）は材料として受け止める", () => {
    const t =
      "小学生が足を捻って我慢していたが、当院に来てエコー観察したら骨折があった（整形外科で確定診断）、当院でリハビリを行い問題なくサッカーに復帰\n\n" +
      "50代男性が急な腰痛で来院、来院時は歩くのがやっとだったが帰る時は歩けるようになり帰宅\n\n" +
      "大会前に腰を痛めた中学生が無事に最後の大会に出場出来た";
    expect(looksLikeMaterialOnly(t)).toBe(true);
  });

  it("採用のお店からのエピソードも材料として受け止める（プレステージ様へお願いした形）", () => {
    const t =
      "未経験で入社した20代のスタッフですが、3年で店長になりました。" +
      "はじめは緊張していたお客様が、いまは指名で通ってくださっています。";
    expect(looksLikeMaterialOnly(t)).toBe(true);
  });

  it.each([
    // 困りごと・操作のお尋ねは、これまでどおり自動応答へ
    "お客様に投稿が届いていないようなのですが、どうすればいいですか",
    "施術の実績を登録したいのですが、やり方を教えてください",
    "来院されたお客様の声を投稿に入れる方法がわかりません",
    // アプリのことに触れているものも自動応答へ
    "お客様のエピソードを、はじめの設定に入れておきました",
    // お尋ねの形のものも自動応答へ
    "患者様の声をそのまま投稿に使っていただけますか？",
  ])("ご質問を横取りしない: %s", (t) => {
    expect(looksLikeMaterialOnly(t)).toBe(false);
  });

  it("★プレステージ様へお願いした形（番号つきの材料の並び）も受け止める", () => {
    // 治療院の言葉が1つも入らないため、以前は自動応答が自信をもって取り違えていた
    // （「理想の投稿を貼る から登録してください」＝文体のお手本のご案内。中身は投稿に使われない）
    const t =
      "1.「見学のとき、先輩が優しくて安心した」「未経験でも本当に教えてもらえた」\n" +
      "2. 他業種から転職して1年で店長になりました。\n" +
      "3. 技術は入ってから覚えればいい。人柄がいちばん大事だと思っています。";
    expect(looksLikeMaterialOnly(t)).toBe(true);
  });

  it("かぎかっこの引用が並ぶものも材料として受け止める", () => {
    const t = "お客様から「ここに来ると背筋が伸びる」「話を聞いてもらえるのが嬉しい」と言っていただきました。";
    expect(looksLikeMaterialOnly(t)).toBe(true);
  });

  it("番号つきでも、アプリのお尋ねなら横取りしない", () => {
    const t = "1. 投稿が届きません\n2. 連携のやり方がわかりません\n3. プランを変えたいです";
    expect(looksLikeMaterialOnly(t)).toBe(false);
  });

  it("短い一言は材料として扱わない", () => {
    expect(looksLikeMaterialOnly("お客様が喜んでいました")).toBe(false);
  });
});
