import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RedirectService } from './redirect.service';
import { AuthService } from './auth.service';
import { configuration } from '../config/configuration';

describe('AuthService', () => {
  let auth: AuthService;
  let tokens: TokenService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'z'.repeat(32);
    process.env.BCRYPT_ROUNDS = '4';
    process.env.REDIRECT_ALLOWLIST = 'https://app.chcooai.com';
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.register({ secret: 'z'.repeat(32) }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, RefreshToken],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User, RefreshToken]),
      ],
      providers: [AuthService, UsersService, TokenService, RedirectService],
    }).compile();
    auth = moduleRef.get(AuthService);
    tokens = moduleRef.get(TokenService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('should_register_then_login_with_welcome_redirect', async () => {
    await auth.register('a@b.com', 'secret123');
    const res = await auth.login('a@b.com', 'secret123');
    expect(res.redirectTo).toBe('/welcome');
    expect(tokens.verifyAccess(res.accessToken)).toMatchObject({ email: 'a@b.com' });
  });

  it('should_resolve_redirect_uri_on_login', async () => {
    await auth.register('a@b.com', 'secret123');
    const res = await auth.login('a@b.com', 'secret123', 'https://app.chcooai.com/x');
    expect(res.redirectTo).toBe('https://app.chcooai.com/x');
  });

  it('should_reject_login_when_wrong_password', async () => {
    await auth.register('a@b.com', 'secret123');
    await expect(auth.login('a@b.com', 'WRONG')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_reject_login_when_unknown_user', async () => {
    await expect(auth.login('none@b.com', 'secret123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_refresh_with_correct_email_in_new_access', async () => {
    await auth.register('a@b.com', 'secret123');
    const res = await auth.login('a@b.com', 'secret123');
    const refreshed = await auth.refresh(res.refreshToken);
    expect(tokens.verifyAccess(refreshed.accessToken)).toMatchObject({ email: 'a@b.com' });
  });
});
