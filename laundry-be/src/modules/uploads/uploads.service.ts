import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class UploadsService {
  constructor(private configService: ConfigService) {}

  getProfilePhotoUrl(filename: string): string {
    const port = this.configService.get<number>('APP_PORT', 3000);
    return `http://localhost:${port}/uploads/profiles/${filename}`;
  }

  getPaymentProofUrl(filename: string): string {
    const port = this.configService.get<number>('APP_PORT', 3000);
    return `http://localhost:${port}/uploads/payments/${filename}`;
  }

  /** URL gambar umum (mis. banner/pop-up) yang diunggah admin. */
  getImageUrl(filename: string, requestBaseUrl?: string): string {
    const configuredBaseUrl = this.configService
      .get<string>('PUBLIC_BASE_URL')
      ?.replace(/\/+$/, '');
    if (configuredBaseUrl) {
      return `${configuredBaseUrl}/uploads/images/${filename}`;
    }
    if (requestBaseUrl) {
      return `${requestBaseUrl.replace(/\/+$/, '')}/uploads/images/${filename}`;
    }
    const port = this.configService.get<number>('APP_PORT', 3000);
    return `http://localhost:${port}/uploads/images/${filename}`;
  }

  deleteFile(filePath: string): void {
    const absolutePath = path.join(process.cwd(), filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }

  validateImageFile(file: Express.Multer.File): void {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed');
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('Ukuran file maksimal 10 MB');
    }
  }
}
