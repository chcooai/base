import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  // type 不指定，让 TypeORM 对 sqlite 用 INTEGER，对 MySQL 走迁移脚本建 bigint
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'disabled';

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: 'user' | 'admin';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
