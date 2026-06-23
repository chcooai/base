import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupApp } from './bootstrap/setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('bootstrap').log(`listening on :${port}`);
}
void bootstrap();
