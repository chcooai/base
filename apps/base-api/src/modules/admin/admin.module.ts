import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../../users/user.entity';
import { RefreshToken } from '../../auth/refresh-token.entity';
import { UsersService } from '../../users/users.service';
import { TokenService } from '../../auth/token.service';
import { AdminGuard } from '../../auth/admin.guard';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken]), JwtModule.register({})],
  controllers: [AdminController],
  providers: [UsersService, TokenService, AdminGuard],
})
export class AdminModule {}
