import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(
    private config: ConfigService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const required = this.config.get<string>('ADMIN_KEY') || this.config.get<string>('UNSPLASH_ADMIN_KEY');
    const authorization = req.headers.authorization || '';
    const header = req.headers['x-admin-key'] || req.headers['x_admin_key'];
    const query = req.query?.admin_key;
    const provided = header || query;

    try {
      const user = await this.authService.getUserFromAuthorization(authorization);
      if (!user?.isAdmin) {
        return false;
      }
    } catch {
      return false;
    }

    if (!required) return true;
    return !!(provided && provided === required);
  }
}
