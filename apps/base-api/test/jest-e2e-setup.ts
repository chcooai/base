// 在 ConfigModule 校验 env 前注入必要的 env 变量（仅用于测试）
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.DB_HOST = 'db';
process.env.DB_PORT = '3306';
process.env.DB_USERNAME = 'base';
process.env.DB_PASSWORD = 'pw';
process.env.DB_NAME = 'base';
