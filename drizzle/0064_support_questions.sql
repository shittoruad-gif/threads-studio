-- お客様からのご質問と、その自動応答・担当者の回答を記録する。
--
-- 目的は3つ:
--   1. 自動応答（サポートボット）が何を聞かれて何と答えたかを後から確認できるようにする
--   2. 自動で答えられなかったものを、担当者が拾って返信できるようにする
--   3. 集まった質問を「よくある質問」に反映し、説明会の題材にする
CREATE TABLE IF NOT EXISTS `supportQuestions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NULL,
  `lineUserId` varchar(64) NULL,
  -- 'line' | 'web'
  `source` varchar(16) NOT NULL DEFAULT 'line',
  `question` text NOT NULL,
  `aiAnswer` text NULL,
  -- AIが「知識の範囲で答えられた」と判断したか
  `aiConfident` tinyint NOT NULL DEFAULT 0,
  -- 担当者につないでほしい、と本人が選んだか
  `needsHuman` tinyint NOT NULL DEFAULT 0,
  `category` varchar(40) NULL,
  -- 担当者からの返信（LINEへ送った本文）
  `staffReply` text NULL,
  `repliedAt` timestamp NULL,
  -- よくある質問への掲載
  `faqPublished` tinyint NOT NULL DEFAULT 0,
  `faqQuestion` varchar(255) NULL,
  `faqAnswer` text NULL,
  `faqPublishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_supportQuestions_created` (`createdAt`),
  KEY `idx_supportQuestions_needsHuman` (`needsHuman`),
  KEY `idx_supportQuestions_faq` (`faqPublished`)
);
