import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    const { name, email, phone, password, gender, birthDate, initialBalance = 0 } = createCustomerDto;

    if (!email && !phone) {
      throw new BadRequestException('Email atau nomor telepon wajib diisi');
    }

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        throw new ConflictException('Email sudah terdaftar');
      }
    }

    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phone } });
      if (existingPhone) {
        throw new ConflictException('Nomor telepon sudah terdaftar');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const memberCode = await this.generateMemberCode();

    const customer = await this.prisma.customer.create({
      data: {
        memberCode,
        gender,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        user: {
          create: {
            name,
            email,
            phone,
            passwordHash,
            role: UserRole.CUSTOMER,
          },
        },
        wallet: {
          create: {
            balance: initialBalance,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        wallet: true,
      },
    });

    return customer;
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isActive: true,
            },
          },
          wallet: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count(),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        wallet: true,
        addresses: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async getOrders(id: string, page: number = 1, limit: number = 10) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        skip,
        take: limit,
        include: {
          outlet: true,
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where: { customerId: id } }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWallet(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        wallet: {
          include: {
            transactions: {
              take: 10,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer.wallet;
  }

  private async generateMemberCode(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const lastCustomer = await this.prisma.customer.findFirst({
      where: { memberCode: { startsWith: `MBR-${dateStr}` } },
      orderBy: { createdAt: 'desc' },
    });

    let sequence = 1;
    if (lastCustomer) {
      const parts = lastCustomer.memberCode.split('-');
      const lastSequence = Number(parts[2] || 0);
      sequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
    }

    return `MBR-${dateStr}-${sequence.toString().padStart(6, '0')}`;
  }
}
