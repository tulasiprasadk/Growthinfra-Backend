import { Controller, Get, Query, Res, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SocialService } from '../services/social.service';
import { AdminKeyGuard } from '../guards/admin-key.guard';

@Controller('auth/unsplash')
export class UnsplashController {
  private readonly logger = new Logger(UnsplashController.name);
  constructor(private config: ConfigService, private social: SocialService) {}

  @Get()
  redirectToUnsplash(@Res() res: Response) {
    const clientId = this.config.get<string>('UNSPLASH_CLIENT_ID') || this.config.get<string>('UNSPLASH_ACCESS_KEY');
    const redirectUri = this.config.get<string>('UNSPLASH_REDIRECT_URI');
    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: 'Unsplash client not configured on server' });
    }

    // Use a space-separated scope list and URL-encode it.
    // Default to `public` to match the common Unsplash app permission.
    const scopes = this.config.get<string>('UNSPLASH_OAUTH_SCOPES') || 'public';
    const scopeParam = encodeURIComponent(scopes);
    const url = `https://unsplash.com/oauth/authorize?client_id=${encodeURIComponent(
      clientId,
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopeParam}`;
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const clientId = this.config.get<string>('UNSPLASH_CLIENT_ID') || this.config.get<string>('UNSPLASH_ACCESS_KEY');
    const clientSecret = this.config.get<string>('UNSPLASH_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('UNSPLASH_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn('Unsplash OAuth attempted but server not configured');
      return res.status(500).json({ error: 'Unsplash client/secret not configured on server' });
    }

    try {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      });

      const tokenRes = await fetch('https://unsplash.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const tokenJson = await tokenRes.json();


      // Persist token server-side
      try {
        await this.social.persistUnsplashAccount(tokenJson);
      } catch (e) {
        this.logger.warn('Could not persist Unsplash token: ' + String(e));
      }

      // Return a friendly success page (do not expose secrets)
      return res.send('<html><body><h3>Unsplash connected successfully.</h3><p>You can close this window.</p></body></html>');
    } catch (err) {
      this.logger.error('Unsplash callback error:' + String(err));
      return res.status(500).json({ error: String(err) });
    }
  }

  @Get('admin/search')
  @UseGuards(AdminKeyGuard)
  async adminSearch(@Query('q') q: string, @Query('per_page') perPage = '6') {

    const query = q || 'nature';

    // Try to find a saved Unsplash token
    let token: string | null = null;
    try {
      const account = await this.social.getUnsplashAccount();
      if (account && account.accessToken) token = account.accessToken;
    } catch (e) {
      this.logger.warn('Error checking saved Unsplash account: ' + String(e));
    }

    const clientId = this.config.get<string>('UNSPLASH_CLIENT_ID') || this.config.get<string>('UNSPLASH_ACCESS_KEY');
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${encodeURIComponent(perPage)}`;

    const headers: any = { 'Accept-Version': 'v1' };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(url + (token ? '' : `&client_id=${encodeURIComponent(clientId || '')}`), { headers });
      const json = await res.json();
      return json;
    } catch (e) {
      this.logger.error('Unsplash search error: ' + String(e));
      return { error: String(e) };
    }
  }

  @Get('admin/refresh')
  @UseGuards(AdminKeyGuard)
  async adminRefresh() {

    // Find stored Unsplash account (with decrypted tokens)
    const account = await this.social.getUnsplashAccount();
    if (!account || !(account as any).refreshToken) {
      return { ok: false, message: 'No stored refresh token found' };
    }

    const clientId = this.config.get<string>('UNSPLASH_CLIENT_ID') || this.config.get<string>('UNSPLASH_ACCESS_KEY');
    const clientSecret = this.config.get<string>('UNSPLASH_CLIENT_SECRET');
    if (!clientId || !clientSecret) return { ok: false, message: 'Server not configured with Unsplash client/secret' };

    try {
      const updated = await this.social.refreshUnsplashAccount(account);
      if (!updated) return { ok: false, message: 'Refresh failed' };
      return { ok: true, message: 'Refreshed', account: { id: updated.id, provider: updated.provider } };
    } catch (e) {
      this.logger.error('Unsplash refresh error: ' + String(e));
      return { ok: false, message: String(e) };
    }
  }
}
