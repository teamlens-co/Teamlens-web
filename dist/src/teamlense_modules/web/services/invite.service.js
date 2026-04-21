"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteService = void 0;
const env_1 = require("../../../config/env");
const crypto_1 = require("../../../shared/auth/crypto");
const jwt_1 = require("../../../shared/auth/jwt");
const prisma_client_1 = require("../../../shared/db/prisma-client");
class InviteService {
    static async createInvite(input) {
        const email = input.email.trim().toLowerCase();
        const expiresAt = new Date(Date.now() + env_1.env.inviteTtlHours * 60 * 60 * 1000);
        const token = (0, crypto_1.randomToken)(24);
        const invite = await prisma_client_1.prismaClient.inviteToken.create({
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
            inviteLink: `${env_1.env.webAppUrl}/accept-invite?token=${invite.token}`,
        };
    }
    static async validateInvite(token) {
        const invite = await prisma_client_1.prismaClient.inviteToken.findUnique({
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
            await prisma_client_1.prismaClient.inviteToken.update({
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
    static async acceptInvite(input) {
        const invite = await prisma_client_1.prismaClient.inviteToken.findUnique({
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
            await prisma_client_1.prismaClient.inviteToken.update({
                where: { id: invite.id },
                data: { status: "EXPIRED" },
            });
            throw new Error("Invite has expired");
        }
        const existingUser = await prisma_client_1.prismaClient.user.findUnique({
            where: { email: invite.email },
            select: { id: true },
        });
        if (existingUser) {
            throw new Error("User with this email already exists");
        }
        const passwordHash = await (0, crypto_1.hashPassword)(input.password);
        const accepted = await prisma_client_1.prismaClient.$transaction(async (tx) => {
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
        const accessToken = (0, jwt_1.signAccessToken)({
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
exports.InviteService = InviteService;
//# sourceMappingURL=invite.service.js.map