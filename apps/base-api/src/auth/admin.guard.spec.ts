import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function ctxWith(authHeader?: string) {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }), _req: req } as any;
}

describe('AdminGuard', () => {
  const tokens = { verifyAccess: jest.fn() };
  const users = { findById: jest.fn() };
  const guard = new AdminGuard(tokens as any, users as any);

  beforeEach(() => jest.clearAllMocks());

  it('should_throw_unauthorized_when_no_bearer', async () => {
    await expect(guard.canActivate(ctxWith())).rejects.toThrow(UnauthorizedException);
  });

  it('should_throw_forbidden_when_role_not_admin', async () => {
    tokens.verifyAccess.mockReturnValue({ sub: '1', email: 'a@b.com' });
    users.findById.mockResolvedValue({ id: '1', role: 'user' });
    await expect(guard.canActivate(ctxWith('Bearer t'))).rejects.toThrow(ForbiddenException);
  });

  it('should_allow_when_role_admin', async () => {
    tokens.verifyAccess.mockReturnValue({ sub: '1', email: 'a@b.com' });
    users.findById.mockResolvedValue({ id: '1', role: 'admin' });
    const ctx = ctxWith('Bearer t');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toEqual({ sub: '1', email: 'a@b.com' });
  });
});
