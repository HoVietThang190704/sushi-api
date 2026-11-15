import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseResponse } from '../dto/base-response.dto';

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  BaseResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<BaseResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode = response.statusCode || 200;

    return next.handle().pipe(
      map((data: T): BaseResponse<T> => {
        // Nếu response đã có dạng BaseResponse thì giữ nguyên
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'timestamp' in data
        ) {
          return data as unknown as BaseResponse<T>;
        }

        let message = 'Operation successful';
        let finalData: T | null = data !== undefined ? data : null;

        // Nếu Controller trả về object có thuộc tính message riêng
        if (
          data &&
          typeof data === 'object' &&
          'message' in data &&
          typeof (data as { message?: unknown }).message === 'string'
        ) {
          message = (data as { message: string }).message;
          if ('tokens' in data || 'user' in data) {
            finalData = data;
          }
        }

        return {
          success: true,
          statusCode,
          message,
          data: finalData,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
