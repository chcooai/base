import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { RefreshToken } from './refresh-token.entity';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(RefreshToken) private readonly repo: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issuePair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.signAccess(userId, email);
    const refreshToken = randomBytes(32).toString('base64url');
    const ttlMs = this.parseTtlMs(this.config.get<string>('jwt.refreshTtl', '30d'));
    await this.repo.save(
      this.repo.create({
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + ttlMs),
        revokedAt: null,
      }),
    );
    return { accessToken, refreshToken };
  }

  /**
   * 校验并吊销旧 refresh token，返回 userId。
   * 不签新 access token —— 由调用方（AuthService.refresh）查用户后再调 issuePair。
   * 无效/过期/已吊销时抛 UnauthorizedException。
   */
  async rotateRefresh(rawRefresh: string): Promise<{ userId: string }> {
    const row = await this.repo.findOne({ where: { tokenHash: sha256(rawRefresh) } });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('refresh token 无效');
    }
    row.revokedAt = new Date();
    await this.repo.save(row);
    return { userId: String(row.userId) };
  }

  async revoke(rawRefresh: string): Promise<void> {
    const row = await this.repo.findOne({ where: { tokenHash: sha256(rawRefresh) } });
    if (row && !row.revokedAt) {
      row.revokedAt = new Date();
      await this.repo.save(row);
    }
  }

  verifyAccess(token: string): { sub: string; email: string } {
    try {
      const secret = this.config.get<string>('jwt.secret')!;
      return this.jwt.verify(token, { secret });
    } catch {
      throw new UnauthorizedException('access token 无效');
    }
  }

  signAccess(userId: string, email: string): string {
    const secret = this.config.get<string>('jwt.secret')!;
    const ttlMs = this.parseTtlMs(this.config.get<string>('jwt.accessTtl', '900s'));
    // expiresIn 接受秒数（number）
    return this.jwt.sign({ sub: userId, email }, { secret, expiresIn: Math.floor(ttlMs / 1000) });
  }

  parseTtlMs(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!m) return 30 * 24 * 3600 * 1000;
    const n = Number(m[1]);
    const unit: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return n * unit[m[2]]!;
  }
}
