import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { Prisma, UserRole } from "@prisma/client";
import { AuthUser } from "../../common/auth/access-policy";
import { normalizePhone, phoneCandidates } from "../../common/utils/phone.util";
import {
  SessionRevokeReason,
  revokeUserSessions,
} from "../../common/auth/sessions";

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
      throw new ForbiddenException("Tidak memiliki izin mengelola user");
    }
    if (
      targetCurrentRole === UserRole.SUPER_ADMIN ||
      newRole === UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        "Owner tidak boleh mengelola akun Super Admin",
      );
    }
  }

  /** Batch 5 (T6): nomor HP disimpan kanonik `628…`; kosong → null. */
  private canonicalPhone(phone?: string | null): string | null {
    if (phone === undefined || phone === null || phone.trim() === "")
      return null;
    const p = normalizePhone(phone);
    if (!p) throw new BadRequestException("Nomor HP tidak valid");
    return p;
  }

  /** Nomor sudah dipakai user lain (dalam format apa pun)? */
  private async assertPhoneFree(phone: string, exceptUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        phone: { in: phoneCandidates(phone) },
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Phone already exists");
  }

  async create(createUserDto: CreateUserDto, actor?: AuthUser) {
    const {
      name,
      email,
      password,
      role = UserRole.CASHIER,
      outletId,
      shiftName,
    } = createUserDto;
    this.assertCanManage(actor, null, role);
    const phone = this.canonicalPhone(createUserDto.phone);

    if (!email && !phone) {
      throw new BadRequestException("Email or phone is required");
    }

    if (email) {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) throw new ConflictException("Email already exists");
    }

    if (phone) await this.assertPhoneFree(phone);

    if (outletId) {
      const outlet = await this.prisma.outlet.findUnique({
        where: { id: outletId },
      });
      if (!outlet) {
        throw new NotFoundException("Outlet not found");
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        passwordChangedAt: new Date(),
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

    return user;
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    // Kelola Staff: hanya akun staf aktif-terdaftar — pelanggan dikelola di
    // Kelola Member, akun yang dihapus (dianonimkan) tidak ditampilkan.
    const where: Prisma.UserWhereInput = { role: { not: UserRole.CUSTOMER }, deletedAt: null };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
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
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
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
      throw new NotFoundException("User not found");
    }

    return user;
  }

  /** Ubah profil sendiri (field terbatas). */
  async updateMe(userId: string, dto: UpdateMyProfileDto & { phone?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (dto.name !== undefined && dto.name.trim().length < 2) {
      throw new BadRequestException("Nama minimal 2 karakter");
    }
    // Nomor HP = identitas login OTP; hanya diterima bila tidak berubah
    // (app lama selalu mengirim nomor yang sama).
    if (
      dto.phone !== undefined &&
      dto.phone !== user.phone &&
      (normalizePhone(dto.phone) === null ||
        normalizePhone(dto.phone) !== normalizePhone(user.phone))
    ) {
      throw new BadRequestException("Nomor HP tidak bisa diubah dari aplikasi");
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException("Email already exists");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor?: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    this.assertCanManage(actor, user.role, updateUserDto.role);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (existingEmail) {
        throw new ConflictException("Email already exists");
      }
    }

    const newPhone = updateUserDto.phone
      ? this.canonicalPhone(updateUserDto.phone)
      : undefined;
    if (newPhone && newPhone !== normalizePhone(user.phone)) {
      await this.assertPhoneFree(newPhone, id);
    }

    const { outletId, shiftName, password, ...userPayload } = updateUserDto;

    if (outletId) {
      const outlet = await this.prisma.outlet.findUnique({
        where: { id: outletId },
      });
      if (!outlet) {
        throw new NotFoundException("Outlet not found");
      }
    }

    const data: any = { ...userPayload };
    if (newPhone) data.phone = newPhone;
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
      data.passwordChangedAt = new Date();
      data.failedLoginAttempts = 0;
      data.loginLockedUntil = null;
    }

    // Batch 5: perubahan yang memengaruhi hak akses → semua sesi user dicabut
    // (access token langsung ditolak JwtStrategy), dalam transaksi yang sama.
    const revokeReason =
      updateUserDto.isActive === false && user.isActive
        ? SessionRevokeReason.ACCOUNT_DEACTIVATED
        : password
          ? SessionRevokeReason.ADMIN_PASSWORD_SET
          : updateUserDto.role && updateUserDto.role !== user.role
            ? SessionRevokeReason.ROLE_CHANGED
            : null;

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
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

      if (revokeReason) {
        await revokeUserSessions(tx, id, revokeReason);
        await tx.auditLog.create({
          data: {
            userId: actor?.userId ?? null,
            action: "AUTH_SESSIONS_REVOKED_BY_ADMIN",
            entity: "User",
            entityId: id,
            changes: { reason: revokeReason },
          },
        });
      }
      return updated;
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
      throw new NotFoundException("User not found");
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err) {
      // Batch 5: user dengan riwayat (order, ledger, audit) tidak bisa dihapus
      // permanen → 409 yang jelas (sebelumnya 500). Nonaktifkan saja.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2003", "P2014"].includes(err.code)
      ) {
        throw new ConflictException(
          "User memiliki riwayat transaksi sehingga tidak bisa dihapus. Nonaktifkan akun ini.",
        );
      }
      throw err;
    }

    return { message: "User deleted successfully" };
  }
}
