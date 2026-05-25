import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { name, email, phone, password, role = UserRole.CUSTOMER } = registerDto;

    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmail) throw new ConflictException('Email already exists');
    }

    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phone } });
      if (existingPhone) throw new ConflictException('Phone already exists');
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'));
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: { name, email, phone, passwordHash, role },
    });

    if (role === UserRole.CUSTOMER) {
      const memberCode = await this.generateMemberCode();
      await this.prisma.customer.create({
        data: {
          userId: user.id,
          memberCode,
          wallet: { create: { balance: 0 } },
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { passwordHash: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, ...tokens };
  }

  async login(loginDto: LoginDto) {
    const { identifier, password } = loginDto;

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { passwordHash: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, ...tokens };
  }

  async refreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: { include: { wallet: true } },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private async generateTokens(userId: string, email: string | null, role: UserRole) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
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
      const lastSequence = parseInt(lastCustomer.memberCode.split('-')[2]);
      sequence = lastSequence + 1;
    }

    return `MBR-${dateStr}-${sequence.toString().padStart(6, '0')}`;
  }
}
