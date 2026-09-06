-- Meta AI呼びかけ文の得意分野（アカウント別）。例：ダイエット → 「〇〇でダイエットに強い整体院のおすすめを教えて」
ALTER TABLE `threadsAccounts` ADD COLUMN `callFocus` varchar(60) NULL;
