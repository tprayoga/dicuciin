import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { name, email, phone, password, role = UserRole.CASHIER, outletId, shiftName } = createUserDto;

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

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

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
