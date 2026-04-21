import type { AuthRole } from "../../../shared/types/auth";
export declare class InviteService {
    static createInvite(input: {
        managerId: string;
        organizationId: string;
        email: string;
        role?: AuthRole;
    }): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.InviteStatus;
        expiresAt: string;
        inviteLink: string;
    }>;
    static validateInvite(token: string): Promise<{
        token: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        organization: {
            id: string;
            name: string;
            slug: string;
        };
        expiresAt: string;
    }>;
    static acceptInvite(input: {
        token: string;
        fullName: string;
        password: string;
    }): Promise<{
        accessToken: string;
        user: {
            id: string;
            fullName: string;
            email: string;
            role: import(".prisma/client").$Enums.UserRole;
            organizationId: string;
        };
        organization: {
            id: string;
            name: string;
            slug: string;
        };
    }>;
}
//# sourceMappingURL=invite.service.d.ts.map