export type AuthRole = "MANAGER" | "EMPLOYEE";
export type AuthTokenType = "access" | "agent";
export interface AuthContext {
    userId: string;
    organizationId: string;
    role: AuthRole;
    tokenType: AuthTokenType;
    token: string;
}
export interface AccessTokenClaims {
    sub: string;
    orgId: string;
    role: AuthRole;
    type: "access";
    iat?: number;
    exp?: number;
}
export interface AgentTokenClaims {
    sub: string;
    orgId: string;
    role: AuthRole;
    type: "agent";
    jti: string;
    iat?: number;
    exp?: number;
}
export type AnyTokenClaims = AccessTokenClaims | AgentTokenClaims;
//# sourceMappingURL=auth.d.ts.map