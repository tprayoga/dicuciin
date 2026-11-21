import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ParseOptionalIntPipe } from '../../common/pipes/parse-optional-int.pipe';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { USER_ADMIN_ROLES } from '../../common/auth/access-policy';

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
    return this.usersService.create(createUserDto, req.user);
  }

  // Didaftarkan sebelum ':id' agar 'me' tidak tertangkap sebagai id.
  @Patch('me')
  @ApiOperation({ summary: 'Ubah profil sendiri (nama, email, foto)' })
  async updateMe(@Body() dto: UpdateMyProfileDto, @Request() req: any) {
    return this.usersService.updateMe(req.user.userId, dto);
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update user (admin: SUPER_ADMIN/OWNER). Kompatibilitas app lama: user boleh mengubah nama/email DIRINYA SENDIRI',
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    const isUserAdmin = (USER_ADMIN_ROLES as string[]).includes(req.user.role);
    if (!isUserAdmin) {
      if (req.user.userId !== id) {
        throw new ForbiddenException('Insufficient permissions');
      }
      // Batch 1.5 — app mobile lama memanggil PATCH /users/:id untuk profil
      // sendiri ({name, email, phone}). Hanya nama & email yang boleh berubah
      // (aturan sama dengan PATCH /users/me); field istimewa → 403.
      const privileged = ['role', 'password', 'isActive', 'outletId', 'shiftName'] as const;
      if (privileged.some((k) => updateUserDto[k] !== undefined)) {
        throw new ForbiddenException('Tidak boleh mengubah field ini');
      }
      return this.usersService.updateMe(id, {
        name: updateUserDto.name,
        email: updateUserDto.email ?? undefined,
        phone: updateUserDto.phone ?? undefined,
      });
    }
    return this.usersService.update(id, updateUserDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
