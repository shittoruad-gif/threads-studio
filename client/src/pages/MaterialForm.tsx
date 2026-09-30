/**
 * ネタ帳フォーム（2026-09-30 三上様指示・server/materialLedger.ts）。
 * LINEで届いたリンク（/neta?t=…）から、ログインせずに入力できる。スマホ前提。
 * 入れていただいた話は1本の投稿に1つずつ使い、使った記録を残して同じ話を繰り返さない。
 */
import { useMemo, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const DISLIKES = [
  { v: 'same', label: '同じような内容ばかり' },
  { v: 'claim', label: '言っていることが、うちの考えと違う' },
  { v: 'tone', label: '口調・言い回しが違う' },
  { v: 'length', label: '長い・読みにくい' },
] as const;

const CLOSINGS = [
  { v: 'statement', label: '言い切って終わる' },
  { v: 'question', label: '読む人への問いかけで終わる' },
  { v: 'any', label: 'どちらでもよい' },
] as const;

function Section({ no, title, note, children }: { no: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">質問 {no}</p>
        <h2 className="text-base font-bold leading-snug">{title}</h2>
        {note ? <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function MaterialForm() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('t') || '', []);
  const info = trpc.materialForm.get.useQuery({ t: token }, { enabled: !!token, retry: false });
  const submit = trpc.materialForm.submit.useMutation();

  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikeText, setDislikeText] = useState('');
  const [episodes, setEpisodes] = useState(['', '', '']);
  const [faqs, setFaqs] = useState([{ q: '', a: '' }, { q: '', a: '' }, { q: '', a: '' }]);
  const [topics, setTopics] = useState(['', '']);
  const [ngWords, setNgWords] = useState('');
  const [styleSample, setStyleSample] = useState('');
  const [closing, setClosing] = useState<string>('');

  const filled = episodes.some((e) => e.trim()) || faqs.some((f) => f.q.trim()) || topics.some((t) => t.trim())
    || ngWords.trim() || styleSample.trim() || closing || dislikes.length > 0 || dislikeText.trim();

  if (!token || info.data?.ok === false || info.isError) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-xl border bg-white p-6 text-center space-y-2">
          <h1 className="text-lg font-bold">このリンクは使えません</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">有効期限が切れているか、リンクの一部が欠けています。お手数ですが、公式LINEで「ネタ帳のリンク」とお送りください。担当者から新しいリンクをお送りします。</p>
        </div>
      </main>
    );
  }
  if (info.isLoading) {
    return <main className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></main>;
  }

  if (submit.data) {
    const s = submit.data.status;
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-xl border bg-white p-6 space-y-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-emerald-600" /><h1 className="text-lg font-bold">ありがとうございました</h1></div>
          <p className="text-sm leading-relaxed">教えていただいた内容は、明日の朝に作る投稿から使います。</p>
          <ul className="text-sm leading-relaxed list-disc pl-5 space-y-1">
            <li>話・質問・話題は、1本の投稿に1つずつ、順番に使います。</li>
            <li>一度使った話は30日、よくある質問は14日、あけてから使います。同じ話が続くことはありません。</li>
            <li>見送られた投稿の話は、60日使いません。</li>
          </ul>
          <p className="text-sm rounded-lg bg-slate-50 p-3">いま使える話：{s.available}件（お休み中 {s.cooling}件）</p>
          <p className="text-xs text-muted-foreground leading-relaxed">話が少なくなってきたら、またこのフォームからお送りください。同じリンクを90日お使いいただけます。</p>
        </div>
      </main>
    );
  }

  const onSubmit = async () => {
    try {
      await submit.mutateAsync({
        t: token,
        dislikes: dislikes as any,
        dislikeText: dislikeText.trim() || undefined,
        episodes: episodes.map((e) => e.trim()).filter(Boolean),
        faqs: faqs.filter((f) => f.q.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() || undefined })),
        topics: topics.map((t) => t.trim()).filter(Boolean),
        ngWords: ngWords.trim() || undefined,
        styleSample: styleSample.trim() || undefined,
        closing: (closing || undefined) as any,
      });
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      toast.error(e?.message || '送信できませんでした。時間をおいてもう一度お試しください。');
    }
  };

  const store = info.data?.ok ? info.data.storeName : '';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="space-y-2">
          <h1 className="text-xl font-bold leading-snug">{store ? `${store}様の` : ''}投稿のネタ帳</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ここに書いていただいた話を、1本の投稿に1つずつ使います。一度使った話は間をあけるので、同じ話が続くことはありません。
            分かるところだけで大丈夫です（3分ほど）。
          </p>
        </header>

        <Section no={1} title="最近の投稿の案で、合わなかったところはありますか" note="いくつでも選べます。">
          <div className="space-y-2">
            {DISLIKES.map((d) => (
              <label key={d.v} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={dislikes.includes(d.v)}
                  onChange={(e) => setDislikes((cur) => e.target.checked ? [...cur, d.v] : cur.filter((x) => x !== d.v))} />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
          <Textarea rows={2} value={dislikeText} onChange={(e) => setDislikeText(e.target.value)} placeholder="ほかに気になったこと（あれば）" />
        </Section>

        <Section no={2} title="最近あったお客様の話を教えてください" note="どんな方が・何に困って来られて・どうなったか。1つの欄に1つの話を。お名前は書かないでください。">
          {episodes.map((v, i) => (
            <Textarea key={i} rows={3} value={v} maxLength={300}
              onChange={(e) => setEpisodes((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={i === 0 ? '例：大会前の高校生。足首をひねって不安そうだったが、テーピングの巻き方を一緒に練習して、当日は笑顔で出場できた' : `話 ${i + 1}（あれば）`} />
          ))}
        </Section>

        <Section no={3} title="よく聞かれる質問と、いつもの答えを教えてください" note="答えまで書いていただくと、答えの入った投稿になります。">
          {faqs.map((f, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <Input value={f.q} maxLength={150} onChange={(e) => setFaqs((cur) => cur.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
                placeholder={i === 0 ? '質問の例：どのくらいの間隔で通えばいいですか' : `質問 ${i + 1}（あれば）`} />
              <Textarea rows={2} value={f.a} maxLength={300} onChange={(e) => setFaqs((cur) => cur.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
                placeholder="いつもの答え" />
            </div>
          ))}
        </Section>

        <Section no={4} title="ほかに、投稿で取り上げてほしい話題はありますか" note="季節のこと・お店の新しいこと・伝えたい考えなど。">
          {topics.map((v, i) => (
            <Input key={i} value={v} maxLength={150} onChange={(e) => setTopics((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`話題 ${i + 1}（あれば）`} />
          ))}
        </Section>

        <Section no={5} title="投稿に書いてほしくない言葉・話はありますか" note="いくつか書く場合は、読点（、）で区切ってください。">
          <Input value={ngWords} maxLength={300} onChange={(e) => setNgWords(e.target.value)} placeholder="例：根本改善、ボキボキ" />
        </Section>

        <Section no={6} title="「こういう投稿を出したい」という例はありますか" note="ご自分の過去の投稿や、いいなと思った文を貼ってください。口調を合わせます。">
          <Textarea rows={4} value={styleSample} maxLength={1000} onChange={(e) => setStyleSample(e.target.value)} placeholder="ここに貼り付け" />
        </Section>

        <Section no={7} title="投稿の終わり方は、どちらがよいですか">
          <div className="space-y-2">
            {CLOSINGS.map((c) => (
              <label key={c.v} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <input type="radio" name="closing" className="h-5 w-5 shrink-0" checked={closing === c.v} onChange={() => setClosing(c.v)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </Section>

        <Button className="w-full h-12 text-base" disabled={!filled || submit.isPending} onClick={onSubmit}>
          {submit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />送っています</> : '送る'}
        </Button>
        <p className="pb-8 text-center text-xs text-muted-foreground">送ったあとも、同じリンクから何度でも足せます。</p>
      </div>
    </main>
  );
}
