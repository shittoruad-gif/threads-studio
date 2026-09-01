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
  /** 案内の種類。同じものを繰り返し送らないための目印 */
  key: string;
  /** LINEにお送りする本文 */
  text: string;
  /** そのまま押せるボタン（postbackのデータ） */
  buttons: { label: string; data: string }[];
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
};

/** お店の情報として「使える」状態か（自動投稿の対象条件と同じ） */
function isUsableProject(p: any): boolean {
  return (
    !String(p.id).startsWith("demo_") &&
    Boolean(p.businessType && p.area && p.target && p.mainProblem && p.strength)
  );
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

  const steps: SetupStep[] = [
    { id: "account", label: "アカウント作成", done: true },
    {
      id: "no_project",
      label: "お店の情報を登録",
      done: usable.length > 0,
      path: "/ai-counseling",
      actionLabel: "登録する",
    },
    {
      id: "no_account",
      label: "Threadsアカウントを連携",
      done: active.length > 0,
      path: "/threads-connect",
      actionLabel: "連携する",
    },
  ];

  // ★複数アカウントを運用しているときだけ意味を持つ工程。
  //   1アカウントなら紐づけが無くてもそのお店の内容が使われるので、工程には出さない。
  if (active.length > 1) {
    steps.push({
      id: "account_unpinned",
      label: "アカウントごとに使うお店の情報を決める",
      done: unlinked.length === 0,
      path: "/threads-connect",
      actionLabel: "決める",
      important: true,
    });
  }

  steps.push({
    id: "no_pinned",
    label: "固定投稿をAIで作成（集客の入口）",
    done: hasPinned,
    path: "/ai-generate?pinned=1",
    actionLabel: "作成する",
  });

  // ★作っただけでは効果が出ない。Threadsのプロフィールに固定して、はじめて入口になる。
  //   ピン留めはThreadsのAPIでは操作も確認もできないため、ご本人の申告で完了とする。
  if (hasPinned) {
    let confirmed = false;
    try { confirmed = await db.isPinnedPostConfirmed(userId); } catch { confirmed = false; }
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
    return {
      key: "no_project",
      text:
        "次にやることが1つあります。\n\n" +
        "まだ「お店の情報」が登録されていないため、投稿を作ることができません。\n" +
        "下の「はじめの設定」から、質問にお答えください（10〜15分・全20問）。",
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

  // ⑤ 固定投稿がまだ。プロフィールに固定しておく投稿は集客の入口になるので、
  //    アプリのチェックリストでも最初の工程に置いている。案内側でも同じ扱いにする。
  let hasPinned = false;
  try { hasPinned = await db.hasGeneratedPinnedPost(userId); } catch { hasPinned = true; }
  if (!hasPinned) {
    const base = process.env.APP_BASE_URL || "https://threads-studio.com";
    return {
      key: "no_pinned",
      text:
        "次にやることが1つあります。\n\n" +
        "プロフィールに固定しておく「固定投稿」がまだ作られていません。\n" +
        "はじめて見に来た方が最初に読む投稿なので、集客の入口になります。\n" +
        `こちらから作れます。\n${base}/ai-generate?pinned=1&openExternalBrowser=1`,
      buttons: [],
    };
  }

  // ⑥ 固定投稿は作ったが、Threads側でピン留めがまだ。
  //    ここを飛ばすと「固定投稿を作ったのに効果がない」ということになる。
  {
    let confirmed = false;
    try { confirmed = await db.isPinnedPostConfirmed(userId); } catch { confirmed = true; }
    if (!confirmed) {
      const { pinGuideText } = await import("@shared/pinGuide");
      return {
        key: "pin_not_confirmed",
        text:
          "次にやることが1つあります。\n\n" +
          "固定投稿はできていますが、まだThreadsでピン留めされていないようです。\n\n" +
          pinGuideText() +
          "\n\n終わったら、下の「ピン留めしました」を押してください。",
        buttons: [{ label: "ピン留めしました", data: "n=pinned" }],
      };
    }
  }

  // ⑦ プランでは自動投稿が使えるのに、OFFのまま。
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

  // ⑧ 公開前の確認がOFFのまま。最初のうちは中身を見てからのほうが安心。
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
