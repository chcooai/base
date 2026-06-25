import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async create(email: string, password: string): Promise<User> {
    const normalized = email.trim().toLowerCase();
    if (await this.findByEmail(normalized)) {
      throw new ConflictException('邮箱已被注册');
    }
    const rounds = this.config.get<number>('bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    return this.repo.save(this.repo.create({ email: normalized, passwordHash, status: 'active' }));
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /** 按主键查用户，不存在返回 null */
  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async setRole(id: string, role: 'user' | 'admin'): Promise<void> {
    await this.repo.update(id, { role });
  }

  async list(page: number, pageSize: number, q?: string): Promise<{ items: User[]; total: number }> {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = q ? { email: Like(`%${q.trim().toLowerCase()}%`) } : {};
    const [items, total] = await this.repo.findAndCount({ where, order: { id: 'DESC' }, take, skip });
    return { items, total };
  }

  async createByAdmin(email: string, password: string, role: 'user' | 'admin'): Promise<User> {
    const normalized = email.trim().toLowerCase();
    if (await this.findByEmail(normalized)) {
      throw new ConflictException('邮箱已被注册');
    }
    const rounds = this.config.get<number>('bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    return this.repo.save(this.repo.create({ email: normalized, passwordHash, status: 'active', role }));
  }

  async setStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
    await this.repo.update(id, { status });
  }

  async resetPassword(id: string, password: string): Promise<void> {
    const rounds = this.config.get<number>('bcryptRounds', 12);
    await this.repo.update(id, { passwordHash: await bcrypt.hash(password, rounds) });
  }
}
