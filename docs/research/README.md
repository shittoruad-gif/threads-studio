# 日本語文体・業種別スタイルの定点リサーチ

Threadsの実投稿を定期収集し、生成日本語の品質基準と業種別の勝ち筋を
実測データで更新するための置き場。

## 何がどこにあるか

- `2026-08-28/` … 初回の多業種コーパス（10業種・発信者側 約150本＋消費者側32本）。
  各ファイルは投稿を `---` 区切りで並べ、投稿末尾の「数字 数字」行が
  いいね数・コメント数。
- `scripts/jp-research/analyze.mjs` … コーパスの文体指標を集計するアナライザ。
- 反映先:
  - 普遍ルール（全業種共通の癖の禁止）→ `shared/jpQualityGuard.ts`（機械ガード）
    と `shared/threadsPrompts.ts`【語尾と言葉のルール】
  - 業種別の勝ち筋・負け筋 → `shared/industryStyleInsights.ts`
    （businessType 部分一致で生成プロンプトに注入）

## 週次リサーチの手順（scheduled-task: weekly-jp-style-research が実行）

1. **自社生成の劣化監視（毎回必須・ブラウザ不要）**
   直近7日の自動投稿を取得して指標を測る:
   ```
   ssh root@163.44.103.9 'PW=$(docker inspect n11p9np5jadgountc2pp9gmg --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -m1 "^MYSQL_ROOT_PASSWORD=" | cut -d= -f2-); docker exec n11p9np5jadgountc2pp9gmg mysql -uroot -p"$PW" --default-character-set=utf8mb4 -N -e "SELECT CONCAT(REPLACE(postContent,CHAR(10),\"\\\\n\"),\"|||\") FROM threads_studio.scheduledPosts WHERE status=\"posted\" AND source=\"auto\" AND replyToThreadsId IS NULL AND postedAt>DATE_SUB(NOW(),INTERVAL 7 DAY);"'
   ```
   `|||` 区切りを `---` 区切りに変換して analyze.mjs にかけ、
   前週の値・人間の基準値（jpQualityGuard.ts冒頭）と比べる。
   「んです/本」が0.3を超える・「いませんか」「ですよね」が1本でも出る、は劣化。
2. **人間コーパスの追加収集（ブラウザ・毎回2〜3業種をローテーション）**
   Threads検索 `https://www.threads.com/search?q=<業種>です&serp_type=default` を開き、
   発信者側の投稿をいいね数付きで `docs/research/<日付>/raw_<業種>.txt` に保存。
   未収集の業種（花屋・工務店・整体以外の医療・学習塾・写真館・飲食の他形態など）を優先。
3. **検証と反映**
   - 普遍ルールの検証: 新コーパスでも「いませんか？」「ですよね」出現ゼロが保たれるか。
     破れたら閾値を安易に変えず、まず例外の性質を記録して三上さんに報告。
   - 業種別: 高反応/低反応の分割で勝ち筋を抽出し、`industryStyleInsights.ts` を更新。
     **実在の投稿の文言をwin/avoidにコピーしない**（流用事故の教訓）。
   - `npx vitest run server/jpQualityGuard.test.ts server/industryStyleInsights.test.ts` が通ること。
4. **デプロイと報告**
   コミット→push→Coolifyデプロイ→反映確認。報告には必ずn数と、
   変更した/しなかった判断の根拠を書く。変えない週は「変えなかった」と報告する。

## 効果は表示回数でなく「集客」で測る

いいね・表示回数は同業の共感でも増える。勝敗の最終判定は次のCV指標を優先する:

1. **Keiroの計測リンク（実クリック→LINE友だち追加）** — 直近7日:
   **クリックは必ずbotを除外して数えること。** 2026-08-29の調査で、生のクリック数の
   96〜99%が Meta のプレビュークローラー（facebookexternalhit）等のbotだと判明した
   （Moveact: 実1/bot211、しっとる: 実3/bot61）。生数で報告すると判断を誤る。
   ```
   ssh root@163.44.103.9 'docker exec x10e9syw5oydt9pqw6hqwiij-051438583558 node -e "
   const db=require(\"better-sqlite3\")(\"/app/data/keiro.db\",{readonly:true});
   const since=Date.now()-7*86400000;
   const bot=/facebookexternalhit|curl|bot|crawler|spider|preview|meta-externalagent/i;
   for(const t of db.prepare(\"SELECT id,name FROM tenants\").all()){
     const rows=db.prepare(\"SELECT ua FROM clicks WHERE tenant_id=? AND created_at>?\").all(t.id,since);
     const real=rows.filter(r=>!bot.test(String(r.ua))).length;
     const f=db.prepare(\"SELECT COUNT(*) c FROM follows WHERE tenant_id=? AND created_at>?\").get(t.id,since).c;
     if(rows.length||f)console.log(t.name+\": 実クリック\"+real+\"(生\"+rows.length+\") 友だち追加\"+f);
   }"'
   ```
   ※ Moveactの計測データは keiro.s-toru.com（上記コンテナ）側にある。
     line.moveact.net 側のテナントはクリック・追加とも累計0で休眠状態（2026-08-29確認）。
2. **合言葉ヒット** — 投稿別コメントの合言葉（shared/inquiryKeywords.ts）が
   LINEの受信箱に届いた数。どの投稿から問い合わせが来たかを特定できる。
3. これらが取れない業種・週は表示回数で代用してよいが、報告に「CV未計測」と明記する。

**観客フィルタ**: 収集した投稿の反応が「見込み客」か「同業の共感」かを必ず判別する。
判別のヒント: コメント欄の顔ぶれ（同業の店名アカウントばかりなら同業）、
内容（道具相談・経営の弱音・相互フォロー企画は同業向け）。
同業向けの型は win に載せない（industryStyleInsights.ts ヘッダー参照）。

## してはいけないこと

- 1週のコーパスだけで普遍ルール（BANNED_TIC_PHRASES等）を緩めること
- win/avoid に実在投稿の文言・固有名詞を書くこと
- 根拠なくエントリを増やすこと（コーパスに無い業種の一般論を書かない）
- 同業からの共感・情のいいねを「伸びた」の根拠として採用すること

## 収集済みコーパス

- `2026-08-28/` … 初回10業種（パン屋・カフェ・ネイル・エステ・ジム・教室・ハンドメイド・
  不動産・治療院・士業）＋治療院の発信者高低比較＋消費者側。
- `2026-09-03/` … 花屋19本・学習塾19本・写真館20本、ノウハウ投稿38本
  （検索語「サロン 集客」「スレッズ 伸ばし方」）。
