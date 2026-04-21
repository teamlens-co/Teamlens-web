import type { Response } from "express";
import type { AuthRequest } from "../../../shared/types";
import { z } from "zod";
import { InviteService } from "../services/invite.service";
import type { AuthRole } from "../../../shared/types/auth";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MANAGER", "EMPLOYEE"]).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(10),
  fullName: z.string().min(2),
  password: z.string().min(8),
});

export const createInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid invite payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const invite = await InviteService.createInvite({
      managerId: req.auth.userId,
      organizationId: req.auth.organizationId,
      email: parsed.data.email,
      role: (parsed.data.role as AuthRole | undefined) ?? "EMPLOYEE",
    });

    res.status(201).json({
      success: true,
      data: invite,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invite";

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const validateInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({
      success: false,
      message: "Missing invite token",
    });
    return;
  }

  try {
    const invite = await InviteService.validateInvite(token);

    res.status(200).json({
      success: true,
      data: invite,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate invite";
    const statusCode = message.includes("expired") || message.includes("active") ? 410 : 404;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const acceptInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid accept-invite payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const result = await InviteService.acceptInvite(parsed.data);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept invite";
    const statusCode =
      message.includes("expired") || message.includes("active") ? 410 :
      message.includes("exists") ? 409 :
      message.includes("not found") ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};
