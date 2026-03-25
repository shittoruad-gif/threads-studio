CREATE TABLE `aiChatConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiChatConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiChatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiChatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `aiChatConversations` ADD CONSTRAINT `aiChatConversations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiChatMessages` ADD CONSTRAINT `aiChatMessages_conversationId_aiChatConversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `aiChatConversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chat_conversation_user_id_idx` ON `aiChatConversations` (`userId`);--> statement-breakpoint
CREATE INDEX `chat_message_conversation_id_idx` ON `aiChatMessages` (`conversationId`);