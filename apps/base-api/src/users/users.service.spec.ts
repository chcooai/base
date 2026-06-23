import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { configuration } from '../config/configuration';

describe('UsersService', () => {
  let service: UsersService;
  let moduleRef: TestingModule;
  beforeEach(async () => {
    process.env.BCRYPT_ROUNDS = '4'; // 测试加速
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ type: 'better-sqlite3', database: ':memory:', entities: [User], synchronize: true }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [UsersService],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('should_hash_password_when_create', async () => {
    const u = await service.create('a@b.com', 'secret123');
    expect(u.passwordHash).not.toBe('secret123');
    expect(await service.verifyPassword(u, 'secret123')).toBe(true);
    expect(await service.verifyPassword(u, 'wrong')).toBe(false);
  });

  it('should_throw_conflict_when_duplicate_email', async () => {
    await service.create('dup@b.com', 'secret123');
    await expect(service.create('dup@b.com', 'other123')).rejects.toBeInstanceOf(ConflictException);
  });

  it('should_return_null_when_email_unknown', async () => {
    expect(await service.findByEmail('none@b.com')).toBeNull();
  });
});
