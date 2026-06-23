import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { InitSchema1750000000000 } from './migrations/1750000000000-init';

/**
 * 当 NODE_ENV=test 时使用 sqlite in-memory，避免 CI 环境无 MySQL 时 e2e 挂起。
 * TypeORM CLI 以真实 MySQL 环境调用此文件（NODE_ENV 未设置），走 mysql 分支。
 */
export function buildDataSourceOptions(): DataSourceOptions {
  if (process.env.NODE_ENV === 'test') {
    return {
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, RefreshToken],
      synchronize: true,
    };
  }
  return {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [User, RefreshToken],
    migrations: [InitSchema1750000000000],
    synchronize: false,
  };
}

export default new DataSource(buildDataSourceOptions());
