import type { Request, Response } from "express";

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

const shouldUseSecureCookie = (req: Request): boolean => {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return req.secure || proto === "https";
};

export const setAuthCookie = (req: Request, res: Response, token: string): void => {
  res.cookie("teamlens_access_token", token, {
    ...baseCookieOptions,
    secure: shouldUseSecureCookie(req),
    maxAge: 1000 * 60 * 60,
  });
};

export const clearAuthCookie = (req: Request, res: Response): void => {
  res.clearCookie("teamlens_access_token", {
    ...baseCookieOptions,
    secure: shouldUseSecureCookie(req),
  });
};
