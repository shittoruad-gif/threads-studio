import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';

describe('Admin User Management', () => {
  describe('getAllUsers', () => {
    it('should return all users for admin', async () => {
      const caller = appRouter.createCaller({
        user: { id: 1, openId: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin' },
        req: {} as any,
        res: {} as any,
      });

      const users = await caller.admin.getAllUsers();
      expect(Array.isArray(users)).toBe(true);
    });

    it('should throw FORBIDDEN for non-admin', async () => {
      const caller = appRouter.createCaller({
        user: { id: 2, openId: 'user-1', email: 'user@test.com', name: 'User', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      await expect(caller.admin.getAllUsers()).rejects.toThrow('You do not have required permission');
    });

    it('should throw FORBIDDEN for unauthenticated', async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      await expect(caller.admin.getAllUsers()).rejects.toThrow();
    });
  });

  describe('resetUserPassword', () => {
    it('should reset password for admin', async () => {
      const caller = appRouter.createCaller({
        user: { id: 1, openId: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin' },
        req: {} as any,
        res: {} as any,
      });

      // Note: This test assumes a user with ID 999 exists in test database
      // In production, you would mock the database calls
      const result = await caller.admin.resetUserPassword({
        userId: 999,
        newPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(true);
    });

    it('should throw BAD_REQUEST for weak password', async () => {
      const caller = appRouter.createCaller({
        user: { id: 1, openId: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin' },
        req: {} as any,
        res: {} as any,
      });

      await expect(
        caller.admin.resetUserPassword({
          userId: 999,
          newPassword: 'weak',
        })
      ).rejects.toThrow();
    });

    it('should throw FORBIDDEN for non-admin', async () => {
      const caller = appRouter.createCaller({
        user: { id: 2, openId: 'user-1', email: 'user@test.com', name: 'User', role: 'user' },
        req: {} as any,
        res: {} as any,
      });

      await expect(
        caller.admin.resetUserPassword({
          userId: 999,
          newPassword: 'NewPassword123!',
        })
      ).rejects.toThrow('You do not have required permission');
    });
  });
});
