"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const env_1 = require("../../../config/env");
const crypto_1 = require("../../../shared/auth/crypto");
const jwt_1 = require("../../../shared/auth/jwt");
const prisma_client_1 = require("../../../shared/db/prisma-client");
const buildUniqueSlug = async (organizationName) => {
    const base = (0, crypto_1.slugify)(organizationName) || "teamlens-org";
    let candidate = base;
    let suffix = 1;
    for (;;) {
        const existing = await prisma_client_1.prismaClient.organization.findUnique({
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
class AuthService {
    static async signupManager(input) {
        const email = input.email.trim().toLowerCase();
        const existingUser = await prisma_client_1.prismaClient.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (existingUser) {
            throw new Error("Email is already registered");
        }
        const passwordHash = await (0, crypto_1.hashPassword)(input.password);
        const slug = await buildUniqueSlug(input.organizationName);
        const created = await prisma_client_1.prismaClient.$transaction(async (tx) => {
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
        const accessToken = (0, jwt_1.signAccessToken)({
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
    static async login(input) {
        const email = input.email.trim().toLowerCase();
        const user = await prisma_client_1.prismaClient.user.findUnique({
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
        const validPassword = await (0, crypto_1.comparePassword)(input.password, user.passwordHash);
        if (!validPassword) {
            throw new Error("Invalid email or password");
        }
        if (user.status !== "ACTIVE") {
            throw new Error("User account is not active");
        }
        const accessToken = (0, jwt_1.signAccessToken)({
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
    static async me(userId) {
        const user = await prisma_client_1.prismaClient.user.findUnique({
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
    static async createAgentConnectToken(input) {
        const tokenId = (0, crypto_1.randomToken)(16);
        const agentToken = (0, jwt_1.signAgentToken)({
            userId: input.userId,
            organizationId: input.organizationId,
            role: input.role,
            tokenId,
        });
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
        await prisma_client_1.prismaClient.agentToken.create({
            data: {
                organizationId: input.organizationId,
                userId: input.userId,
                tokenHash: (0, crypto_1.sha256)(agentToken),
                label: input.label?.trim() || "Desktop Agent",
                expiresAt,
            },
        });
        return {
            agentToken,
            expiresAt: expiresAt.toISOString(),
            connectUrl: `${env_1.env.webAppUrl}/agent/connect?token=${encodeURIComponent(agentToken)}`,
        };
    }
    static async getTeamUsers(organizationId) {
        const users = await prisma_client_1.prismaClient.user.findMany({
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
        return users.map((user) => ({
            ...user,
            createdAt: user.createdAt.toISOString(),
        }));
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map