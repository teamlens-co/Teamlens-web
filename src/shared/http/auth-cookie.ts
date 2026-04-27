import type { Request, Response } from "express";

type SameSitePolicy = "lax" | "strict" | "none";

const resolveSameSite = (): SameSitePolicy => {
  const raw = process.env.COOKIE_SAME_SITE?.trim().toLowerCase();
  if (raw === "strict" || raw === "none") {
    return raw;
  }
  return "lax";
};

const resolveCookieDomain = (): string | undefined => {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return domain && domain.length > 0 ? domain : undefined;
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
  const sameSite = resolveSameSite();
  const secure = sameSite === "none" ? true : shouldUseSecureCookie(req);
  const domain = resolveCookieDomain();

  res.cookie("teamlens_access_token", token, {
    httpOnly: true,
    sameSite,
    path: "/",
    secure,
    ...(domain ? { domain } : {}),
    maxAge: 1000 * 60 * 60,
  });
};

export const clearAuthCookie = (req: Request, res: Response): void => {
  const sameSite = resolveSameSite();
  const secure = sameSite === "none" ? true : shouldUseSecureCookie(req);
  const domain = resolveCookieDomain();

  res.clearCookie("teamlens_access_token", {
    httpOnly: true,
    sameSite,
    path: "/",
    secure,
    ...(domain ? { domain } : {}),
  });
};
