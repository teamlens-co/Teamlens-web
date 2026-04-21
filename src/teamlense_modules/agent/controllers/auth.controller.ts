import type { Request, Response } from "express";
import { z } from "zod";
import { AgentAuthService } from "../services/agent-auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceLabel: z.string().min(2).max(60).optional(),
});

export const loginAgent = async (req: Request, res: Response): Promise<void> => {
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
    const payload = await AgentAuthService.login({
      email: parsed.data.email,
      password: parsed.data.password,
      ...(parsed.data.deviceLabel ? { deviceLabel: parsed.data.deviceLabel } : {}),
    });

    res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to login agent";
    const statusCode = message.includes("Invalid") || message.includes("not active") ? 401 : 500;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};
