import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { checkCustomerVoice, customerVoiceRetryHint } from "../shared/customerVoiceGuard";

describe("お客様の口で書いた体験談を止める（2026-10-22 acc37 #4413）", () => {
  it("#4413 の下書きそのまま → 止める", () => {
    const draft = "八潮のどい接骨院で受けた運動指導が、単なる「メニュー提供」をはるかに超えていると深く実感しています。😊\n\n" +
      "ただ決められた運動をこなすだけでなく、私の身体の動かし方の癖や、どこに負担がかかりやすいのかを丁寧に見て、具体的に教えてくれるんです。" +
      "例えば、「この動きをする時は、膝が少し内側に入りやすいので、ここを意識してみてください」といった、一人ひとりに合わせたアドバイスがもらえます。\n\n" +
      "専門家による身体の動態理解が非常に深いからこそ、その人に最適なアプローチで指導してもらえるのが素晴らしい点です。\n\n" +
      "その結果、日常生活での身体の快適性が格段に向上しました。";
    const r = checkCustomerVoice(draft);
    expect(r.ok).toBe(false);
    expect(r.hits).toEqual(expect.arrayContaining(["お店で受けた", "してくれる", "してもらえる", "私の体", "実感している"]));
    expect(customerVoiceRetryHint(r.hits)).toContain("お店の側（店主・院長・スタッフ）の口で");
  });

  it("店主の口でよく出る言い回しは止めない", () => {
    for (const t of [
      "他院で受けた施術で良くならなかった方へ。八潮のどい接骨院では、体の動かし方の癖から一緒に見ていきます。",
      "当院に通っている方から「階段が楽になりました」と教えていただきました。知ってもらえたら嬉しいです。",
      "私の体も、40代になってから朝のこわばりを感じるようになりました。だからこそ、皆さんの気持ちが分かります。",
      "お客様から「丁寧に説明してくれるから安心」と言っていただけるのが励みです。",
    ]) expect(checkCustomerVoice(t).ok).toBe(true);
  });

  it("自動投稿の作り直しの流れに入っていて、最後の作り直しでは公開しない", () => {
    const src = fs.readFileSync(path.join(__dirname, "autoPostScheduler.ts"), "utf8");
    const i = src.indexOf("checkCustomerVoice(naturalMain)");
    expect(i).toBeGreaterThan(0);
    const block = src.slice(i, i + 700);
    expect(block).toContain("gaveUp: true");
    expect(block).toContain("return false");
    // 作り話チェック（文を外して公開）より前で止める
    expect(i).toBeLessThan(src.indexOf("const found = await checkFabrication(naturalMain, facts)"));
  });
});
