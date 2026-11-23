import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

const GENERIC_ERROR = 'Terjadi kesalahan pada server. Silakan coba lagi.';
const PRISMA_ERRORS: Record<string, { status: number; error: string; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, error: 'Conflict', message: 'Data yang sama sudah ada.' },
  P2003: { status: HttpStatus.CONFLICT, error: 'Conflict', message: 'Data ini masih dipakai oleh data lain sehingga tidak bisa diubah atau dihapus.' },
  P2025: { status: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'Data tidak ditemukan.' },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
        error = (res.error as string) ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Pesan Prisma memuat potongan kode & path file server → jangan dikirim ke klien.
      const mapped = PRISMA_ERRORS[exception.code];
      status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      message = mapped?.message ?? GENERIC_ERROR;
      error = mapped?.error ?? 'Internal Server Error';
      this.logger.error(`Prisma ${exception.code} ${request.method} ${request.url}: ${exception.message}`, exception.stack);
    } else if (exception instanceof Error) {
      message = GENERIC_ERROR;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      success: false,
      error,
      message,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
