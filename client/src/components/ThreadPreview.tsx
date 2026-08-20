/**
 * 実際にThreadsへ公開された投稿の見え方を再現する部品。
 *
 * 「アプリで作った文章が、Threadsではどう並ぶのか」が想像できないという声が多いため、
 * スクリーンショット画像ではなくHTMLで再現している（アプリを更新しても崩れず、
 * スマホ幅でもそのまま読める）。
 */
export default function ThreadPreview({
  handle,
  posts,
  reply,
}: {
  handle: string;
  posts: string[];
  reply?: { handle: string; text: string; ourReply: string };
}) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-[#0b0b0b] p-4 text-[0.9rem] leading-relaxed text-white">
      <p className="mb-3 text-[0.75rem] font-bold tracking-wider text-white/40">THREADS での見え方</p>
      {posts.map((text, i) => (
        <div key={i} className="relative pb-4 pl-9">
          <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-white/15" />
          {i < posts.length - 1 && (
            <div className="absolute left-[13px] top-8 h-[calc(100%-2rem)] w-px bg-white/15" />
          )}
          <p className="mb-1 text-[0.85rem] font-bold text-white">
            {handle}
            {i > 0 && <span className="ml-2 font-normal text-white/40">{i + 1}/{posts.length}</span>}
          </p>
          <p className="whitespace-pre-wrap break-words text-white/90">{text}</p>
        </div>
      ))}
      {reply && (
        <div className="mt-2 border-t border-white/10 pt-4">
          <div className="relative pb-3 pl-9">
            <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-white/15" />
            <p className="mb-1 text-[0.85rem] font-bold text-white">{reply.handle}</p>
            <p className="text-white/90">{reply.text}</p>
          </div>
          <div className="relative pl-9">
            <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-emerald-500/40" />
            <p className="mb-1 text-[0.85rem] font-bold text-white">
              {handle}
              <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[0.7rem] font-bold">
                アプリから返信
              </span>
            </p>
            <p className="whitespace-pre-wrap break-words text-white/90">{reply.ourReply}</p>
          </div>
        </div>
      )}
    </div>
  );
}
