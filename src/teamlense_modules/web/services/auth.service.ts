import { Prisma } from "@prisma/client";
import { env } from "../../../config/env";
import { comparePassword, hashPassword, randomToken, sha256, slugify } from "../../../shared/auth/crypto";
import { signAccessToken, signAgentToken } from "../../../shared/auth/jwt";
import { prismaClient } from "../../../shared/db/prisma-client";
import type { AuthRole } from "../../../shared/types/auth";

const buildUniqueSlug = async (organizationName: string): Promise<string> => {
  const base = slugify(organizationName) || "teamlens-org";
  let candidate = base;
  let suffix = 1;

  for (;;) {
    const existing = await prismaClient.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
};

export class AuthService {
  static async signupManager(input: {
    fullName: string;
    email: string;
    password: string;
    organizationName: string;
  }) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await prismaClient.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new Error("Email is already registered");
    }

    const passwordHash = await hashPassword(input.password);
    const slug = await buildUniqueSlug(input.organizationName);

    const created = await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          slug,
        },
      });

      const user = await tx.user.create({
        data: {
          fullName: input.fullName.trim(),
          email,
          passwordHash,
          role: "MANAGER",
          status: "ACTIVE",
          organizationId: organization.id,
        },
      });

      return { organization, user };
    });

    const accessToken = signAccessToken({
      userId: created.user.id,
      organizationId: created.organization.id,
      role: created.user.role,
    });

    return {
      accessToken,
      user: {
        id: created.user.id,
        fullName: created.user.fullName,
        email: created.user.email,
        role: created.user.role,
        organizationId: created.user.organizationId,
      },
      organization: {
        id: created.organization.id,
        name: created.organization.name,
        slug: created.organization.slug,
      },
    };
  }

  static async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();

    const user = await prismaClient.user.findUnique({
      where: { email },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const validPassword = await comparePassword(input.password, user.passwordHash);
    if (!validPassword) {
      throw new Error("Invalid email or password");
    }

    if (user.status !== "ACTIVE") {
      throw new Error("User account is not active");
    }

    const accessToken = signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      organization: user.organization,
    };
  }

  static async me(userId: string) {
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      organization: user.organization,
    };
  }

  static async createAgentConnectToken(input: {
    userId: string;
    organizationId: string;
    role: AuthRole;
    label?: string;
  }) {
    const tokenId = randomToken(16);
    const agentToken = signAgentToken({
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      tokenId,
    });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await prismaClient.agentToken.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        tokenHash: sha256(agentToken),
        label: input.label?.trim() || "Desktop Agent",
        expiresAt,
      },
    });

    return {
      agentToken,
      expiresAt: expiresAt.toISOString(),
      connectUrl: `${env.webAppUrl}/agent/connect?token=${encodeURIComponent(agentToken)}`,
    };
  }

  static async getTeamUsers(organizationId: string) {
    const users = await prismaClient.user.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return users.map((user: {
      id: string;
      fullName: string;
      email: string;
      role: AuthRole;
      status: "ACTIVE" | "INVITED" | "DISABLED";
      createdAt: Date;
    }) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    }));
  }
}
