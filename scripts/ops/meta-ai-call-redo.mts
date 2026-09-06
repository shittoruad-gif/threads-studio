/**
 * 今朝の自動「Meta AI呼びかけ投稿」がメンションにならなかった方へ、やり直し案内（ボタン付き）を送る。
 * ★必ず --dry で宛先と文面を確認し、三上さんの承諾を得てから --send。
 *   確認: npx tsx scripts/ops/meta-ai-call-redo.mts --dry  user1 user2 …（Threadsのユーザー名）
 *   送信: npx tsx scripts/ops/meta-ai-call-redo.mts --send user1 user2 …
 * 本番のDB/トークンは環境変数（DATABASE_URL / LINE_NOTIFY_CHANNEL_ACCESS_TOKEN）から読む。
 */
const args = process.argv.slice(2);
const send = args.includes("--send");
const names = args.filter((a) => !a.startsWith("--"));
if (names.length === 0) { console.error("Threadsのユーザー名を指定してください"); process.exit(1); }
const { buildRedoForUsernames, buildMetaAiCallMessages } = await import("../../server/metaAiCallPrompt");
const rows = await buildRedoForUsernames(names);
for (const r of rows) {
  const msgs: any = buildMetaAiCallMessages({ username: r.username, storeName: r.storeName, text: r.text, redo: true });
  console.log(`\n===== @${r.username}（user ${r.userId}・LINE ${r.targets.length}件）=====\n${msgs[0].text}\n[ボタン] ${msgs[1].contents.footer.contents[0].action.uri}`);
}
if (!send) { console.log(`\n--- dry run（送信しません）対象 ${rows.length} アカウント ---`); process.exit(0); }
const { pushMessages } = await import("../../server/lineNotify");
let ok = 0, ng = 0;
for (const r of rows) {
  const msgs = buildMetaAiCallMessages({ username: r.username, storeName: r.storeName, text: r.text, redo: true });
  if (r.targets.length === 0) { console.log(`@${r.username}: LINE未連携のため送れません`); ng++; continue; }
  for (const to of r.targets) { const res = await pushMessages(to, msgs); if (res) ok++; else ng++; await new Promise((s) => setTimeout(s, 300)); }
}
console.log(`送信完了: 成功 ${ok} / 失敗 ${ng}`);
process.exit(ng > 0 ? 2 : 0);
