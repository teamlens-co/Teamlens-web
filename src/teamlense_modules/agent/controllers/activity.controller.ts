import type { Request, Response } from "express";
import { z } from "zod";
import { ActivityService } from "../services/activity.service";

const clockInSchema = z.object({
  timestamp: z.string().datetime().optional(),
  latitude: z.coerce.number().finite().optional(),
  longitude: z.coerce.number().finite().optional(),
  locationSource: z.enum(["gps", "ip"]).optional(),
  accuracyMeters: z.coerce.number().positive().finite().optional(),
});

const clockOutSchema = z.object({
  sessionId: z.string().min(1).optional(),
  timestamp: z.string().datetime().optional(),
});

const activitySchema = z.object({
  sessionId: z.string().min(1).optional(),
  mouseMoves: z.number().int().min(0),
  keyPresses: z.number().int().min(0),
  capturedAt: z.string().datetime().optional(),
});

export const getActiveSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || req.auth.tokenType !== "agent") {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const userId = req.auth.userId;

  try {
    const session = await ActivityService.getActiveSession(userId);

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Failed to fetch active session", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch active session",
    });
  }
};

export const clockIn = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || req.auth.tokenType !== "agent") {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const parsed = clockInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid clock-in payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const payload = {
      userId: req.auth.userId,
      ...(parsed.data.timestamp ? { timestamp: parsed.data.timestamp } : {}),
      ...(parsed.data.latitude != null ? { latitude: parsed.data.latitude } : {}),
      ...(parsed.data.longitude != null ? { longitude: parsed.data.longitude } : {}),
      ...(parsed.data.locationSource ? { locationSource: parsed.data.locationSource } : {}),
      ...(parsed.data.accuracyMeters != null ? { accuracyMeters: parsed.data.accuracyMeters } : {}),
    };

    const session = await ActivityService.clockIn(payload, req.auth.organizationId);

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Failed to clock in", error);

    res.status(500).json({
      success: false,
      message: "Unable to start work session",
    });
  }
};

export const clockOut = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || req.auth.tokenType !== "agent") {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const parsed = clockOutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid clock-out payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const payload = {
      userId: req.auth.userId,
      ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
      ...(parsed.data.timestamp ? { timestamp: parsed.data.timestamp } : {}),
    };

    const session = await ActivityService.clockOut(payload);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "No active session found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Failed to clock out", error);

    res.status(500).json({
      success: false,
      message: "Unable to close work session",
    });
  }
};

export const createActivity = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || req.auth.tokenType !== "agent") {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid activity payload",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const payload = {
      userId: req.auth.userId,
      mouseMoves: parsed.data.mouseMoves,
      keyPresses: parsed.data.keyPresses,
      ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
      ...(parsed.data.capturedAt ? { capturedAt: parsed.data.capturedAt } : {}),
    };

    const activity = await ActivityService.create(payload);

    res.status(201).json({
      success: true,
      data: activity,
    });
  } catch (error) {
    console.error("Failed to create activity", error);

    res.status(500).json({
      success: false,
      message: "Unable to create activity log",
    });
  }
};
