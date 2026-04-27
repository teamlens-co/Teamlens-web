import { env } from "../../../config/env";
import { comparePassword, randomToken, sha256 } from "../../../shared/auth/crypto";
import { signAgentToken } from "../../../shared/auth/jwt";
import { prismaClient } from "../../../shared/db/prisma-client";

const resolveAgentExpiry = (): Date => {
  const ttl = env.jwtAgentTtl.trim().toLowerCase();
  const now = Date.now();

  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) {
    return new Date(now + 1000 * 60 * 60 * 24 * 30);
  }

  const value = Number(match[1]);
  const unit = match[2];

  const multiplier =
    unit === "s" ? 1000 :
    unit === "m" ? 1000 * 60 :
    unit === "h" ? 1000 * 60 * 60 :
    1000 * 60 * 60 * 24;

  return new Date(now + value * multiplier);
};

export class AgentAuthService {
  static async login(input: { email: string; password: string; deviceLabel?: string }) {
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

    if (user.role !== "EMPLOYEE") {
      throw new Error("Desktop agent login is only available for employees");
    }

    const tokenId = randomToken(16);
    const agentToken = signAgentToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      tokenId,
    });

    const expiresAt = resolveAgentExpiry();

    await prismaClient.agentToken.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: sha256(agentToken),
        label: input.deviceLabel?.trim() || "Desktop Agent",
        expiresAt,
      },
    });

    return {
      token: agentToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      organization: user.organization,
    };
  }
}
