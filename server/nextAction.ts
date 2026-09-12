/**
 * 「次にやること」のご案内。
 *
 * 設定が途中で止まっていると、ご本人は気づかないまま
 * 「投稿が来ない」「別のお店の内容が投稿される」といった状態になる。
 * （実際に、2つのアカウントを連携したのにお店の情報が1件しかなく、
 *   ダイエット用のアカウントに整骨院の内容が入る状態が起きていた）
 *
 * そこで、状態を見て「次にやること」を1つだけ選び、公式LINEでお伝えする。
 *
 * 方針:
 *  - 一度に1つだけ。あれもこれもと並べない。
 *  - 押せば進むボタンを必ず添える（読ませて終わりにしない）。
 *  - 同じ案内を毎日は送らない。
 *  - 「もう不要」と言われたら止められる。
 */
import * as db from "./db";

export type NextAction = {
  /** 案内の種類。同じものを繰り返し送らないための目印（アカウント別の工程は "acct_pinned:12" のようにIDを含む） */
  key: string;
  /** LINEにお送りする本文 */
  text: string;
  /** そのまま押せるボタン（postbackのデータ） */
  buttons: { label: string; data: string }[];
  /** どのThreadsアカウントの工程か（複数アカウント運用のときだけ。社内報告で「@xxx の固定投稿が未作成」と出すため） */
  accountName?: string;
};

/**
 * 設定の工程1つ分。
 * ★アプリの画面・LINE・メールが、すべてこの1つの判定を見る。
 *   以前はアプリのチェックリストとLINEの案内が別々に判定していて、
 *   「LINEでは“紐づけが要ります”と言っているのに、アプリでは準備完了」
 *   という食い違いが起きていた。
 */
export type SetupStep = {
  id: string;
  label: string;
  done: boolean;
  /** 未完了のときにお客様がやること（アプリの遷移先） */
  path?: string;
  actionLabel?: string;
  /** 未完了だと実害が出る工程（画面で強調する） */
  important?: boolean;
  /** どのThreadsアカウントの工程か（複数アカウント運用のときだけ） */
  accountId?: number;
  accountName?: string;
};

/** 表示用のアカウント名（@付き） */
function acctName(a: any): string {
  return `@${a?.threadsUsername || a?.threadsUserId || "account"}`;
}

/**
 * 複数アカウント運用のときの、アカウント別の工程。
 * ★「お店の情報の紐づけ → 固定投稿を作る → 公開する → ピン留めする」はアカウントごとに必要。
 *   ユーザー単位で判定すると、1つ目のアカウントで済ませただけで2つ目も完了に見えてしまい、
 *   もう片方のプロフィールに入口が無いまま放置される（2026-09-03 三上様指摘）。
 */
async function accountSteps(userId: number, accounts: any[], usable: any[]): Promise<SetupStep[]> {
  const out: SetupStep[] = [];
  for (const a of accounts) {
    const name = acctName(a);
    const id = Number(a.id);
    const project = a.defaultProjectId ? usable.find((p: any) => p.id === a.defaultProjectId) : null;
    out.push({
      id: `acct_project:${id}`,
      label: `${name}：使うお店の情報を決める`,
      done: Boolean(project),
      path: "/threads-connect",
      actionLabel: "決める",
      important: true,
      accountId: id, accountName: name,
    });
    let prog = { created: false, posted: false };
    try { prog = await db.getAccountPinnedProgress(userId, id, project?.id ?? null); } catch { /* 取れなければ未作成扱い */ }
    const pinPath = project ? `/ai-generate?project=${project.id}&postType=pinned` : "/ai-generate?pinned=1";
    out.push({
      id: `acct_pinned:${id}`,
      label: `${name}：固定投稿をAIで作成（集客の入口）`,
      done: prog.created,
      path: pinPath,
      actionLabel: "作成する",
      accountId: id, accountName: name,
    });
    if (prog.created) {
      out.push({
        id: `acct_posted:${id}`,
        label: `${name}：固定投稿をThreadsに公開する`,
        done: prog.posted,
        path: "/posts",
        actionLabel: "公開する",
        important: true,
        accountId: id, accountName: name,
      });
    }
    if (prog.created && prog.posted) {
      let confirmed = false;
      try { confirmed = await db.isPinnedPostConfirmedForAccount(id); } catch { confirmed = false; }
      out.push({
        id: `acct_pin:${id}`,
        label: `${name}：固定投稿をThreadsでピン留めする`,
        done: confirmed,
        path: pinPath,
        actionLabel: "やり方を見る",
        important: true,
        accountId: id, accountName: name,
      });
    }
  }
  return out;
}

