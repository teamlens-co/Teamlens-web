import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import type { AnyTokenClaims } from "../types/auth";

const ensureSecret = (): string => {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is missing. Add it to backend-ws/.env");
  }

  return env.jwtSecret;
};

export const verifyToken = (token: string): AnyTokenClaims => {
  return jwt.verify(token, ensureSecret()) as AnyTokenClaims;
};
