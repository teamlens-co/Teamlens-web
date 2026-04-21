import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import type {
  AccessTokenClaims,
  AgentTokenClaims,
  AnyTokenClaims,
  AuthRole,
} from "../types/auth";

const asExpiresIn = (value: string): NonNullable<jwt.SignOptions["expiresIn"]> => {
  return value as NonNullable<jwt.SignOptions["expiresIn"]>;
};

const ensureSecret = (): string => {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is missing. Add it to backend/.env");
  }

  return env.jwtSecret;
};

export const signAccessToken = (payload: {
  userId: string;
  organizationId: string;
  role: AuthRole;
}): string => {
  const claims: AccessTokenClaims = {
    sub: payload.userId,
    orgId: payload.organizationId,
    role: payload.role,
    type: "access",
  };

  return jwt.sign(claims, ensureSecret(), {
    expiresIn: asExpiresIn(env.jwtAccessTtl),
  });
};

export const signAgentToken = (payload: {
  userId: string;
  organizationId: string;
  role: AuthRole;
  tokenId: string;
}): string => {
  const claims: AgentTokenClaims = {
    sub: payload.userId,
    orgId: payload.organizationId,
    role: payload.role,
    type: "agent",
    jti: payload.tokenId,
  };

  return jwt.sign(claims, ensureSecret(), {
    expiresIn: asExpiresIn(env.jwtAgentTtl),
  });
};

export const verifyToken = (token: string): AnyTokenClaims => {
  return jwt.verify(token, ensureSecret()) as AnyTokenClaims;
};
