import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { RedirectService } from './redirect.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: c.get<string>('jwt.secret') }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, RedirectService, JwtAuthGuard],
  exports: [TokenService],
})
export class AuthModule {}
