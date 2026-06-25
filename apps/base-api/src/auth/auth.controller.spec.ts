import { AuthController } from './auth.controller';

describe('AuthController.me', () => {
  it('should_return_role_and_status_from_db', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({ id: '1', email: 'a@b.com', role: 'admin', status: 'active' }),
    };
    const controller = new AuthController({} as any, {} as any, users as any);
    const res = await controller.me({ sub: '1', email: 'a@b.com' });
    expect(res).toEqual({ sub: '1', email: 'a@b.com', role: 'admin', status: 'active' });
  });

  it('should_default_role_user_when_db_missing', async () => {
    const users = { findById: jest.fn().mockResolvedValue(null) };
    const controller = new AuthController({} as any, {} as any, users as any);
    const res = await controller.me({ sub: '9', email: 'x@b.com' });
    expect(res.role).toBe('user');
  });
});
