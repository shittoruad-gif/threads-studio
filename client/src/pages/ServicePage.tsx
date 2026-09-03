/**
 * 関連サービスの紹介ページ（公開・ログイン不要）。
 *   /services            … 一覧
 *   /services/<slug>     … 1サービスの案内
 *
 * 「他に興味のあるサービス」アンケートでチェックされたサービスの案内メールから、
 * ここへ飛んでくる。中身は shared/relatedServices.ts の1か所で管理する
 * （メール・ダイアログ・このページで同じ説明・同じ料金を出すため）。
 */
import { Link, useParams } from "wouter";
import { Sparkles, CheckCircle2, ArrowRight, Mail } from "lucide-react";
import { RELATED_SERVICES, RELATED_SERVICES_CONTACT_EMAIL, RELATED_SERVICES_OVERVIEW_URL, serviceBySlug } from "@shared/relatedServices";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b border-border">
        <div className="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground whitespace-nowrap">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Threads Studio
          </Link>
          <span className="text-xs text-muted-foreground whitespace-nowrap">株式会社しっとる</span>
        </div>
      </header>
      <main className="container mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="container mx-auto max-w-4xl px-4 py-8 text-xs text-muted-foreground">
        <p>
          集客の流れ（ページ作成 → 広告 → SNS → 公式LINE → 計測）の全体像は
          <a href={RELATED_SERVICES_OVERVIEW_URL} target="_blank" rel="noreferrer" className="underline ml-1">こちらのご案内ページ</a>
          にまとめています。
        </p>
        <p className="mt-2">お問い合わせ：<a href={`mailto:${RELATED_SERVICES_CONTACT_EMAIL}`} className="underline">{RELATED_SERVICES_CONTACT_EMAIL}</a></p>
      </footer>
    </div>
  );
}

export function ServicesIndex() {
  return (
    <Shell>
      <h1 className="text-2xl font-bold text-foreground mb-2">サービスのご案内</h1>
      <p className="text-sm text-muted-foreground mb-6">Threads Studio と組み合わせてお使いいただける、株式会社しっとるのサービスです。</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {RELATED_SERVICES.map((s) => (
          <Link key={s.slug} href={`/services/${s.slug}`} className="block rounded-xl border border-border bg-background p-5 hover:border-emerald-300 hover:shadow-sm transition">
            <div className="font-bold text-foreground">{s.label}</div>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
            {s.price && <p className="mt-2 text-xs text-emerald-800">料金：{s.price}</p>}
            <span className="mt-3 inline-flex items-center text-sm font-semibold text-emerald-700">くわしく見る <ArrowRight className="w-4 h-4 ml-1" /></span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}

export default function ServicePage() {
  const { slug } = useParams<{ slug: string }>();
  const s = slug ? serviceBySlug(slug) : undefined;
  if (!s) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">そのサービスは見つかりませんでした。</p>
        <Link href="/services" className="text-sm underline">サービス一覧へ</Link>
      </Shell>
    );
  }
  const p = s.page;
  const consult = `mailto:${RELATED_SERVICES_CONTACT_EMAIL}?subject=${encodeURIComponent(`${s.label}について`)}`;
  return (
    <Shell>
      <Link href="/services" className="text-xs text-muted-foreground underline">サービス一覧</Link>
      <div className="mt-2 text-xs font-semibold text-emerald-700">{s.label}</div>
      <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-foreground leading-snug">{p.headline}</h1>
      <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">{s.description}</p>

      <section className="mt-8">
        <h2 className="text-base font-bold text-foreground mb-3">こんなお悩みに</h2>
        <ul className="space-y-2">
          {p.pains.map((t) => (
            <li key={t} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-bold text-foreground mb-3">流れ</h2>
        <ol className="space-y-2">
          {p.steps.map((st, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">{st.who}</div>
                <div className="text-sm text-foreground leading-relaxed">{st.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-bold text-foreground mb-3">得られるもの</h2>
        <ul className="space-y-2">
          {p.outputs.map((t) => (
            <li key={t} className="flex items-start gap-2 text-sm text-foreground"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />{t}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-base font-bold text-foreground">料金</h2>
        <p className="mt-1 text-sm text-emerald-900 leading-relaxed">
          {s.price ?? "お店の状況をうかがったうえでお見積りします。お気軽にご相談ください。"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={p.cta.url} target={p.cta.url.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer"
             className="inline-flex items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
            {p.cta.label} <ArrowRight className="w-4 h-4 ml-1" />
          </a>
          {s.sample && (
            <a href={s.sample.url} target="_blank" rel="noreferrer"
               className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
              {s.sample.label}
            </a>
          )}
          {s.url && !p.cta.url.startsWith(s.url) && (
            <a href={s.url} target="_blank" rel="noreferrer"
               className="inline-flex items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
              サービスの詳細ページ
            </a>
          )}
          <a href={consult} className="inline-flex items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
            <Mail className="w-4 h-4 mr-1" /> メールで相談する
          </a>
        </div>
        {s.sample?.note && <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{s.sample.note}</p>}
      </section>
    </Shell>
  );
}
