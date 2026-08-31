-- LINEトーク内で完結するチャット操作の途中状態（自由文の入力待ち）を保持する。
-- 例:「書き直す」→どう直すかの指示待ち、「NGワードを追加」→単語の入力待ち。
CREATE TABLE IF NOT EXISTS `lineChatStates` (
  `lineUserId` varchar(64) NOT NULL,
  `state` varchar(40) NOT NULL,
  `payload` text,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lineUserId`)
);
