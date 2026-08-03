import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function keysToCamel(obj: any): any {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(keysToCamel);
  return Object.keys(obj).reduce((acc, key) => {
    acc[toCamel(key)] = keysToCamel(obj[key]);
    return acc;
  }, {} as any);
}

export class GrpcTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToRpc();
    const data = ctx.getData();
    if (data && typeof data === 'object') {
      ctx.getData = () => keysToCamel(data);
    }
    return next.handle().pipe(map((d) => d));
  }
}
