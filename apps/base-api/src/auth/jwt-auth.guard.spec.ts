import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxWithAuth(header?: string): ExecutionContext {
  const req: any = { headers: header ? { authorization: header } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const tokenService = { verifyAccess: jest.fn() };
  const guard = new JwtAuthGuard(tokenService as any);

  it('should_throw_when_no_bearer', () => {
    expect(() => guard.canActivate(ctxWithAuth(undefined))).toThrow(UnauthorizedException);
  });

  it('should_set_user_when_valid', () => {
    tokenService.verifyAccess.mockReturnValue({ sub: '1', email: 'a@b.com' });
    const ctx = ctxWithAuth('Bearer good');
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest() as any;
    expect(req.user).toEqual({ sub: '1', email: 'a@b.com' });
  });
});
