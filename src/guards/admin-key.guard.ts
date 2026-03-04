import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const required = this.config.get<string>('ADMIN_KEY') || this.config.get<string>('UNSPLASH_ADMIN_KEY');
    if (!required) return true; // no admin key configured -> allow (dev)

    const header = req.headers['x-admin-key'] || req.headers['x_admin_key'];
    const query = req.query?.admin_key;
    const provided = header || query;
    return !!(provided && provided === required);
  }
}
