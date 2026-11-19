import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../common/auth/access-policy';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cegah eskalasi hak akses. SUPER_ADMIN bebas; OWNER tidak boleh membuat,
   * mengubah, atau memberi role SUPER_ADMIN. Role lain tidak boleh mengelola
   * user (seharusnya sudah ditolak @Roles; ini pertahanan lapis kedua).
   */
  private assertCanManage(
    actor: AuthUser | undefined,
    targetCurrentRole: UserRole | null,
    newRole?: UserRole,
  ) {
    if (!actor) return; // pemanggil internal (seed/script)
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (actor.role !== UserRole.OWNER) {
      throw new ForbiddenException('Tidak memiliki izin mengelola user');
    }
    if (targetCurrentRole === UserRole.SUPER_ADMIN || newRole === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Owner tidak boleh mengelola akun Super Admin');
    }
  }

  async create(createUserDto: CreateUserDto, actor?: AuthUser) {
    const { name, email, phone, password, role = UserRole.CASHIER, outletId, shiftName } = createUserDto;
    this.assertCanManage(actor, null, role);

    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    if (email) {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) throw new ConflictException('Email already exists');
    }

    if (phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone } });
      if (existing) throw new ConflictException('Phone already exists');
    }

    if (outletId) {
      const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
      if (!outlet) {
        throw new NotFoundException('Outlet not found');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role,
        ...(outletId
          ? {
              outletUsers: {
                create: {
                  outletId,
                  shiftName,
                },
              },
            }
          : {}),
      },
      select: {
        id: true, name: true, email: true, phone: true,
        role: true, isActive: true, createdAt: true, updatedAt: true,
        outletUsers: {
          select: {
            outletId: true,
            shiftName: true,
            outlet: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          outletUsers: {
            select: {
              outletId: true,
              shiftName: true,
              outlet: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        outletUsers: {
          select: {
            outletId: true,
            shiftName: true,
            outlet: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        customer: {
          include: {
            wallet: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /** Ubah profil sendiri (field terbatas). */
  async updateMe(userId: string, dto: UpdateMyProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already exists');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, avatarUrl: true },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor?: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    this.assertCanManage(actor, user.role, updateUserDto.role);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: updateUserDto.phone },
      });
      if (existingPhone) {
        throw new ConflictException('Phone already exists');
      }
    }

    const { outletId, shiftName, password, ...userPayload } = updateUserDto;

    if (outletId) {
      const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
      if (!outlet) {
        throw new NotFoundException('Outlet not found');
      }
    }

    const data: any = { ...userPayload };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        outletUsers: {
          select: {
            outletId: true,
            shiftName: true,
            outlet: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (outletId) {
      const currentLink = await this.prisma.outletUser.findFirst({
        where: { userId: id },
      });

      if (!currentLink) {
        await this.prisma.outletUser.create({
          data: {
            userId: id,
            outletId,
            shiftName,
          },
        });
      } else {
        await this.prisma.outletUser.update({
          where: { id: currentLink.id },
          data: {
            outletId,
            shiftName: shiftName ?? currentLink.shiftName,
          },
        });
      }
    } else if (shiftName) {
      await this.prisma.outletUser.updateMany({
        where: { userId: id },
        data: { shiftName },
      });
    }

    const userWithOutlet = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        outletUsers: {
          select: {
            outletId: true,
            shiftName: true,
            outlet: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    return userWithOutlet ?? updatedUser;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User deleted successfully' };
  }
}
