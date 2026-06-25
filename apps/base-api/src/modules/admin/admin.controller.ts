import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/user.entity';
import { ListQueryDto } from './dto/list-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

type Me = { sub: string; email: string };
const view = (u: User) => ({ id: u.id, email: u.email, status: u.status, role: u.role, createdAt: u.createdAt });

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Query() q: ListQueryDto) {
    const { items, total } = await this.users.list(q.page, q.pageSize, q.q);
    return { items: items.map(view), total };
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return view(await this.users.createByAdmin(dto.email, dto.password, dto.role ?? 'user'));
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() me: Me) {
    if (id === me.sub && dto.status === 'disabled') throw new BadRequestException('不能禁用自己');
    await this.users.setStatus(id, dto.status);
    return { ok: true };
  }

  @Patch(':id/password')
  async resetPassword(@Param('id') id: string, @Body() dto: UpdatePasswordDto) {
    await this.users.resetPassword(id, dto.password);
    return { ok: true };
  }

  @Patch(':id/role')
  async setRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() me: Me) {
    if (id === me.sub && dto.role === 'user') throw new BadRequestException('不能把自己降级');
    await this.users.setRole(id, dto.role);
    return { ok: true };
  }
}
