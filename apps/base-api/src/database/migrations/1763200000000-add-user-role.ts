import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserRole1763200000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.addColumn('users', new TableColumn({
      name: 'role', type: 'varchar', length: '16', default: "'user'", isNullable: false,
    }));
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('users', 'role');
  }
}
