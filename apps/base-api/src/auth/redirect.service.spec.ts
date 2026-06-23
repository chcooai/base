import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { configuration } from '../config/configuration';
import { RedirectService } from './redirect.service';

describe('RedirectService', () => {
  let service: RedirectService;
  beforeEach(async () => {
    process.env.REDIRECT_ALLOWLIST = 'https://app.chcooai.com,https://admin.chcooai.com';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] })],
      providers: [RedirectService],
    }).compile();
    service = moduleRef.get(RedirectService);
  });

  it('should_return_welcome_when_no_redirect', () => {
    expect(service.resolve(undefined)).toBe('/welcome');
  });
  it('should_accept_allowlisted_origin', () => {
    expect(service.resolve('https://app.chcooai.com/dashboard')).toBe('https://app.chcooai.com/dashboard');
  });
  it('should_reject_unlisted_origin', () => {
    expect(() => service.resolve('https://evil.com/x')).toThrow(BadRequestException);
  });
  it('should_reject_malformed_uri', () => {
    expect(() => service.resolve('not-a-url')).toThrow(BadRequestException);
  });
});
