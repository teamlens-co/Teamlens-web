import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { sha256 } from "../auth/crypto";
import { verifyToken } from "../auth/jwt";
import type { AuthContext, AuthRole } from "../types/auth";

type RequestWithAuth = Request & { auth?: AuthContext };

const unauthorized = (res: Response, message = "Unauthorized"): Response => {
  return res.status(401).json({
    success: false,
    message,
  });
};

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim();
};

const extractCookieToken = (req: Request): string | null => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const sessionCookie = cookies.find((item) => item.startsWith("teamlens_access_token="));
  if (!sessionCookie) {
    return null;
  }

  const value = sessionCookie.slice("teamlens_access_token=".length).trim();
  return value.length > 0 ? decodeURIComponent(value) : null;
};

const extractToken = (req: Request): string | null => {
  return extractBearerToken(req) ?? extractCookieToken(req);
};

const assertActiveAgentToken = async (token: string): Promise<boolean> => {
  if (!prisma.$queryRawUnsafe) {
    return false;
  }

  const tokenHash = sha256(token);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "id"
     FROM "agent_tokens"
     WHERE "token_hash" = $1
       AND "status" = 'ACTIVE'
       AND "expires_at" > NOW()
       AND "revoked_at" IS NULL
     LIMIT 1`,
    tokenHash,
  )) as Array<Record<string, unknown>>;

  return rows.length > 0;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    unauthorized(res, "Missing auth token");
    return;
  }

  try {
    const claims = verifyToken(token);

    if (claims.type === "agent") {
      const isActive = await assertActiveAgentToken(token);
      if (!isActive) {
        unauthorized(res, "Agent token is not active");
        return;
      }
    }

    (req as RequestWithAuth).auth = {
      userId: claims.sub,
      organizationId: claims.orgId,
      role: claims.role,
      tokenType: claims.type,
      token,
    };

    next();
  } catch (error) {
    console.error("Auth verification failed", error);
    unauthorized(res, "Invalid or expired token");
  }
};

export const requireRole = (allowedRole: AuthRole) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      unauthorized(res);
      return;
    }

    if (req.auth.role !== allowedRole) {
      res.status(403).json({
        success: false,
        message: "Forbidden",
      });
      return;
    }

    next();
  };
};

export const attachOptionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const claims = verifyToken(token);

    if (claims.type === "agent") {
      const isActive = await assertActiveAgentToken(token);
      if (!isActive) {
        next();
        return;
      }
    }

    (req as RequestWithAuth).auth = {
      userId: claims.sub,
      organizationId: claims.orgId,
      role: claims.role,
      tokenType: claims.type,
      token,
    };
  } catch {
    // Keep optional auth silent.
  }

  next();
};
