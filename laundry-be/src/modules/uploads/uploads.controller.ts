import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UploadsService } from './uploads.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotFoundException } from '@nestjs/common';

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageSize = 10 * 1024 * 1024;

function fileStorageFactory(destination: string) {
  return diskStorage({
    destination,
    filename: (_req, file, cb) => {
      const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
}

const imageUploadOptions = (destination: string) => ({
  storage: fileStorageFactory(destination),
  limits: { fileSize: maxImageSize },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!allowedImageMimeTypes.includes(file.mimetype)) {
      callback(
        new BadRequestException('Hanya file JPEG, PNG, dan WebP yang diizinkan'),
        false,
      );
      return;
    }
    callback(null, true);
  },
});

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('profile/:userId')
  @ApiOperation({ summary: 'Upload user profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', imageUploadOptions('uploads/profiles')),
  )
  async uploadProfilePhoto(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    // Hanya boleh upload foto milik sendiri.
    if (req.user?.userId !== userId) {
      throw new BadRequestException('Tidak boleh mengubah foto profil user lain');
    }

    this.uploadsService.validateImageFile(file);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const url = this.uploadsService.getProfilePhotoUrl(file.filename);

    // Simpan URL ke profil user agar bisa ditampilkan kembali.
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return {
      message: 'Profile photo uploaded successfully',
      filename: file.filename,
      url,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  @Post('image')
  @ApiOperation({ summary: 'Upload gambar umum (banner/pop-up) — kembalikan URL' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', imageUploadOptions('uploads/images')),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    this.uploadsService.validateImageFile(file);
    const url = this.uploadsService.getImageUrl(
      file.filename,
      `${req.protocol}://${req.get('host')}`,
    );
    return {
      message: 'Image uploaded successfully',
      filename: file.filename,
      url,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  @Post('payment/:orderId/proof')
  @ApiOperation({ summary: 'Upload payment proof for an order' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', imageUploadOptions('uploads/payments')),
  )
  async uploadPaymentProof(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    this.uploadsService.validateImageFile(file);

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const url = this.uploadsService.getPaymentProofUrl(file.filename);

    return {
      message: 'Payment proof uploaded successfully',
      orderId,
      filename: file.filename,
      url,
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}
