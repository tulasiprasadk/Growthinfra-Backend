import { Controller, Get, Delete, Param, Post, UseGuards, Logger } from '@nestjs/common';
import { SocialService } from '../services/social.service';
import { AdminKeyGuard } from '../guards/admin-key.guard';

@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  constructor(private social: SocialService) {}

  @Get('social/accounts')
  async listAccounts() {
    const accounts = await this.social.getAllAccounts();
    // redact sensitive token values
    const redacted = accounts.map((a: any) => ({ id: a.id, provider: a.provider, expiresAt: a.expiresAt || null, organizationId: a.organizationId || null }));
    return { count: redacted.length, accounts: redacted };
  }

  @Delete('social/accounts/:id')
  async deleteAccount(@Param('id') id: string) {
    try {
      const res = await this.social.deleteSocialAccount(id);
      return { success: true, result: res };
    } catch (e) {
      this.logger.warn('Delete social account failed: ' + String(e));
      return { success: false, error: String(e) };
    }
  }

  @Post('social/refresh/:id')
  async refreshAccount(@Param('id') id: string) {
    try {
      // fetch the account
      const accounts = await this.social.getAllAccounts();
      const acc = accounts.find((a: any) => a.id === id || a.provider === id);
      if (!acc) return { success: false, message: 'account not found' };
      const updated = await this.social.refreshSocialAccount(acc as any);
      if (!updated) {
        // try to surface logs or last-error if available
        const lastError = (updated as any)?.lastError || null;
        return { success: false, account: null, error: lastError ? String(lastError) : 'refresh returned no update' };
      }
      return { success: true, account: { id: updated.id, provider: updated.provider } };
    } catch (e) {
      this.logger.warn('Refresh account failed: ' + String(e));
      return { success: false, error: String(e) };
    }
  }

  @Get('social/account/:id')
  async getAccount(@Param('id') id: string) {
    const account = await this.social.getAccountById(id);
    if (!account) return { success: false, message: 'not found' };
    const lastError = this.social.getLastError(id) || (account as any).lastError || null;
    return { success: true, account: { ...(account as any), lastError } };
  }

  @Post('social/sync-instagram')
  async syncInstagram() {
    try {
      const res = await this.social.syncInstagramAccountsFromFacebookPages();
      return { success: true, result: res };
    } catch (e) {
      this.logger.warn('Sync Instagram failed: ' + String(e));
      return { success: false, error: String(e) };
    }
  }
}
