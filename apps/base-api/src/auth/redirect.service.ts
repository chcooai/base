import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedirectService {
  constructor(private readonly config: ConfigService) {}

  resolve(redirectUri?: string): string {
    if (!redirectUri) return '/welcome';
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      throw new BadRequestException('redirect_uri 非法');
    }
    const allowlist = this.config.get<string[]>('redirectAllowlist', []);
    if (!allowlist.includes(url.origin)) {
      throw new BadRequestException('redirect_uri 不在白名单');
    }
    return redirectUri;
  }
}
