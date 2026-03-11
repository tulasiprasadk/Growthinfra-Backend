import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

type AuthPayload = {
  sub: string;
  email: string;
};

type UserWithMemberships = {
  id: string;
  email: string;
  memberships: Array<{
    id: string;
    role: string;
    organization: {
      id: string;
      name: string;
    };
  }>;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private isPublicSignupEnabled() {
    return String(this.config.get<string>('ALLOW_PUBLIC_SIGNUP') || '').toLowerCase() === 'true';
  }

  private getJwtSecret() {
    return this.config.get<string>('JWT_SECRET') || 'growthinfra-dev-secret';
  }

  private signToken(payload: AuthPayload) {
    return jwt.sign(payload, this.getJwtSecret(), { expiresIn: '7d' });
  }

  private verifyToken(token: string): AuthPayload {
    return jwt.verify(token, this.getJwtSecret()) as AuthPayload;
  }

  private sanitizeUser(user: { id: string; email: string }) {
    const memberships = Array.isArray((user as any).memberships)
      ? (user as any).memberships.map((membership: any) => ({
          id: membership.id,
          role: membership.role,
          organization: membership.organization,
        }))
      : [];

    return {
      id: user.id,
      email: user.email,
      memberships,
      isAdmin: memberships.some((membership: any) =>
        ['admin', 'owner'].includes(String(membership.role || '').toLowerCase()),
      ),
    };
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  private verifyPassword(password: string, storedHash: string) {
    const [salt, storedDerived] = (storedHash || '').split(':');
    if (!salt || !storedDerived) {
      return false;
    }

    const incoming = scryptSync(password, salt, 64);
    const existing = Buffer.from(storedDerived, 'hex');

    if (incoming.length !== existing.length) {
      return false;
    }

    return timingSafeEqual(incoming, existing);
  }

  private normalizeRole(role?: string) {
    const value = String(role || 'member').trim().toLowerCase();
    return value || 'member';
  }

  private async getUserRecordById(id: string): Promise<UserWithMemberships | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
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
  }

  async signup(email: string, password: string) {
    if (!this.isPublicSignupEnabled()) {
      throw new ForbiddenException('Public signup is disabled. Contact the administrator for access.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = this.hashPassword(password);
    const orgLabel = normalizedEmail.split('@')[0] || 'growthinfra';

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: `${orgLabel} organization`,
          description: 'Default organization',
          category: 'general',
          location: 'remote',
          website: '',
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'owner',
        },
      });

      const hydrated = await this.getUserRecordById(user.id);
      return hydrated || user;
    });

    const token = this.signToken({ sub: created.id, email: created.email });
    return {
      token,
      user: this.sanitizeUser(created),
    };
  }

  async adminCreateUser(input: {
    email: string;
    password: string;
    organizationId?: string;
    role?: string;
    organizationName?: string;
  }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = this.hashPassword(input.password);
    const membershipRole = this.normalizeRole(input.role);
    const orgLabel = normalizedEmail.split('@')[0] || 'growthinfra';

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      let organizationId = input.organizationId;
      let organizationName = '';

      if (organizationId) {
        const organization = await tx.organization.findUnique({
          where: { id: organizationId },
        });

        if (!organization) {
          throw new NotFoundException('Organization not found');
        }

        organizationName = organization.name;
      } else {
        const organization = await tx.organization.create({
          data: {
            name: input.organizationName?.trim() || `${orgLabel} organization`,
            description: 'Default organization',
            category: 'general',
            location: 'remote',
            website: '',
          },
        });
        organizationId = organization.id;
        organizationName = organization.name;
      }

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId,
          role: membershipRole,
        },
      });

      return {
        user,
        membership,
        organization: {
          id: organizationId,
          name: organizationName,
        },
      };
    });

    return {
      user: this.sanitizeUser(created.user),
      membership: created.membership,
      organization: created.organization,
    };
  }

  async adminUpdateUser(
    userId: string,
    input: {
      email?: string;
      password?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const data: { email?: string; password?: string } = {};

    if (input.email) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email) {
        const duplicate = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (duplicate) {
          throw new ConflictException('Email is already in use');
        }
      }
      data.email = normalizedEmail;
    }

    if (input.password) {
      data.password = this.hashPassword(input.password);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    const hydrated = await this.getUserRecordById(updated.id);
    return this.sanitizeUser(hydrated || updated);
  }

  async adminDeleteUser(userId: string) {
    const existing = await this.getUserRecordById(userId);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.deleteMany({
        where: { userId },
      });
      await tx.user.delete({
        where: { id: userId },
      });
    });

    return {
      id: existing.id,
      email: existing.email,
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = this.verifyPassword(password, user.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.signToken({ sub: user.id, email: user.email });
    const hydrated = await this.getUserRecordById(user.id);
    return {
      token,
      user: this.sanitizeUser(hydrated || user),
    };
  }

  async getMe(token: string) {
    let payload: AuthPayload;

    try {
      payload = this.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.getUserRecordById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async getUserFromAuthorization(authorization?: string) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    return this.getMe(token);
  }

  hasOrganizationAccess(
    user: { memberships?: Array<{ role: string; organization: { id: string } }> },
    organizationId?: string | null,
    allowedRoles?: string[],
  ) {
    if (!organizationId) return false;
    const allowed = (allowedRoles || []).map((role) => role.toLowerCase());
    return (user.memberships || []).some((membership) => {
      const sameOrg = membership.organization?.id === organizationId;
      if (!sameOrg) return false;
      if (!allowed.length) return true;
      return allowed.includes(String(membership.role || '').toLowerCase());
    });
  }
}
