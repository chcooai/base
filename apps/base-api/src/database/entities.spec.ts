import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';

describe('entities', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3', database: ':memory:',
      entities: [User, RefreshToken], synchronize: true,
    });
    await ds.initialize();
  });
  afterAll(async () => { await ds.destroy(); });

  it('should_persist_and_read_user', async () => {
    const repo = ds.getRepository(User);
    const u = await repo.save(repo.create({ email: 'a@b.com', passwordHash: 'h', status: 'active' }));
    expect(u.id).toBeDefined();
    const found = await repo.findOneByOrFail({ email: 'a@b.com' });
    expect(found.passwordHash).toBe('h');
  });

  it('should_reject_duplicate_email', async () => {
    const repo = ds.getRepository(User);
    await repo.save(repo.create({ email: 'dup@b.com', passwordHash: 'h', status: 'active' }));
    await expect(
      repo.save(repo.create({ email: 'dup@b.com', passwordHash: 'h2', status: 'active' })),
    ).rejects.toThrow();
  });
});
