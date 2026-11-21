import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, ClientInfo } from './auth.service';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/** User-agent & IP hanya untuk daftar sesi (informasi), bukan keputusan keamanan. */
function clientInfo(req: any): ClientInfo {
  const ua = req?.headers?.['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua : null,
    ip: typeof req?.ip === 'string' ? req.ip : null,
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  // Rate limit ketat per-IP untuk endpoint sensitif (anti brute-force/spam).
  // OTP request juga punya rate-limit per-nomor berbasis DB (3/jam) di OtpService.
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('otp/request')
  @ApiOperation({ summary: 'Request OTP via WhatsApp (verifikasi nomor)' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto.phone, dto.purpose);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verifikasi OTP — balikin verification token' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyOtp(dto.phone, dto.code, dto.purpose);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register pelanggan (wajib verificationToken dari OTP)' })
  async register(@Body() registerDto: RegisterDto, @Request() req: any) {
    return this.authService.register(registerDto, clientInfo(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login user (membuat sesi baru)' })
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    return this.authService.login(loginDto, clientInfo(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token (rotasi; pemakaian ulang mencabut sesi)' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Request() req: any) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken, clientInfo(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  @ApiOperation({ summary: 'Reset password via OTP (wajib verificationToken RESET_PASSWORD)' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/change')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ganti password (wajib password lama; perangkat lain dikeluarkan)' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — cabut sesi ini' })
  async logout(@Request() req: any, @Body() logoutDto: LogoutDto) {
    return this.authService.logout(req.user, logoutDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout dari semua perangkat' })
  async logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Daftar sesi aktif milik sendiri' })
  async sessions(@Request() req: any) {
    return this.authService.listSessions(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cabut salah satu sesi milik sendiri' })
  async revokeSession(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.authService.revokeOwnSession(req.user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@Request() req: any) {
    return this.authService.getMe(req.user.userId);
  }
}
