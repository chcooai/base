import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class InitSchema1750000000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.createTable(new Table({
      name: 'users',
      columns: [
        { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'email', type: 'varchar', length: '255' },
        { name: 'password_hash', type: 'varchar', length: '255' },
        { name: 'status', type: 'varchar', length: '16', default: "'active'" },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }), true);
    await q.createIndex('users', new TableIndex({ name: 'uq_users_email', columnNames: ['email'], isUnique: true }));

    await q.createTable(new Table({
      name: 'refresh_tokens',
      columns: [
        { name: 'id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'user_id', type: 'bigint' },
        { name: 'token_hash', type: 'varchar', length: '64' },
        { name: 'expires_at', type: 'datetime' },
        { name: 'revoked_at', type: 'datetime', isNullable: true },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
    }), true);
    await q.createIndex('refresh_tokens', new TableIndex({ name: 'uq_refresh_hash', columnNames: ['token_hash'], isUnique: true }));
    await q.createIndex('refresh_tokens', new TableIndex({ name: 'idx_refresh_user', columnNames: ['user_id'] }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('refresh_tokens', true);
    await q.dropTable('users', true);
  }
}
