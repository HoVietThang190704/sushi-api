import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseResponse } from '../dto/base-response.dto';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, BaseResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<BaseResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode || 200;

    return next.handle().pipe(
      map((data) => {
        // Nếu response đã có dạng BaseResponse thì giữ nguyên
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'timestamp' in data
        ) {
          return data;
        }

        let message = 'Operation successful';
        let finalData = data;

        // Nếu Controller trả về object có thuộc tính message riêng
        if (
          data &&
          typeof data === 'object' &&
          'message' in data &&
          typeof data.message === 'string'
        ) {
          message = data.message;
          if ('tokens' in data || 'user' in data) {
            finalData = data;
          }
        }

        return {
          success: true,
          statusCode,
          message,
          data: finalData !== undefined ? finalData : null,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
