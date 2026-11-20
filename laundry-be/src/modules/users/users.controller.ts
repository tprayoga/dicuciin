import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { USER_ADMIN_ROLES, UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create new user' })
  async create(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    // SECURITY HOTFIX: OWNER tidak boleh membuat SUPER_ADMIN.
    this.usersService.assertCanManage(req.user, null, createUserDto.role ?? UserRole.CASHIER);
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page', new ParseOptionalIntPipe(1)) page?: number,
    @Query('limit', new ParseOptionalIntPipe(10)) limit?: number,
  ) {
    return this.usersService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (admin, atau diri sendiri)' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    // SECURITY HOTFIX: sebelumnya user mana pun bisa membaca data user lain.
    const isUserAdmin = (USER_ADMIN_ROLES as string[]).includes(req.user?.role);
    if (!isUserAdmin && req.user?.userId !== id) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update user (SUPER_ADMIN/OWNER). User biasa hanya nama/email dirinya sendiri',
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    // SECURITY HOTFIX: sebelumnya rute ini tanpa @Roles — user mana pun (termasuk
    // pelanggan) bisa mengubah role/password/isActive user mana pun.
    const isUserAdmin = (USER_ADMIN_ROLES as string[]).includes(req.user?.role);
    if (!isUserAdmin) {
      if (req.user?.userId !== id) {
        throw new ForbiddenException('Insufficient permissions');
      }
      const privileged = ['role', 'password', 'isActive', 'outletId', 'shiftName'] as const;
      if (privileged.some((k) => updateUserDto[k] !== undefined && updateUserDto[k] !== null)) {
        throw new ForbiddenException('Tidak boleh mengubah field ini');
      }
      return this.usersService.updateOwnProfile(id, updateUserDto);
    }
    this.usersService.assertCanManage(req.user, await this.usersService.roleOf(id), updateUserDto.role);
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