/** ご案内先URL（公式LINE・予約・HPのどれか）が登録されているか */
function hasAnyLink(p: any): boolean {
  if (!p) return false;
  if (String(p.ctaLink || "").trim()) return true;
  try {
    const arr = JSON.parse(String(p.links || "[]"));
    return Array.isArray(arr) && arr.some((l: any) => l && String(l.url || "").trim());
  } catch { return false; }
}

/** お店の情報として「使える」状態か（自動投稿の対象条件と同じ） */
function isUsableProject(p: any): boolean {
  return (
    !String(p.id).startsWith("demo_") &&
    Boolean(p.businessType && p.area && p.target && p.mainProblem && p.strength)
  );
}

/**
 * 自動投稿に必要なのに、まだ空いている項目（2026-09-11）。
 *
 * ★「はじめの設定」は2026-09-10から「まず5問」（URL＋業種・地域・店名・お悩み）になったが、
 *   自動投稿の対象条件（autoPostScheduler の eligibleProjects）は今も
 *   お客さん像（target）と強み（strength）まで求めている。
 *   そのため5問を終えた方が「まだ『お店の情報』が登録されていない」と案内され、
 *   「はじめの設定」をやり直す案内が出ていた（9/11実測：大木様・juria様の2名。
 *   どちらも強みだけが空で、投稿は1本も作られていない）。
 *   何が足りないかを名指しし、その1問をその場で聞くボタンを出す。
 */
const REQUIRED_LABELS: Array<{ key: string; label: string; questionId: string }> = [
  { key: "businessType", label: "業種", questionId: "businessTypeRaw" },
  { key: "area", label: "地域", questionId: "areaRaw" },
  { key: "mainProblem", label: "お客さんのお悩み", questionId: "mainProblemRaw" },
  { key: "target", label: "お客さん像", questionId: "targetRaw" },
  { key: "strength", label: "強み", questionId: "strengthRaw" },
];

export function missingRequired(p: any): Array<{ label: string; questionId: string }> {
  return REQUIRED_LABELS.filter(({ key }) => !String(p?.[key] ?? "").trim())
    .map(({ label, questionId }) => ({ label, questionId }));
}

/** 5問は終わっているのに、自動投稿の条件だけが足りていないお店の情報 */
export function isAlmostUsableProject(p: any): boolean {
  if (!p || String(p.id).startsWith("demo_")) return false;
  if (isUsableProject(p)) return false;
  return Boolean(p.businessType && p.area && p.mainProblem);
}

/**
 * 設定の工程を、順番どおりに全部返す。
 * アプリのチェックリストはこれをそのまま表示し、
 * LINE・メールの案内は「最初の未完了」を使う。
 */
