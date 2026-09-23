import { describe, it, expect } from "vitest";
import { pickAngle, STUDY_EXPERIMENT_ANGLES, isStudyExperimentUser, getAngle } from "../shared/postAngles";
import { checkAngle } from "../shared/angleGuard";

/**
 * 勉強会の型を試す「試験用の切り口」（2026-09-24）。
 * 三上様のアカウントだけで使い、他のお客様には出さない。
 */
const EXP = new Set([...STUDY_EXPERIMENT_ANGLES.map((a) => a.id), "failure_story", "opinion"]);

function share(studyExperiment: boolean, n = 4000): number {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const a = pickAngle({}, rand, undefined, Date.parse("2026-10-01T00:00:00+09:00"), "store", { studyExperiment });
    if (EXP.has(a.id)) hit++;
  }
  return hit / n;
}

describe("試験用の切り口", () => {
  it("三上様（userId 78）だけが対象", () => {
    expect(isStudyExperimentUser(78)).toBe(true);
    expect(isStudyExperimentUser(3521)).toBe(false);
    expect(isStudyExperimentUser(null)).toBe(false);
  });

  it("他のお客様には、試験用の切り口が1本も出ない", () => {
    expect(share(false)).toBe(0);
  });

  it("三上様のアカウントでは、試験用の切り口が約半分出る", () => {
    const s = share(true);
    expect(s).toBeGreaterThan(0.42);
    expect(s).toBeLessThan(0.58);
  });

  it("どの試験用の切り口も引ける（逆引きに入っている）", () => {
    for (const a of STUDY_EXPERIMENT_ANGLES) expect(getAngle(a.id)?.label).toBe(a.label);
  });

  it("健康系のお店向けに、医療的な脅しを禁じる一文が入っている", () => {
    for (const id of ["future_worry", "warning"]) {
      expect(getAngle(id)?.hint).toMatch(/健康系のお店では/);
    }
  });

  it("型が守られていなければ作り直しになる", () => {
    expect(checkAngle("warning", "猫背のままスマホを見る人は、気をつけて。").ok).toBe(true);
    expect(checkAngle("warning", "姿勢を整えると楽になります。").ok).toBe(false);
    expect(checkAngle("contrast", "早く楽になる人は、朝に少し動く。長引く人は、休みの日に寝だめする。").ok).toBe(true);
    expect(checkAngle("dialogue", "「肩こりって体質ですか？」「まず枕を見せてください」「え、枕？」").ok).toBe(true);
    expect(checkAngle("dialogue", "肩こりの相談が多いです。").ok).toBe(false);
  });
});

describe("試験用の切り口：健康系のお店の守り（2026-09-24 見本で危ない表現が出たため）", () => {
  it("見本で出た危ない言い切りは、作り直しになる", () => {
    const bad = [
      "肩こりに湿布、実は逆効果かも。私も昔はそう思ってました",
      "その場しのぎの揉みほぐしでは意味ないです。気をつけて",
      "根本から見ないと繰り返します。分かる人には分かる",
      "「肩こりって体質？」「国家資格者が見ると、体は変わります」",
    ];
    for (const [id, t] of [["odd_feeling", bad[0]], ["warning", bad[1]], ["insider", bad[2]], ["dialogue", bad[3]]] as const) {
      const r = checkAngle(id, t);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/効果・結果の言い切り/);
    }
  });

  it("健康系のお店では「失敗談」「持論」を試験に入れない", () => {
    let seed = 11;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      seen.add(pickAngle({}, rand, undefined, Date.parse("2026-10-01T00:00:00+09:00"), "store", { studyExperiment: true, excludeOutcomeAngles: true }).id);
    }
    expect(seen.has("failure_story")).toBe(false);
    expect(seen.has("opinion")).toBe(false);
    expect(seen.has("future_worry")).toBe(true);
  });

  it("健康系でなければ「失敗談」「持論」も試す", () => {
    let seed = 13;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      seen.add(pickAngle({}, rand, undefined, Date.parse("2026-10-01T00:00:00+09:00"), "store", { studyExperiment: true }).id);
    }
    expect(seen.has("failure_story")).toBe(true);
    expect(seen.has("opinion")).toBe(true);
  });
});
