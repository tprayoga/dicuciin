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

function fileStorageFactory(destination: string) {
  return diskStorage({
    destination,
    filename: (_req, file, cb) => {
      const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
}

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
    FileInterceptor('file', { storage: fileStorageFactory('uploads/profiles') }),
  )
  async uploadProfilePhoto(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    this.uploadsService.validateImageFile(file);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const url = this.uploadsService.getProfilePhotoUrl(file.filename);

    return {
      message: 'Profile photo uploaded successfully',
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
    FileInterceptor('file', { storage: fileStorageFactory('uploads/payments') }),
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
