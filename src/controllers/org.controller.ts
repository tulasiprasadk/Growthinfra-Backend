import { Controller, Post, Body, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from '../dto/create-org.dto';

@Controller('org')
export class OrgController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listOrgs() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return orgs;
  }

  @Post()
  async createOrg(@Body() body: CreateOrgDto) {
    const org = await this.prisma.organization.create({
      data: {
        name: body.name,
        description: body.description,
        category: body.category,
        location: body.location,
        website: body.website,
      },
    });

    return {
      id: org.id,
      message: 'Organization onboarded successfully',
    };
  }
}
