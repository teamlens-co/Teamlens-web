import type { AuthRole } from "../../../shared/types/auth";
export declare class AuthService {
    static signupManager(input: {
        fullName: string;
        email: string;
        password: string;
        organizationName: string;
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
    static login(input: {
        email: string;
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
    static me(userId: string): Promise<{
        id: string;
        fullName: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        organization: {
            id: string;
            name: string;
            slug: string;
        };
    }>;
    static createAgentConnectToken(input: {
        userId: string;
        organizationId: string;
        role: AuthRole;
        label?: string;
    }): Promise<{
        agentToken: string;
        expiresAt: string;
        connectUrl: string;
    }>;
    static getTeamUsers(organizationId: string): Promise<{
        createdAt: string;
        id: string;
        fullName: string;
        email: string;
        role: AuthRole;
        status: "ACTIVE" | "INVITED" | "DISABLED";
    }[]>;
}
//# sourceMappingURL=auth.service.d.ts.map