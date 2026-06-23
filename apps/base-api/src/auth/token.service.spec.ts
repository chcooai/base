import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshToken } from './refresh-token.entity';
import { TokenService } from './token.service';
import { configuration } from '../config/configuration';

describe('TokenService', () => {
  let service: TokenService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'y'.repeat(32);
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        JwtModule.register({ secret: 'y'.repeat(32) }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [RefreshToken],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([RefreshToken]),
      ],
      providers: [TokenService],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('should_issue_verifiable_access_token', async () => {
    const pair = await service.issuePair('1', 'a@b.com');
    expect(service.verifyAccess(pair.accessToken)).toMatchObject({ sub: '1', email: 'a@b.com' });
    expect(pair.refreshToken).toHaveLength(43); // 32 字节 base64url
  });

  it('should_rotate_return_userid_and_invalidate_old_refresh', async () => {
    const pair = await service.issuePair('1', 'a@b.com');
    const rotated = await service.rotateRefresh(pair.refreshToken);
    expect(rotated).toEqual({ userId: '1' });
    await expect(service.rotateRefresh(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_reject_refresh_after_revoke', async () => {
    const pair = await service.issuePair('1', 'a@b.com');
    await service.revoke(pair.refreshToken);
    await expect(service.rotateRefresh(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should_reject_unknown_refresh', async () => {
    await expect(service.rotateRefresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
