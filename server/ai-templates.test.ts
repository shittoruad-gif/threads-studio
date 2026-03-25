import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('AI Generation Templates', () => {
  let testUserId: number;
  let testTemplateId: number;

  beforeAll(async () => {
    // Create a test user
    const openId = `test-template-user-${Date.now()}`;
    await db.upsertUser({
      openId,
      name: 'Template Test User',
      email: `template-test-${Date.now()}@example.com`,
      role: 'user',
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error('Failed to create test user');
    testUserId = user.id;
  });

  it('should create a template', async () => {
    const templateId = await db.createTemplate({
      userId: testUserId,
      name: 'Test Template',
      description: 'This is a test template',
      postType: 'hook_tree',
      generationParams: JSON.stringify({
        projectId: 'test-project',
        businessType: 'テスト業種',
        area: 'テスト地域',
      }),
      isPublic: false,
    });

    expect(templateId).toBeGreaterThan(0);
    testTemplateId = templateId;
  });

  it('should get template by ID', async () => {
    const template = await db.getAiTemplateById(testTemplateId, testUserId);
    expect(template).toBeDefined();
    expect(template?.name).toBe('Test Template');
    expect(template?.postType).toBe('hook_tree');
  });

  it('should list user templates', async () => {
    const templates = await db.getUserTemplates(testUserId, 10, 0);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0].userId).toBe(testUserId);
  });

  it('should update template', async () => {
    const success = await db.updateTemplate(testTemplateId, testUserId, {
      name: 'Updated Template Name',
      description: 'Updated description',
    });
    expect(success).toBe(true);

    const updated = await db.getAiTemplateById(testTemplateId, testUserId);
    expect(updated?.name).toBe('Updated Template Name');
    expect(updated?.description).toBe('Updated description');
  });

  it('should increment template usage count', async () => {
    const before = await db.getAiTemplateById(testTemplateId, testUserId);
    const beforeCount = before?.usageCount || 0;

    await db.incrementAiTemplateUsage(testTemplateId);

    const after = await db.getAiTemplateById(testTemplateId, testUserId);
    expect(after?.usageCount).toBe(beforeCount + 1);
  });

  it('should count user templates', async () => {
    const count = await db.countUserTemplates(testUserId);
    expect(count).toBeGreaterThan(0);
  });

  it('should delete template', async () => {
    const success = await db.deleteTemplate(testTemplateId, testUserId);
    expect(success).toBe(true);

    const deleted = await db.getAiTemplateById(testTemplateId, testUserId);
    expect(deleted).toBeNull();
  });
});
