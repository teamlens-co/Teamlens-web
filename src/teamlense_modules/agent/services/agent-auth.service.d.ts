export declare class AgentAuthService {
    static login(input: {
        email: string;
        password: string;
        deviceLabel?: string;
    }): Promise<{
        token: string;
        expiresAt: string;
        user: {
            id: string;
            fullName: string;
            email: string;
            role: import(".prisma/client").$Enums.UserRole;
        };
        organization: {
            id: string;
            name: string;
            slug: string;
        };
    }>;
}
//# sourceMappingURL=agent-auth.service.d.ts.map