#!/bin/sh
# 投稿の長さA/Bテストの集計。
#
#   sh scripts/ab-post-length.sh
#
# scheduledPosts.postLength（投稿時点の条件）と postAnalytics（実測）を突き合わせる。
# 設定は後から変わるため、集計は必ず投稿側に残した条件を使うこと。
set -e
SSH_HOST="${SSH_HOST:-root@163.44.103.9}"
DB_CTR="${DB_CTR:-n11p9np5jadgountc2pp9gmg}"

ssh -o ConnectTimeout=25 "$SSH_HOST" 'PW=$(docker inspect '"$DB_CTR"' --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -m1 "^MYSQL_ROOT_PASSWORD=" | cut -d= -f2-); docker exec '"$DB_CTR"' mysql -uroot -p"$PW" --default-character-set=utf8mb4 -e "
SELECT \"===== 全体 =====\" AS x;
SELECT sp.postLength AS 条件, COUNT(*) AS 本数,
  ROUND(AVG(pa.impressions)) AS 平均表示,
  ROUND(AVG(pa.likes+pa.replies),2) AS 平均反応,
  ROUND(AVG((pa.likes+pa.replies)/NULLIF(pa.impressions,0))*100,2) AS 反応率
FROM threads_studio.scheduledPosts sp
JOIN threads_studio.postAnalytics pa ON pa.threadsPostId = sp.publishedThreadsPostId
WHERE sp.postLength IS NOT NULL AND pa.impressions > 0
GROUP BY sp.postLength;

SELECT \"===== アカウント別 =====\" AS x;
SELECT ta.threadsUsername AS アカウント, sp.postLength AS 条件, COUNT(*) AS 本数,
  ROUND(AVG(pa.impressions)) AS 平均表示, ROUND(AVG(pa.likes+pa.replies),2) AS 平均反応
FROM threads_studio.scheduledPosts sp
JOIN threads_studio.postAnalytics pa ON pa.threadsPostId = sp.publishedThreadsPostId
JOIN threads_studio.threadsAccounts ta ON ta.id = sp.threadsAccountId
WHERE sp.postLength IS NOT NULL AND pa.impressions > 0
GROUP BY ta.threadsUsername, sp.postLength ORDER BY ta.threadsUsername, sp.postLength;

SELECT \"===== 切り口別 =====\" AS x;
SELECT sp.angle AS 切り口, sp.postLength AS 条件, COUNT(*) AS 本数,
  ROUND(AVG(pa.impressions)) AS 平均表示, ROUND(AVG(pa.likes+pa.replies),2) AS 平均反応
FROM threads_studio.scheduledPosts sp
JOIN threads_studio.postAnalytics pa ON pa.threadsPostId = sp.publishedThreadsPostId
WHERE sp.postLength IS NOT NULL AND pa.impressions > 0 AND sp.angle IS NOT NULL
GROUP BY sp.angle, sp.postLength ORDER BY sp.angle, sp.postLength;
"'
