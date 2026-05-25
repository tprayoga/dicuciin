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

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must not exceed 5MB');
    }
  }
}
