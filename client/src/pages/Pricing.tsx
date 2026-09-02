import { Fragment, useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { Check, X, Sparkles, Zap, Building2, Crown, Users, RefreshCw, ArrowLeft, ChevronDown } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
import {
  PLANS,
  getCampaignSlotsRemaining,
  getCampaignCounterpart,
  CAMPAIGN_SLOT_TOTAL,
} from '../../../shared/plans';
import { PlanChangeDialog } from '@/components/PlanChangeDialog';

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Zap className="w-6 h-6" />,
  light_campaign: <Sparkles className="w-6 h-6" />,
  pro_campaign: <Crown className="w-6 h-6" />,
  business_campaign: <Building2 className="w-6 h-6" />,
  light: <Sparkles className="w-6 h-6" />,
  pro: <Crown className="w-6 h-6" />,
  business: <Building2 className="w-6 h-6" />,
  agency: <Users className="w-6 h-6" />,
};

const PLAN_COLORS: Record<string, { bg: string; text: string; icon: string; border: string }> = {
  free: { bg: 'bg-muted/50', text: 'text-foreground/80', icon: 'text-muted-foreground', border: 'border-border' },
  // キャンペーンは「限定・お得」が伝わるローズ系で統一
  light_campaign: { bg: 'bg-rose-50', text: 'text-rose-700', icon: 'text-rose-500', border: 'border-rose-300' },
  pro_campaign: { bg: 'bg-rose-50', text: 'text-rose-700', icon: 'text-rose-500', border: 'border-rose-400' },
  business_campaign: { bg: 'bg-rose-50', text: 'text-rose-700', icon: 'text-rose-500', border: 'border-rose-300' },
  light: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
  pro: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500', border: 'border-emerald-300' },
  business: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-200' },
  agency: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500', border: 'border-orange-200' },
};

interface ComparisonFeature {
  category: string;
  features: {
    name: string;
    free: string | boolean;
    light: string | boolean;
    pro: string | boolean;
    business: string | boolean;
    agency: string | boolean;
  }[];
}

const COMPARISON_FEATURES: ComparisonFeature[] = [
  {
    category: '基本機能',
    features: [
      { name: 'プロジェクト数（お店の登録）', free: '1件', light: '3件', pro: '10件', business: '50件', agency: '無制限' },
      { name: 'Threadsアカウント連携', free: '1件', light: '1件', pro: '3件', business: '10件', agency: '無制限' },
      { name: '自動投稿', free: 'なし（手動でお試し）', light: '1日1回まで', pro: '1日3回まで', business: '1日3回まで', agency: '1日3回まで' },
      { name: 'テンプレート利用', free: true, light: true, pro: true, business: true, agency: true },
    ],
  },
  {
    category: 'AI機能',
    features: [
      { name: 'AI投稿生成（手動）', free: '3回/月', light: '10回/月', pro: '無制限', business: '無制限', agency: '無制限' },
      { name: 'フック生成', free: false, light: true, pro: true, business: true, agency: true },
    ],
  },
  {
    category: '投稿管理',
    features: [
      { name: '予約投稿', free: false, light: true, pro: true, business: true, agency: true },
      { name: '投稿履歴', free: false, light: true, pro: true, business: true, agency: true },
      { name: '安全フィルタ', free: true, light: true, pro: true, business: true, agency: true },
    ],
  },
  {
    category: 'サポート・その他',
    features: [
      { name: '優先サポート', free: false, light: false, pro: false, business: true, agency: true },
      { name: 'APIアクセス', free: false, light: false, pro: false, business: false, agency: true },
      { name: '書き出し機能', free: true, light: true, pro: true, business: true, agency: true },
    ],
  },
];

