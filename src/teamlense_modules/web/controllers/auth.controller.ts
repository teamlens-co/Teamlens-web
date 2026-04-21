import type { Request, Response } from "express";
import type { AuthRequest } from "../../../shared/types";
import { z } from "zod";
import { AuthService } from "../services/auth.service";
import type { AuthRole } from "../../../shared/types/auth";

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

const setAuthCookie = (req: Request, res: Response, token: string): void => {
  res.cookie("teamlens_access_token", token, {
    ...baseCookieOptions,
    secure: shouldUseSecureCookie(req),
    maxAge: 1000 * 60 * 60,
  });
};

const clearAuthCookie = (req: Request, res: Response): void => {
  res.clearCookie("teamlens_access_token", {
    ...baseCookieOptions,
    secure: shouldUseSecureCookie(req),
  });
};

const managerSignupSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  organizationName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const connectAgentSchema = z.object({
  label: z.string().min(2).max(60).optional(),
});

export const signupManager = async (req: Request, res: Response): Promise<void> => {
  const parsed = managerSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid signup payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const result = await AuthService.signupManager(parsed.data);

    setAuthCookie(req, res, result.accessToken);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign up manager";
    const statusCode = message.includes("already") ? 409 : 500;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid login payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const result = await AuthService.login(parsed.data);

    setAuthCookie(req, res, result.accessToken);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to login";
    const statusCode = message.includes("Invalid") || message.includes("not active") ? 401 : 500;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  clearAuthCookie(req, res);

  res.status(200).json({
    success: true,
    message: "Logged out",
  });
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const me = await AuthService.me(req.auth.userId);

    res.status(200).json({
      success: true,
      data: me,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to get profile";

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const createAgentConnectToken = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const parsed = connectAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid agent connect payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const payload = {
      userId: req.auth.userId,
      organizationId: req.auth.organizationId,
      role: req.auth.role as AuthRole,
      ...(parsed.data.label ? { label: parsed.data.label } : {}),
    };

    const tokenData = await AuthService.createAgentConnectToken(payload);

    res.status(201).json({
      success: true,
      data: tokenData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create agent token";

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getTeamUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const users = await AuthService.getTeamUsers(req.auth.organizationId);

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to get team users";

    res.status(500).json({
      success: false,
      message,
    });
  }
};