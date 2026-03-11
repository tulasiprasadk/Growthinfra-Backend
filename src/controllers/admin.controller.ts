import {
  Body,
  Controller,
  Delete,
  Headers,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { SocialService } from '../services/social.service';
import { AdminKeyGuard } from '../guards/admin-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../services/auth.service';

class AdminCreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

class UpdateMembershipRoleDto {
  @IsString()
  role!: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  website?: string;
}

class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  website?: string;
}

@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly social: SocialService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Get('overview')
  async overview() {
    const [users, organizations, memberships, reports, socialAccounts] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.organization.count(),
        this.prisma.membership.count(),
        this.safeReportCount(),
        this.prisma.socialAccount.count(),
      ]);

    return {
      users,
      organizations,
      memberships,
      reports,
      socialAccounts,
    };
  }

  @Get('users')
  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return { count: users.length, users };
  }

  @Post('users')
  async createUser(@Body() body: AdminCreateUserDto) {
    const created = await this.authService.adminCreateUser(body);
    return { success: true, ...created };
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    const user = await this.authService.adminUpdateUser(id, body);
    return { success: true, user };
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const currentUser = await this.authService.getUserFromAuthorization(authorization);
    if (currentUser.id === id) {
      throw new ForbiddenException('You cannot delete your own active admin account');
    }

    const deleted = await this.authService.adminDeleteUser(id);
    return { success: true, user: deleted };
  }

  @Patch('memberships/:id')
  async updateMembershipRole(
    @Param('id') id: string,
    @Body() body: UpdateMembershipRoleDto,
  ) {
    const membership = await this.prisma.membership.update({
      where: { id },
      data: {
        role: String(body.role || '').trim().toLowerCase() || 'member',
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { success: true, membership };
  }

  @Delete('memberships/:id')
  async deleteMembership(@Param('id') id: string) {
    const membership = await this.prisma.membership.delete({
      where: { id },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { success: true, membership };
  }

  @Get('organizations')
  async listOrganizations() {
    const organizations = await this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        location: true,
        website: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            socialAccounts: true,
            campaigns: true,
            subscriptions: true,
          },
        },
        memberships: {
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return { count: organizations.length, organizations };
  }

  @Post('organizations')
  async createOrganization(@Body() body: CreateOrganizationDto) {
    const organization = await this.prisma.organization.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || 'Managed from admin panel',
        category: body.category?.trim() || 'general',
        location: body.location?.trim() || 'remote',
        website: body.website?.trim() || '',
      },
    });

    return { success: true, organization };
  }

  @Patch('organizations/:id')
  async updateOrganization(
    @Param('id') id: string,
    @Body() body: UpdateOrganizationDto,
  ) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.category !== undefined ? { category: body.category.trim() } : {}),
        ...(body.location !== undefined ? { location: body.location.trim() } : {}),
        ...(body.website !== undefined ? { website: body.website.trim() } : {}),
      },
    });

    return { success: true, organization };
  }

  @Delete('organizations/:id')
  async deleteOrganization(@Param('id') id: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
            socialAccounts: true,
            campaigns: true,
            subscriptions: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ForbiddenException('Organization not found');
    }

    if (
      existing._count.memberships > 0 ||
      existing._count.socialAccounts > 0 ||
      existing._count.campaigns > 0 ||
      existing._count.subscriptions > 0
    ) {
      throw new ForbiddenException('Organization cannot be deleted while it still has members, accounts, campaigns, or subscriptions');
    }

    await this.prisma.organization.delete({
      where: { id },
    });

    return { success: true, organization: { id: existing.id, name: existing.name } };
  }

  @Get('reports')
  async listReports() {
    const reports = await this.safeReportFindMany();

    const campaignIds = Array.from(
      new Set(reports.map((report) => report.campaignId).filter(Boolean)),
    );
    const campaigns = campaignIds.length
      ? await this.prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: {
            id: true,
            name: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [];
    const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

    return {
      count: reports.length,
      reports: reports.map((report) => ({
        ...report,
        campaign: campaignMap.get(report.campaignId) || null,
      })),
    };
  }

  @Get('social/accounts')
  async listAccounts() {
    const accounts = await this.social.getAllAccounts();
    const redacted = accounts.map((a: any) => ({
      id: a.id,
      provider: a.provider,
      expiresAt: a.expiresAt || null,
      organizationId: a.organizationId || null,
    }));
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
      const accounts = await this.social.getAllAccounts();
      const acc = accounts.find((a: any) => a.id === id || a.provider === id);
      if (!acc) return { success: false, message: 'account not found' };
      const updated = await this.social.refreshSocialAccount(acc as any);
      if (!updated) {
        const lastError = (updated as any)?.lastError || null;
        return {
          success: false,
          account: null,
          error: lastError ? String(lastError) : 'refresh returned no update',
        };
      }
      return {
        success: true,
        account: { id: updated.id, provider: updated.provider },
      };
    } catch (e) {
      this.logger.warn('Refresh account failed: ' + String(e));
      return { success: false, error: String(e) };
    }
  }

  @Get('social/account/:id')
  async getAccount(@Param('id') id: string) {
    const account = await this.social.getAccountById(id);
    if (!account) return { success: false, message: 'not found' };
    const lastError =
      this.social.getLastError(id) || (account as any).lastError || null;
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

  private async safeReportCount() {
    try {
      return await this.prisma.report.count();
    } catch (error) {
      this.logger.warn('Report count unavailable: ' + String(error));
      return 0;
    }
  }

  private async safeReportFindMany() {
    try {
      return await this.prisma.report.findMany({
        orderBy: { generatedAt: 'desc' },
      });
    } catch (error) {
      this.logger.warn('Report list unavailable: ' + String(error));
      return [];
    }
  }
}
