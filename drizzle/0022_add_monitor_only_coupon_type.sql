ALTER TABLE `coupons` MODIFY COLUMN `type` enum('forever_free','trial_30','trial_14','discount_50','discount_30','special_price','monitor','monitor_only') NOT NULL;
