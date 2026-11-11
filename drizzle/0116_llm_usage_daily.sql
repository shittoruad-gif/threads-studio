-- AIの利用量（日・用途・モデルごとの呼び出し回数とトークン数）。原価を実測するため（2026-11-11・server/llmUsage.ts）。数だけを残し、本文は残さない。
CREATE TABLE IF NOT EXISTS `llmUsageDaily` (
  `day` varchar(10) NOT NULL,
  `purpose` varchar(40) NOT NULL,
  `model` varchar(60) NOT NULL,
  `calls` int NOT NULL DEFAULT 0,
  `promptTokens` bigint NOT NULL DEFAULT 0,
  `completionTokens` bigint NOT NULL DEFAULT 0,
  `totalTokens` bigint NOT NULL DEFAULT 0,
  `cachedTokens` bigint NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`day`, `purpose`, `model`)
);
