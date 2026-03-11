import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../services/auth.service';

@Controller('reports')
export class ReportController {
  private readonly logger = new Logger(ReportController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listReports(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getUserFromAuthorization(authorization);
    const organizationIds = Array.from(
      new Set((user.memberships || []).map((membership) => membership.organization.id)),
    ) as string[];

    if (!organizationIds.length) {
      return [];
    }

    try {
      const reports = await this.prisma.report.findMany({
        orderBy: { generatedAt: 'desc' },
      });

      const campaignIds = Array.from(
        new Set(reports.map((report) => report.campaignId).filter(Boolean)),
      );
      const campaigns = campaignIds.length
        ? await this.prisma.campaign.findMany({
            where: {
              id: { in: campaignIds },
              organizationId: { in: organizationIds },
            },
            select: {
              id: true,
              name: true,
              organizationId: true,
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

      return reports
        .filter((report) => campaignMap.has(report.campaignId))
        .map((report) => ({
          ...report,
          campaign: campaignMap.get(report.campaignId) || null,
        }));
    } catch (error) {
      this.logger.warn('Report list unavailable: ' + String(error));
      return [];
    }
  }
}
