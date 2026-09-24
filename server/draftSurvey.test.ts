/**
 * 案の◯✕アンケート（2026-09-24 三上様指示「8案を1回送って、◯か✕かで選んでもらう」）。
 * DBを使う部分（◯でお手本に足す・✕に押し直すと外す・他人の案は押せない）は
 * 2026-09-24 にローカルQAで handlePostback を直接叩いて確認ずみ（docs/night-todo.md）。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildSurveyMessages } from "./draftSurvey";

const items = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, angle: "qa", label: `案の名前${i}`, content: "本文".repeat(10) }));

describe("お送りするLINE", () => {
  const msgs: any[] = buildSurveyMessages(items, "前置き") as any[];
  it("前置き1通＋8枚のカルーセル1通", () => {
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ type: "text", text: "前置き" });
    expect(msgs[1].contents.type).toBe("carousel");
    expect(msgs[1].contents.contents).toHaveLength(8);
  });
  it("各カードは◯と✕の2つだけ。どちらも公開や承認には繋がらない sv= のボタン", () => {
    for (const [i, b] of msgs[1].contents.contents.entries()) {
      const datas = b.footer.contents.map((x: any) => x.action.data);
      expect(datas).toEqual([`sv=1&id=${100 + i}&v=good`, `sv=1&id=${100 + i}&v=bad`]);
      for (const d of datas) expect(d).not.toMatch(/a=ok|a=okall|a=skip/);
    }
  });
});

describe("9/25 にお送りする案", () => {
  for (const f of ["2026-09-25_prestige_survey.json", "2026-09-25_katori_survey.json"]) {
    const { intro, drafts } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../scripts/ops/announcements", f), "utf8"));
    it(`${f}：8案・切り口がすべて違う・絵文字なし・「投稿はされません」と伝える`, () => {
      expect(drafts).toHaveLength(8);
      expect(new Set(drafts.map((d: any) => d.angle)).size).toBe(8);
      for (const d of drafts) expect(d.content).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(intro).toContain("投稿はされません");
    });
  }
  it("香取様の案に、見送られた型（整形外科で11年・揉んでも）を入れていない", () => {
    const { drafts } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../scripts/ops/announcements/2026-09-25_katori_survey.json"), "utf8"));
    for (const d of drafts) expect(d.content).not.toMatch(/11年|揉んで|マッサージするだけ/);
  });
});
