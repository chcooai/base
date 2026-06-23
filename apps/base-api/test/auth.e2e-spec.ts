import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { setupApp } from '../src/bootstrap/setup-app';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../src/users/user.entity';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { UsersService } from '../src/users/users.service';
import { TokenService } from '../src/auth/token.service';
import { RedirectService } from '../src/auth/redirect.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { configuration } from '../src/config/configuration';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'e'.repeat(32);
    process.env.BCRYPT_ROUNDS = '4';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.REDIRECT_ALLOWLIST = 'https://app.chcooai.com';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.register({ secret: 'e'.repeat(32) }),
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [User, RefreshToken], synchronize: true }),
        TypeOrmModule.forFeature([User, RefreshToken]),
      ],
      controllers: [AuthController],
      providers: [AuthService, UsersService, TokenService, RedirectService],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('should_register_login_me_flow', async () => {
    await request(app.getHttpServer()).post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'secret123' }).expect(201);

    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret123' }).expect(200);
    expect(login.body.redirectTo).toBe('/welcome');
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const me = await request(app.getHttpServer()).get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body.email).toBe('a@b.com');
  });

  it('should_refresh_via_cookie', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret123' }).expect(200);
    const cookie = login.headers['set-cookie'][0];
    const refreshed = await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('Cookie', cookie).expect(200);
    expect(refreshed.body.accessToken).toBeDefined();
  });

  it('should_reject_login_with_unlisted_redirect', async () => {
    await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret123', redirectUri: 'https://evil.com' }).expect(400);
  });
});