const FAQ_ITEMS = [
  {
    question: '無料トライアル中に解約できますか？',
    answer: 'はい。お申し込み時にカードをご登録いただきますが、7日間のトライアル期間中にダッシュボードから解約すれば、料金は一切発生しません。8日目以降に自動でお支払いが始まります。なお、紹介コードによるキャンペーン価格でお申し込みの場合は無料トライアルの対象外となり、お申し込み時に初回のお支払いが発生します（解約はいつでも可能です）。',
  },
  {
    question: 'プランの変更はできますか？',
    answer: 'はい、ダッシュボードからいつでもプランのアップグレード・ダウングレードが可能です。',
  },
  {
    question: '支払い方法は何がありますか？',
    answer: 'クレジットカード（Visa, Mastercard, JCB, American Express）に対応しています。安全な決済処理を行っています。',
  },
  {
    question: 'AI生成回数などの月間上限はいつリセットされますか？',
    answer: 'AI生成回数などの月間の利用上限は、毎月1日にリセットされます。未使用分の繰り越しはできません。',
  },
  {
    question: '複数のThreadsアカウントを管理できますか？',
    answer: 'はい、プラン別に設定されたアカウント数まで連携可能です。ライトは1件、プロは3件、ビジネスは10件、代理店プランは無制限に管理できます。',
  },
  {
    question: '代理店プランのAPIアクセスとは何ですか？',
    answer: '代理店プランでは、Threads Studioの機能をAPIで利用できます。自社システムとの連携や、顧客向けのカスタムツール開発が可能です。',
  },
];

