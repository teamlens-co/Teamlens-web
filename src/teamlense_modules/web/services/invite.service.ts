import { Prisma } from "@prisma/client";
import { env } from "../../../config/env";
import { hashPassword, randomToken } from "../../../shared/auth/crypto";
import { signAccessToken } from "../../../shared/auth/jwt";
import { prismaClient } from "../../../shared/db/prisma-client";
import type { AuthRole } from "../../../shared/types/auth";

export class InviteService {
  static async createInvite(input: {
    managerId: string;
    organizationId: string;
    email: string;
    role?: AuthRole;
  }) {
    const email = input.email.trim().toLowerCase();

    const expiresAt = new Date(Date.now() + env.inviteTtlHours * 60 * 60 * 1000);
    const token = randomToken(24);

    const invite = await prismaClient.inviteToken.create({
      data: {
        organizationId: input.organizationId,
        invitedById: input.managerId,
        email,
        role: input.role ?? "EMPLOYEE",
        token,
        expiresAt,
      },
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      inviteLink: `${env.webAppUrl}/accept-invite?token=${invite.token}`,
    };
  }

  static async validateInvite(token: string) {
    const invite = await prismaClient.inviteToken.findUnique({
      where: { token },
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

    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.status !== "PENDING") {
      throw new Error("Invite is no longer active");
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      await prismaClient.inviteToken.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });

      throw new Error("Invite has expired");
    }

    return {
      token: invite.token,
      email: invite.email,
      role: invite.role,
      organization: invite.organization,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  static async acceptInvite(input: {
    token: string;
    fullName: string;
    password: string;
  }) {
    const invite = await prismaClient.inviteToken.findUnique({
      where: { token: input.token },
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

    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.status !== "PENDING") {
      throw new Error("Invite is no longer active");
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      await prismaClient.inviteToken.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });

      throw new Error("Invite has expired");
    }

    const existingUser = await prismaClient.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);

    const accepted = await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          organizationId: invite.organizationId,
          fullName: input.fullName.trim(),
          email: invite.email,
          passwordHash,
          role: invite.role,
          status: "ACTIVE",
          invitedById: invite.invitedById,
        },
      });

      await tx.inviteToken.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
        },
      });

      return user;
    });

    const accessToken = signAccessToken({
      userId: accepted.id,
      organizationId: accepted.organizationId,
      role: accepted.role,
    });

    return {
      accessToken,
      user: {
        id: accepted.id,
        fullName: accepted.fullName,
        email: accepted.email,
        role: accepted.role,
        organizationId: accepted.organizationId,
      },
      organization: invite.organization,
    };
  }
}
