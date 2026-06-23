// 在 ConfigModule 校验 env 前注入必要的 env 变量（仅用于测试）
// NODE_ENV=test 触发 data-source.ts 的 sqlite in-memory 分支，避免无 MySQL 时 e2e 挂起
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.DB_HOST = 'db';
process.env.DB_PORT = '3306';
process.env.DB_USERNAME = 'base';
process.env.DB_PASSWORD = 'pw';
process.env.DB_NAME = 'base';