export async function getSetupSteps(userId: number): Promise<SetupStep[]> {
  const [accounts, projects] = await Promise.all([
    db.getThreadsAccountsByUserId(userId).catch(() => [] as any[]),
    db.getUserProjects(userId).catch(() => [] as any[]),
  ]);
  const usable = (projects || []).filter(isUsableProject);
  const active = (accounts || []).filter((a: any) => a.isActive !== false);
  const unlinked = active.filter((a: any) => !a.defaultProjectId);

  const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
  const sub = await db.getSubscriptionByUserId(userId).catch(() => null);
  const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
  const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);

  const settings: any = await db.getAutoPostSettings(userId).catch(() => null);
  let hasPinned = false;
  try { hasPinned = await db.hasGeneratedPinnedPost(userId); } catch { hasPinned = false; }

  // ★「まず5問」を終えた方は、お店の情報が「まだ何も無い」のではなく「あと2問」の状態。
  //   2026-09-13 の通し確認で、5問を終えた直後に「設定が終わりました」と申し上げた同じ画面で
  //   「□ お店の情報を登録」が未完のまま出ており、やり直しが要るように読めていた。
  //   残り何問かを見出しに出して、言っていることを揃える。
  const almost = usable.length === 0 && (projects || []).some(isAlmostUsableProject);
  const almostProject = almost ? (projects || []).find(isAlmostUsableProject) : null;
  const almostLeft = almostProject ? missingRequired(almostProject).length : 0;

  const steps: SetupStep[] = [
    { id: "account", label: "アカウント作成", done: true },
    {
      id: "no_project",
      label: almostLeft > 0 ? `お店の情報を登録（あと${almostLeft}問）` : "お店の情報を登録",
      done: usable.length > 0,
      path: "/ai-counseling",
      actionLabel: almostLeft > 0 ? `あと${almostLeft}問だけ答える` : "登録する",
    },
    {
      id: "no_account",
      label: "Threadsアカウントを連携",
      done: active.length > 0,
      path: "/threads-connect",
      actionLabel: "連携する",
    },
  ];
  // ★文体のお手本（本人の理想の投稿）。連携時に本人の過去投稿を自動で取り込むが、
  //   投稿の無い新しいアカウントは空のままで、AIが寄せる先が無い（2026-09-08 三上様指示）。
  if (active.length > 0 && usable.length > 0) {
    steps.push({
      id: "no_style_samples",
      label: "理想の投稿（お手本）を登録",
      done: usable.some((p: any) => String(p.styleSamples || "").trim().length > 0),
      path: "/ai-generate",
      actionLabel: "登録する",
      important: true,
    });
  }
  // ★ご案内先URL（毎日の投稿の誘導と固定投稿のコメント欄に使う）。2026-09-06 三上様指示で工程に追加
  if (usable.length > 0) {
    steps.push({
      id: "no_link",
      label: "ご案内先URLを登録（公式LINE・予約・HPのどれか）",
      done: usable.some(hasAnyLink),
      path: "/ai-counseling",
      actionLabel: "登録する",
    });
  }
  // ★Threadsの自己紹介が空だと、投稿を見た人がプロフィールに来ても「どこの何屋か」が分からない
  if (active.length > 0) {
    steps.push({
      id: "profile_bio",
      label: "Threadsのプロフィール（自己紹介）を整える",
      done: active.every((a: any) => String(a.biography || "").trim().length >= 40),
      path: "/threads-connect",
      actionLabel: "提案を見る",
    });
  }

  // ★複数アカウントを運用しているときは、紐づけ・固定投稿・公開・ピン留めを
  //   アカウントごとに出す（どのアカウントの工程かが必ず分かるようにする）。
  if (active.length > 1) {
    void unlinked;
    steps.push(...(await accountSteps(userId, active, usable)));
    if (maxPerDay > 0) {
      // 自動投稿のON/OFFもアカウント別（共通設定をアカウント側で上書きできる）
      const { effectiveAccountSettings } = await import("@shared/accountSettings");
      for (const a of active) {
        const eff = effectiveAccountSettings(settings, a as any);
        steps.push({
          id: `acct_auto:${Number(a.id)}`,
          label: `${acctName(a)}：自動投稿をONにする`,
          done: eff.autoPostEnabled,
          path: "/settings",
          actionLabel: "ONにする",
          accountId: Number(a.id), accountName: acctName(a),
        });
      }
    }
    return steps;
  }

  // ★1アカウント運用：LINEで作った固定投稿（scheduledPosts.angle='pinned'）も数える。
  //   以前は アプリの生成履歴だけを見ていたため、LINEで作った方が「未作成」のままだった。
  if (!hasPinned && active[0]) {
    try {
      const prog = await db.getAccountPinnedProgress(userId, Number(active[0].id), (active[0] as any).defaultProjectId ?? null);
      hasPinned = prog.created;
    } catch { /* そのまま */ }
  }

  steps.push({
    id: "no_pinned",
    label: "固定投稿をAIで作成（集客の入口）",
    done: hasPinned,
    path: "/ai-generate?pinned=1",
    actionLabel: "作成する",
  });

  // ★「作った」と「Threadsに出した」は別。生成しただけでは、その投稿は
  //   まだThreads上に存在せず、ピン留めしようにも見つからない。
  //   （固定投稿を3件作ったが1件も公開していないお客様がいた）
  let postedCount = 0;
  try { postedCount = await db.countPostedPosts(userId); } catch { postedCount = 0; }
  if (hasPinned) {
    steps.push({
      id: "not_posted",
      label: "作った投稿をThreadsに公開する",
      done: postedCount > 0,
      path: "/ai-generate?pinned=1",
      actionLabel: "公開する",
      important: true,
    });
  }

  // ★公開したあと、Threadsのプロフィールに固定して、はじめて入口になる。
  //   ピン留めはThreadsのAPIでは操作も確認もできないため、ご本人の申告で完了とする。
  if (hasPinned && postedCount > 0) {
    let confirmed = false;
    try { confirmed = await db.isPinnedPostConfirmed(userId); } catch { confirmed = false; }
    if (!confirmed && active[0]) {
      try { confirmed = await db.isPinnedPostConfirmedForAccount(Number(active[0].id)); } catch { /* そのまま */ }
    }
    steps.push({
      id: "pin_not_confirmed",
      label: "作った固定投稿をThreadsでピン留めする",
      done: confirmed,
      path: "/ai-generate?pinned=1",
      actionLabel: "やり方を見る",
      important: true,
    });
  }

  if (maxPerDay > 0) {
    steps.push({
      id: "auto_off",
      label: "自動投稿をONにする",
      done: settings?.autoPostEnabled !== false,
      path: "/settings",
      actionLabel: "ONにする",
    });
  }

  return steps;
}

