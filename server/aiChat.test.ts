import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('AI Chat Functions', () => {
  let testUserId: number;
  let testConversationId: number;

  beforeAll(async () => {
    // Use a test user ID (assuming user with ID 1 exists)
    testUserId = 1;
  });

  it('should create a new conversation', async () => {
    const conversation = await db.createChatConversation(testUserId, 'Test Conversation');
    expect(conversation).toBeDefined();
    expect(conversation.userId).toBe(testUserId);
    expect(conversation.title).toBe('Test Conversation');
    testConversationId = conversation.id;
  });

  it('should get a conversation by ID', async () => {
    const conversation = await db.getChatConversation(testConversationId);
    expect(conversation).toBeDefined();
    expect(conversation?.id).toBe(testConversationId);
  });

  it('should add a message to a conversation', async () => {
    const message = await db.addChatMessage(testConversationId, 'user', 'Hello, AI!');
    expect(message).toBeDefined();
    expect(message.conversationId).toBe(testConversationId);
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello, AI!');
  });

  it('should get messages from a conversation', async () => {
    const messages = await db.getChatMessages(testConversationId);
    expect(messages).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].content).toBe('Hello, AI!');
  });

  it('should get user conversations', async () => {
    const conversations = await db.getUserChatConversations(testUserId);
    expect(conversations).toBeDefined();
    expect(conversations.length).toBeGreaterThan(0);
  });

  it('should delete a conversation', async () => {
    const result = await db.deleteChatConversation(testConversationId);
    expect(result).toBe(true);

    const deletedConversation = await db.getChatConversation(testConversationId);
    expect(deletedConversation).toBeNull();
  });
});
