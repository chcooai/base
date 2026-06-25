import { BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';

const make = (over: any = {}) => ({
  list: jest.fn().mockResolvedValue({
    items: [{ id: '1', email: 'a@b.com', status: 'active', role: 'admin', createdAt: new Date(0) }],
    total: 1,
  }),
  createByAdmin: jest.fn().mockResolvedValue({ id: '2', email: 'n@b.com', status: 'active', role: 'user', createdAt: new Date(0) }),
  setStatus: jest.fn(),
  resetPassword: jest.fn(),
  setRole: jest.fn(),
  ...over,
});

describe('AdminController', () => {
  it('should_list_users_mapped_without_password', async () => {
    const users = make();
    const c = new AdminController(users as any);
    const res = await c.list({ page: 1, pageSize: 20 } as any);
    expect(res.total).toBe(1);
    expect(res.items[0]).toEqual({ id: '1', email: 'a@b.com', status: 'active', role: 'admin', createdAt: new Date(0) });
  });

  it('should_reject_disabling_self', async () => {
    const c = new AdminController(make() as any);
    await expect(c.setStatus('1', { status: 'disabled' } as any, { sub: '1', email: 'a@b.com' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should_reject_demoting_self', async () => {
    const c = new AdminController(make() as any);
    await expect(c.setRole('1', { role: 'user' } as any, { sub: '1', email: 'a@b.com' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should_set_status_for_other_user', async () => {
    const users = make();
    const c = new AdminController(users as any);
    await c.setStatus('2', { status: 'disabled' } as any, { sub: '1', email: 'a@b.com' });
    expect(users.setStatus).toHaveBeenCalledWith('2', 'disabled');
  });
});
