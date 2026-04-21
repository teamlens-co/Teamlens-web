"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentAuthService = void 0;
const env_1 = require("../../../config/env");
const crypto_1 = require("../../../shared/auth/crypto");
const jwt_1 = require("../../../shared/auth/jwt");
const prisma_client_1 = require("../../../shared/db/prisma-client");
const resolveAgentExpiry = () => {
    const ttl = env_1.env.jwtAgentTtl.trim().toLowerCase();
    const now = Date.now();
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) {
        return new Date(now + 1000 * 60 * 60 * 24 * 30);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === "s" ? 1000 :
        unit === "m" ? 1000 * 60 :
            unit === "h" ? 1000 * 60 * 60 :
                1000 * 60 * 60 * 24;
    return new Date(now + value * multiplier);
};
class AgentAuthService {
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
        const tokenId = (0, crypto_1.randomToken)(16);
        const agentToken = (0, jwt_1.signAgentToken)({
            userId: user.id,
            organizationId: user.organizationId,
            role: user.role,
            tokenId,
        });
        const expiresAt = resolveAgentExpiry();
        await prisma_client_1.prismaClient.agentToken.create({
            data: {
                organizationId: user.organizationId,
                userId: user.id,
                tokenHash: (0, crypto_1.sha256)(agentToken),
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
exports.AgentAuthService = AgentAuthService;
//# sourceMappingURL=agent-auth.service.js.map