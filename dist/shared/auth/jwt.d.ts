import type { AnyTokenClaims, AuthRole } from "../types/auth";
export declare const signAccessToken: (payload: {
    userId: string;
    organizationId: string;
    role: AuthRole;
}) => string;
export declare const signAgentToken: (payload: {
    userId: string;
    organizationId: string;
    role: AuthRole;
    tokenId: string;
}) => string;
export declare const verifyToken: (token: string) => AnyTokenClaims;
//# sourceMappingURL=jwt.d.ts.map