export default function Pricing() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // モニター（キャンペーンクーポン適用済み）のユーザーには
  // キャンペーン価格を自動表示する。コード入力欄は新規登録時のみ。
  const campaignUnlocked = Boolean(user?.isMonitor);
  // 適用中のキャンペーン種別（セミナー/モニター）。未設定の既存モニターは monitor 扱い。
  const campaignTier: 'seminar' | 'monitor' = ((user as any)?.campaignTier === 'seminar') ? 'seminar' : 'monitor';
  const slotsRemaining = getCampaignSlotsRemaining();

  const { data: currentSubscription, refetch } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  // 決済ページのURL。取得できたのに開けなかった場合は、押せるリンクとして画面に出す。
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (!data.url) return;
      // 決済メール≠登録メールだとWebhookでユーザー特定できず自動反映されないため、
      // 遷移の瞬間に必ず注意を出す。
      toast.info('決済ページに移動します...', {
        description: user?.email
          ? `お支払い画面では、ご登録のメールアドレス（${user.email}）をご入力ください。`
          : 'お支払い画面では、アプリにご登録のメールアドレスをご入力ください。',
        duration: 10000,
      });

      // ★ここは window.open にしてはいけない。
      //   通信が終わったあとに呼ぶ window.open は「利用者の操作から離れた」
      //   ポップアップとみなされ、スマホのブラウザやLINE内ブラウザで遮断される。
      //   実際に「申し込むボタンを押しても画面が切り替わらない」というご連絡があった。
      //   同じタブで移動すれば遮断されない。
      setCheckoutUrl(data.url);
      window.location.href = data.url;
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSelectPlan = (planId: string) => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }

    const currentPlanId = currentSubscription?.planId || 'free';

    if (currentPlanId !== 'free' && currentPlanId !== planId && planId !== 'free') {
      setSelectedPlanId(planId);
      setChangeDialogOpen(true);
      return;
    }

    if (planId === 'free') {
      setLocation('/dashboard');
      return;
    }

    createCheckout.mutate({ planId });
  };

  const isCurrentPlan = (planId: string) => {
    return currentSubscription?.planId === planId;
  };

  const canChangePlan = (planId: string) => {
    const currentPlanId = currentSubscription?.planId || 'free';
    return currentPlanId !== 'free' && currentPlanId !== planId && planId !== 'free';
  };

  const renderCellValue = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-emerald-600 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-muted-foreground/40 mx-auto" />
      );
    }
    return <span className="text-foreground/80 font-medium">{value}</span>;
  };

  // キャンペーンプランはカードとして直接表示しない（コード適用時に通常カードの価格を切替）
  // agency_client（代理店が発行するクライアント枠）は購入対象ではないので料金表に出さない
  const plans = Object.values(PLANS).filter((p) => !p.isCampaign && p.id !== 'agency_client');

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-16">
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={() => setLocation('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity sm:gap-3">
                <div className="w-8 h-8 shrink-0 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="whitespace-nowrap text-base font-bold text-foreground sm:text-lg">Threads Studio</span>
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground/80"
                onClick={() => setLocation('/')}
              >
                {/* スマホ幅ではラベルを省き、ヘッダーが375pxを超えないようにする */}
                <ArrowLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">ホーム</span>
              </Button>
              {isAuthenticated && (
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 sm:px-3 sm:text-sm"
                  onClick={() => setLocation('/dashboard')}
                >
                  ダッシュボード
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Title */}
        <div className="text-center mb-12">
          <p className="text-emerald-600 font-semibold tracking-wider text-sm mb-3">PLAN</p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            シンプルな料金プラン
          </h1>
          {/* ★紹介コードが適用されている方は、キャンペーン価格での即時お申し込みになる。
              7日間無料トライアルは付かないため、同じ説明を出すと事実と食い違う。 */}
          {campaignUnlocked ? (
            <p className="text-muted-foreground max-w-2xl mx-auto">
              紹介コードによるキャンペーン価格が適用されています。
              <br />
              キャンペーン価格でのお申し込みには7日間の無料トライアルは付かず、お申し込み時に初回のお支払いが発生します。解約はダッシュボードからいつでも行えます。
            </p>
          ) : (
            <p className="text-muted-foreground max-w-2xl mx-auto">
              お申し込み時にカードをご登録いただき、7日間は無料で全機能をお試しいただけます。
              <br />
              8日目から自動でお支払いが始まります。トライアル期間中はダッシュボードからいつでも解約でき、料金は発生しません。
            </p>
          )}
          <div className="mt-6 mx-auto max-w-2xl rounded-xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-left dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-[0.98rem] font-bold text-foreground">
              おすすめは、1日3投稿のプロプランです
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Threadsは投稿ごとに「おすすめに載せるか」が決まります。投稿の回数が、そのままお客様と出会える回数です。
              1日1回だと、その1本が外れた日は誰にも届きません。1日3回なら残りの2本が拾い、
              反応の出やすい時間帯（お昼・夕方・夜）も同じ日に押さえられます。
            </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              ※ コメント返信の送信・ツリー投稿の続きは、現在Meta社の追加審査の承認待ちです（自動投稿・分析はご利用いただけます）。
            </p>
          </div>
        </div>

        {/* 限定キャンペーン適用中バナー（クーポン適用済みのモニターユーザーのみ表示） */}
        {campaignUnlocked && (
          <div className="max-w-2xl mx-auto mb-10">
            <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-rose-700">限定キャンペーン価格が適用されています</p>
                <p className="text-sm text-rose-600">
                  キャンペーン価格は3回分。4回目のお支払いから通常価格に自動で切り替わります（事前にメールでお知らせします）
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 max-w-7xl mx-auto mb-20">
          {plans.map((plan) => {
            const colors = PLAN_COLORS[plan.id] || PLAN_COLORS.free;
            // コード適用時、このプランに対応するキャンペーンプランがあれば価格を切替
            const campaignPlan = campaignUnlocked ? getCampaignCounterpart(plan.id, campaignTier) : undefined;
            return (
              <div
                key={plan.id}
                className={`bg-background rounded-xl p-6 text-center transition-all border-2 hover:shadow-lg ${
                  plan.popular ? 'border-emerald-400 shadow-md relative' : 'border-border'
                }`}
              >
                {plan.popular && !isCurrentPlan(plan.id) && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-emerald-500 text-white border-0 px-4">
                      おすすめ
                    </Badge>
                  </div>
                )}
                {isCurrentPlan(plan.id) && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-500 text-white border-0 px-4">
                      現在のプラン
                    </Badge>
                  </div>
                )}
                <div className="flex justify-center mb-3 pt-2">
                  <div className={`p-3 rounded-xl ${colors.bg} ${colors.icon}`}>
                    {PLAN_ICONS[plan.id]}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{plan.name}</h3>
                {campaignPlan ? (
                  <>
                    <div className="mb-2">
                      <Badge className="bg-rose-500 text-white border-0 text-xs">
                        限定{CAMPAIGN_SLOT_TOTAL}名・残り{slotsRemaining}名
                      </Badge>
                    </div>
                    <div className="mb-4">
                      <div className="text-sm text-muted-foreground line-through">
                        通常 ¥{plan.priceMonthly.toLocaleString()}/月
                      </div>
                      <div className="text-3xl font-bold text-rose-600">
                        ¥{campaignPlan.priceMonthly.toLocaleString()}
                      </div>
                      <div className="text-rose-500 text-xs font-medium">
                        /月 ×{campaignPlan.campaignCharges ?? 3}回（その後は通常価格に自動移行）
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mb-4">
                    <div className="text-3xl font-bold text-foreground">
                      ¥{plan.priceMonthly.toLocaleString()}
                    </div>
                    <div className="text-muted-foreground/60 text-sm">/月</div>
                  </div>
                )}
                <p className="text-muted-foreground text-xs mb-4 min-h-[2.5rem]">
                  {plan.description}
                </p>
                <Button
                  className={`w-full ${
                    plan.popular
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : isCurrentPlan(plan.id) && plan.priceMonthly !== 0
                      ? 'bg-muted text-muted-foreground cursor-default'
                      : 'bg-background border border-border text-foreground/80 hover:bg-muted/50'
                  }`}
                  onClick={() => handleSelectPlan(campaignPlan ? campaignPlan.id : plan.id)}
                  // ★フリープランは「現在のプラン」でも押せるようにする。
                  //   登録直後にこの画面へ来た方が、無料のまま先へ進めず行き止まりになっていたため。
                  disabled={(isCurrentPlan(plan.id) && plan.priceMonthly !== 0) || createCheckout.isPending}
                >
                  {isCurrentPlan(plan.id) ? (
                    plan.priceMonthly === 0 ? 'このまま無料で始める' : '現在のプラン'
                  ) : canChangePlan(plan.id) ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      プラン変更
                    </>
                  ) : plan.priceMonthly === 0 ? (
                    '無料で始める'
                  ) : campaignPlan ? (
                    // キャンペーン価格は即時課金のため「無料で試す」とは書けない
                    'このプランに申し込む'
                  ) : (
                    '7日間無料で試す'
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* ★万一、自動で決済ページに移れなかったときの受け皿。
            スマホのブラウザ設定によっては移動が止められることがあるため、
            押せるリンクを必ず画面に残しておく（「押しても何も起きない」を防ぐ）。 */}
        {checkoutUrl && (
          <div className="max-w-3xl mx-auto -mt-8 mb-8 text-center">
            <div className="inline-block rounded-lg border-2 border-emerald-300 bg-emerald-50 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-sm text-foreground font-bold">お支払い画面が開かない場合はこちら</p>
              <a
                href={checkoutUrl}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                お支払い画面を開く
              </a>
            </div>
          </div>
        )}

        {/* 決済メール＝登録メールの注意（Webhook自動反映のため） */}
        {isAuthenticated && (
          <div className="max-w-3xl mx-auto -mt-8 mb-16 text-center">
            <p className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 inline-block">
              💡 お支払い手続きの際は、アプリにご登録のメールアドレス
              {user?.email ? <span className="font-semibold text-foreground">（{user.email}）</span> : ''}
              をご入力ください。別のメールアドレスですと、プランの自動反映ができない場合があります。
            </p>
          </div>
        )}

        {/* Detailed Comparison Table */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="text-center mb-8">
            <p className="text-emerald-600 font-semibold tracking-wider text-sm mb-3">COMPARE</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              詳細な機能比較
            </h2>
          </div>

          <div className="bg-background rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-4 text-foreground/80 font-semibold border-b border-border">
                      機能
                    </th>
                    {plans.map((plan) => (
                      <th
                        key={plan.id}
                        className={`text-center p-4 text-foreground/80 font-semibold border-b border-border ${
                          plan.popular ? 'bg-emerald-50' : ''
                        }`}
                      >
                        {plan.name}
                        {plan.popular && (
                          <Badge className="ml-2 bg-emerald-500 text-white border-0 text-xs">おすすめ</Badge>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map((category, catIndex) => (
                    <Fragment key={`cat-${catIndex}`}>
                      <tr className="bg-muted/50">
                        <td
                          colSpan={6}
                          className="p-3 text-foreground font-semibold text-sm border-b border-border"
                        >
                          {category.category}
                        </td>
                      </tr>
                      {category.features.map((feature, featIndex) => (
                        <tr
                          key={`feat-${catIndex}-${featIndex}`}
                          className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                        >
                          <td className="p-4 text-muted-foreground text-sm">
                            {feature.name}
                          </td>
                          <td className="p-4 text-center text-sm">
                            {renderCellValue(feature.free)}
                          </td>
                          <td className="p-4 text-center text-sm">
                            {renderCellValue(feature.light)}
                          </td>
                          <td className="p-4 text-center text-sm bg-emerald-50/50">
                            {renderCellValue(feature.pro)}
                          </td>
                          <td className="p-4 text-center text-sm">
                            {renderCellValue(feature.business)}
                          </td>
                          <td className="p-4 text-center text-sm">
                            {renderCellValue(feature.agency)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mb-20">
          <div className="text-center mb-8">
            <p className="text-emerald-600 font-semibold tracking-wider text-sm mb-3">FAQ</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              よくある質問
            </h2>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((faq, index) => (
              <div
                key={index}
                className="bg-background rounded-xl border border-border overflow-hidden"
              >
                <button
                  className="w-full p-5 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <span className="font-medium text-foreground flex items-center gap-3">
                    <span className="text-emerald-600 font-bold text-sm bg-emerald-50 px-2 py-1 rounded">Q</span>
                    {faq.question}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground/60 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === index && (
                  <div className="px-5 pb-5 pt-0">
                    <p className="text-muted-foreground text-sm pl-10">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-10 text-center max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-white mb-4">
            {campaignUnlocked ? 'キャンペーン価格でお申し込みいただけます' : 'まずは7日間無料でお試しください'}
          </h3>
          <p className="text-white/80 mb-6">
            {campaignUnlocked
              ? '紹介コード適用のお申し込みには無料トライアルは付かず、お申し込み時に初回のお支払いが発生します。解約はダッシュボードからいつでも行えます。'
              : '7日間は無料。トライアル中はダッシュボードからいつでも解約でき、料金は発生しません。'}
          </p>
          <Button
            size="lg"
            className="bg-background text-emerald-700 hover:bg-muted font-semibold px-8"
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = getLoginUrl();
              } else {
                setLocation('/dashboard');
              }
            }}
          >
            <Sparkles className="w-5 h-5 mr-2" />
            今すぐ始める
          </Button>
        </div>
      </div>

      {/* Plan Change Dialog */}
      <PlanChangeDialog
        open={changeDialogOpen}
        onOpenChange={setChangeDialogOpen}
        currentPlanId={currentSubscription?.planId || 'free'}
        newPlanId={selectedPlanId}
        onConfirm={() => {
          refetch();
          setChangeDialogOpen(false);
        }}
      />
    </div>
  );
}