/**
 * いまの状態から「次にやること」を1つ返す。
 * すべて整っていれば null。
 */
export async function detectNextAction(userId: number): Promise<NextAction | null> {
  const [accounts, projects] = await Promise.all([
    db.getThreadsAccountsByUserId(userId).catch(() => [] as any[]),
    db.getUserProjects(userId).catch(() => [] as any[]),
  ]);
  const usable = (projects || []).filter(isUsableProject);

  const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
  const sub = await db.getSubscriptionByUserId(userId).catch(() => null);
  const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
  const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);

  // ① お店の情報が1件も無い。これが無いと投稿そのものが作れない。
  if (usable.length === 0) {
    // ★5問は終わっているのに、あと1〜2項目だけ足りていない方（2026-09-11）。
    //   「登録されていません」と言うと、終えた設定が無かったことになり、やり直させてしまう。
    //   足りない項目を名指しして、その1問をこの場で聞く。
    const almost = (projects || []).find(isAlmostUsableProject);
    if (almost) {
      const missing = missingRequired(almost);
      const names = missing.map((m) => m.label);
      return {
        key: "project_almost",
        text:
          "次にやることが1つあります。\n\n" +
          `お店の情報は「${names.join("」と「")}」だけ空いています。ここが埋まると、翌朝から投稿が届きます。\n` +
          `下のボタンから、${names.length === 1 ? "その1問" : `${names.length}問`}にお答えください（30秒ほどです）。`,
        buttons: [{
          label: names.length === 1 ? "あと1問だけ答える" : `あと${names.length}問だけ答える`,
          data: `c=more&p=${almost.id}&f=${missing[0].questionId}`,
        }],
      };
    }
    return {
      key: "no_project",
      text:
        "次にやることが1つあります。\n\n" +
        "まだ「お店の情報」が登録されていないため、投稿を作ることができません。\n" +
        "下の「はじめの設定」から、質問にお答えください。最初は5つだけです（URL1つと質問4つ・2分ほど）。",
      buttons: [{ label: "はじめの設定", data: "m=setup" }],
    };
  }

  // ② Threadsが未連携。投稿は作れても公開できない。
  if ((accounts || []).length === 0) {
    return {
      key: "no_account",
      text:
        "次にやることが1つあります。\n\n" +
        "まだThreadsのアカウントとつながっていないため、投稿を公開できません。\n" +
        "下の「アカウント連携」から、Threadsとつないでください。",
      buttons: [{ label: "アカウント連携", data: "m=connect" }],
    };
  }

  // ③' 複数アカウント運用：紐づけ・固定投稿・公開・ピン留めをアカウントごとに見て、
  //     最初に止まっているアカウントの工程を、アカウント名つきで案内する。
  const activeAccounts = (accounts || []).filter((a: any) => a.isActive !== false);
  if (activeAccounts.length > 1) {
    const perAccount = await accountSteps(userId, activeAccounts, usable);
    const first = perAccount.find((st) => !st.done);
    if (first) {
      const name = first.accountName ?? "";
      const id = first.accountId ?? 0;
      const kind = first.id.split(":")[0];
      const { pinGuideText } = await import("@shared/pinGuide");
      const byKind: Record<string, Omit<NextAction, "key" | "accountName">> = {
        acct_project: {
          text:
            "次にやることが1つあります。\n\n" +
            `${name} に、そのアカウント用の「お店の情報」がまだ決まっていません。\n` +
            "このままだと、別のアカウント向けに作った内容がそのまま投稿されてしまいます。\n\n" +
            "下のボタンを押すと、登録済みの情報を選ぶか、このアカウント用に新しく登録できます。",
          buttons: [{ label: `${name} の設定をする`, data: `c=acct&a=${id}` }],
        },
        acct_pinned: {
          text:
            "次にやることが1つあります。\n\n" +
            `${name} の「固定投稿」がまだ作られていません。\n` +
            "プロフィールに固定しておく投稿で、はじめて見に来た方が最初に読む集客の入口です。\n\n" +
            "下のボタンを押すと、このアカウント用に作って、そのまま公開できます。",
          buttons: [{ label: `${name} の固定投稿を作る`, data: `m=makepin&a=${id}` }],
        },
        acct_posted: {
          text:
            "次にやることが1つあります。\n\n" +
            `${name} の固定投稿は作れていますが、まだThreadsに公開されていません。\n\n` +
            "下の「今日の投稿」から、公開をお待ちしている投稿を確認して、その場で公開できます。",
          buttons: [
            { label: "今日の投稿", data: "m=posts" },
            { label: `${name} 用に作り直す`, data: `m=makepin&a=${id}` },
          ],
        },
        acct_pin: {
          text:
            "次にやることが1つあります。\n\n" +
            `${name} の固定投稿は公開できていますが、まだThreadsでピン留めされていないようです。\n\n` +
            pinGuideText({ withPublishSteps: false }) +
            `\n\n${name} でピン留めが終わったら、下の「ピン留めしました」を押してください。`,
          buttons: [{ label: `${name} ピン留めしました`, data: `n=pinned&a=${id}` }],
        },
      };
      const body = byKind[kind];
      if (body) return { key: first.id, accountName: name, ...body };
    }
    // アカウント別の自動投稿OFF
    if (maxPerDay > 0) {
      const settingsM: any = await db.getAutoPostSettings(userId).catch(() => null);
      const { effectiveAccountSettings } = await import("@shared/accountSettings");
      const off = activeAccounts.find((a: any) => !effectiveAccountSettings(settingsM, a).autoPostEnabled);
      if (off) {
        const name = acctName(off);
        return {
          key: `acct_auto:${Number(off.id)}`,
          accountName: name,
          text:
            "次にやることが1つあります。\n\n" +
            `${name} の毎日の自動投稿がOFFになっています。このままではこのアカウントの投稿が作られません。\n` +
            "下のボタンで、いますぐ始められます。",
          buttons: [{ label: `${name} の自動投稿を始める`, data: `s=auto&v=on&a=${Number(off.id)}` }],
        };
      }
      // 以降のユーザー単位の判定（⑧⑨）は複数運用では重複するので、ここで終える
      return null;
    }
  }

  // ③ お店の情報が紐づいていないアカウントがある。
  //    お店の情報が1件しかない状態で複数アカウントを連携すると、
  //    別ジャンルのアカウントに同じ内容が流れてしまう。
  const unlinked = (accounts || []).filter((a: any) => !a.defaultProjectId);
  if (unlinked.length > 0 && (accounts || []).length > usable.length) {
    const names = unlinked
      .map((a: any) => `@${a.threadsUsername || a.threadsUserId}`)
      .slice(0, 3)
      .join("・");
    return {
      key: "account_without_project",
      text:
        "次にやることが1つあります。\n\n" +
        `${names} に、そのアカウント用の「お店の情報」がまだ登録されていません。\n` +
        "このままだと、別のアカウント向けに作った内容がそのまま投稿されてしまいます。\n\n" +
        "下の「はじめの設定」から、このアカウントを選んで質問にお答えください。",
      buttons: [{ label: "はじめの設定", data: "m=setup" }],
    };
  }

  // ④ 複数アカウントを連携していて、どれにも紐づけが無い（お店の情報は足りている）。
  if (unlinked.length > 0 && (accounts || []).length > 1) {
    return {
      key: "account_unpinned",
      text:
        "次にやることが1つあります。\n\n" +
        "連携中のアカウントに、どのお店の情報を使うかが決まっていません。\n" +
        "下の「はじめの設定」からアカウントを選ぶと、そのアカウント専用の内容で投稿されるようになります。",
      buttons: [{ label: "はじめの設定", data: "m=setup" }],
    };
  }

  // ★順番の方針（2026-09-08 三上様指示）：まず自動投稿を動かす。固定投稿・ご案内先URL・
  //   プロフィール整えは「投稿が動いてから」に回し、プロプラン以上の方には運営がサポートする。
  // ③' プランでは自動投稿が使えるのに、OFFのまま。ここを最初に直す。
  const settings: any = await db.getAutoPostSettings(userId).catch(() => null);
  if (maxPerDay > 0 && settings && settings.autoPostEnabled === false) {
    return {
      key: "auto_off",
      text:
        "次にやることが1つあります。\n\n" +
        "毎日の自動投稿がOFFになっています。このままでは投稿が作られません。\n" +
        "下のボタンで、いますぐ始められます。",
      buttons: [{ label: "自動投稿を始める", data: "s=auto&v=on" }],
    };
  }
  // プロプラン以上（1日3件以上のプラン）は、後回しにした工程を運営が代わりに／一緒に進める
  const proSupport = maxPerDay >= 3;
  // ★お問い合わせは公式LINEで受ける。お電話では受けない（2026-09-09 三上様指示）。
  //   まずLINEに「お困りの画面のスクリーンショット」を送っていただき、文字で解決しなければZoom。
  //   Zoomはプロプラン以上・期間限定・初回30分のみ（2026-09-08 三上様指示）。
  const supportTail = (k: string) => proSupport
    ? "\n\nプロプランの方は、期間限定で運営が一緒に進めます。ご自身でやるのが大変なときは、下の「運営にお願いする」を押してください。\n\nお困りのときは、その画面のスクリーンショットをこのトークに送っていただければ、こちらで確認してお返しします。文字では進めにくいときは、Zoomで画面を一緒に見ながら進めることもできます（初回30分）。「Zoom希望」とお送りください。"
    : "\n\nお困りのときは、その画面のスクリーンショットをこのトークに送ってください。こちらで確認してお返しします。";
  const supportBtn = (k: string) => proSupport ? [{ label: "運営にお願いする", data: `m=support&k=${k}` }] : [];

  // ④0 文体のお手本が空。連携時に本人の過去投稿が取れなかった（投稿の無い新しいアカウント）ので、
  //    「こういう投稿を出したい」という例を貼ってもらう。これが無いと、どこの店でも出せる文になる。
  if (usable.length > 0 && activeAccounts.length > 0 && !usable.some((p: any) => String(p.styleSamples || "").trim())) {
    return {
      key: "no_style_samples",
      text:
        "【新機能のお知らせ】理想の投稿を登録できるようになりました\n\n" +
        "「こういう投稿を出したい」という例を1〜3本貼っていただくと、毎日の投稿の言葉づかい・長さ・改行の癖をそこに寄せて作る機能を追加しました。\n" +
        "ご自身の過去の投稿でも、いいなと思った他の方の投稿でも構いません（内容ではなく書き方を手本にします）。\n" +
        "Threadsに過去の投稿がある方は連携時に自動で取り込んでいるため、この案内は投稿がまだ少ない方にだけお送りしています。\n\n" +
        "下の「理想の投稿を貼る」を押してから、文章をそのまま送ってください（2分）。",
      buttons: [{ label: "理想の投稿を貼る", data: `c=ideal&p=${usable[0].id}` }],
    };
  }

  // ④' ご案内先URLが未登録。毎日の投稿の誘導先と固定投稿のコメント欄が空になる。
  if (!usable.some(hasAnyLink)) {
    return {
      key: "no_link",
      text:
        "次にやることが1つあります。\n\n" +
        "「ご案内先URL」がまだ登録されていません。毎日の投稿の誘導と、固定投稿のコメント欄に使う、お客様に来てほしい場所です。\n" +
        "下の「ご案内先URLを登録」から、公式LINE・Web予約・ホームページのどれかのURLを送ってください（1分）。" + supportTail("link"),
      buttons: [{ label: "ご案内先URLを登録", data: "c=seturl" }, ...supportBtn("link")],
    };
  }

  // ④'' Threadsの自己紹介が空。投稿を見た人がプロフィールに来ても何のお店か分からない。
  {
    const bare = activeAccounts.find((a: any) => String(a.biography || "").trim().length < 40);
    if (bare) {
      return {
        key: `profile_bio:${Number(bare.id)}`,
        text:
          "次にやることが1つあります。\n\n" +
          `@${bare.threadsUsername} のThreadsプロフィール（自己紹介）が空、または短いままです。\n` +
          "投稿を見た人が次に見る場所なので、ここが空だと来店につながりません。\n" +
          "下の「プロフィールの提案」を押すと、名前と自己紹介の文章を貼るだけの形でお送りします（5分）。" + supportTail("profile"),
        buttons: [{ label: "プロフィールの提案", data: `c=proadv&a=${Number(bare.id)}` }, ...supportBtn("profile")],
      };
    }
  }

  // ⑤ 固定投稿がまだ。プロフィールに固定しておく投稿は集客の入口になるので、
  //    アプリのチェックリストでも最初の工程に置いている。案内側でも同じ扱いにする。
  let hasPinned = false;
  try { hasPinned = await db.hasGeneratedPinnedPost(userId); } catch { hasPinned = true; }
  if (!hasPinned && activeAccounts[0]) {
    try {
      const prog = await db.getAccountPinnedProgress(userId, Number(activeAccounts[0].id), (activeAccounts[0] as any).defaultProjectId ?? null);
      hasPinned = prog.created;
    } catch { /* そのまま */ }
  }
  if (!hasPinned) {
    const base = process.env.APP_BASE_URL || "https://threads-studio.com";
    return {
      key: "no_pinned",
      text:
        "次にやることが1つあります。\n\n" +
        "プロフィールに固定しておく「固定投稿」がまだ作られていません。\n" +
        "はじめて見に来た方が最初に読む投稿なので、集客の入口になります。\n\n" +
        "下のボタンを押すと、このトークの中で作って、そのまま公開できます。" + supportTail("pinned"),
      buttons: [{ label: "固定投稿を作る", data: "m=makepin" }, ...supportBtn("pinned")],
    };
  }

  // ⑥ 固定投稿は作ったが、まだThreadsに公開していない。
  //    公開していない投稿はピン留めできないので、先にここを案内する。
  let postedCount = 1;
  try { postedCount = await db.countPostedPosts(userId); } catch { postedCount = 1; }
  if (postedCount === 0) {
    const base = process.env.APP_BASE_URL || "https://threads-studio.com";
    return {
      key: "not_posted",
      text:
        "次にやることが1つあります。\n\n" +
        "固定投稿は作れていますが、まだThreadsに公開されていません。\n" +
        "AIで作った時点では、その投稿はまだThreadsに出ていない状態です。\n\n" +
        "下の「今日の投稿」を押すと、公開をお待ちしている投稿を確認して、その場で公開できます。\n" +
        "新しく作り直す場合は「固定投稿を作る」を押してください。",
      buttons: [
        { label: "今日の投稿", data: "m=posts" },
        { label: "固定投稿を作る", data: "m=makepin" },
        { label: "ピン留めのやり方", data: "n=pinhow" },
      ],
    };
  }

  // ⑦ 公開はしたが、Threads側でピン留めがまだ。
  //    ここを飛ばすと「固定投稿を作ったのに効果がない」ということになる。
  {
    let confirmed = false;
    try { confirmed = await db.isPinnedPostConfirmed(userId); } catch { confirmed = true; }
    if (!confirmed && activeAccounts[0]) {
      try { confirmed = await db.isPinnedPostConfirmedForAccount(Number(activeAccounts[0].id)); } catch { /* そのまま */ }
    }
    if (!confirmed) {
      const { pinGuideText } = await import("@shared/pinGuide");
      return {
        key: "pin_not_confirmed",
        text:
          "次にやることが1つあります。\n\n" +
          "固定投稿はできていますが、まだThreadsでピン留めされていないようです。\n\n" +
          pinGuideText() +
          "\n\n終わったら、下の「ピン留めしました」を押してください。" + supportTail("pinned"),
        buttons: [{ label: "ピン留めしました", data: "n=pinned" }, ...supportBtn("pinned")],
      };
    }
  }

  // ⑨ 公開前の確認がOFFのまま。最初のうちは中身を見てからのほうが安心。
  //    （一度もご自身の投稿を承認したことがない方にだけお伝えする）
  if (maxPerDay > 0 && settings && settings.autoPostRequireApproval === false) {
    const approved = await db.countApprovedPosts(userId).catch(() => 1);
    if (approved === 0) {
      return {
        key: "approval_off",
        text:
          "ひとつご提案です。\n\n" +
          "いま「公開前の確認」がOFFになっていて、AIが作った投稿がそのまま公開されます。\n" +
          "最初のうちは中身を見てからのほうが安心です。ONにすると、このトークに投稿が届き、ボタンひとつで公開できます。",
        buttons: [{ label: "公開前に確認する", data: "s=appr&v=on" }],
      };
    }
  }

  return null;
}
