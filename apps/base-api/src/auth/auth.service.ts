import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RedirectService } from './redirect.service';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  redirectTo: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly redirect: RedirectService,
  ) {}

  async register(email: string, password: string): Promise<{ id: string; email: string }> {
    const user = await this.users.create(email, password);
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string, redirectUri?: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await this.users.verifyPassword(user, password))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    if (user.status === 'disabled') {
      throw new UnauthorizedException('账户已被禁用');
    }
    const bootstrap = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
    if (bootstrap && user.email === bootstrap && user.role !== 'admin') {
      await this.users.setRole(user.id, 'admin');
      user.role = 'admin';
    }
    const redirectTo = this.redirect.resolve(redirectUri);
    const pair = await this.tokens.issuePair(user.id, user.email);
    return { ...pair, redirectTo, email: user.email };
  }

  /** 委托 TokenService.rotateRefresh 完成校验+吊销，再查用户重签 pair */
  async refresh(rawRefresh: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { userId } = await this.tokens.rotateRefresh(rawRefresh);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('用户不存在');
    return this.tokens.issuePair(user.id, user.email);
  }

  logout(rawRefresh: string): Promise<void> {
    return this.tokens.revoke(rawRefresh);
  }
}
