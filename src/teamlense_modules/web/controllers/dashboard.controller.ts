import type { Response } from "express";
import type { AuthRequest } from "../../../shared/types";
import { DashboardService } from "../services/dashboard.service";
import { z } from "zod";

export const getDashboardAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const userId = req.auth.role === "MANAGER" && requestedUserId ? requestedUserId : req.auth.userId;
  
  let start = new Date();
  let end = new Date();
  
  if (typeof req.query.startDate === "string" && typeof req.query.endDate === "string") {
    start = new Date(req.query.startDate);
    end = new Date(req.query.endDate);
  } else {
    // Default to last 7 days
    start.setDate(end.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  }

  try {
    const analytics = await DashboardService.getAnalytics(userId, start, end);

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error("Failed to fetch dashboard analytics", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard analytics",
    });
  }
};

const manualHoursSchema = z.object({
  userId: z.string().min(1),
  date: z.string(), // "YYYY-MM-DD"
  hours: z.number().positive()
});

export const addManualHours = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth || req.auth.role !== "MANAGER") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const parsed = manualHoursSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  try {
    await DashboardService.addManualHours(parsed.data.userId, parsed.data.date, parsed.data.hours);
    res.status(200).json({ success: true, message: "Manual hours added" });
  } catch (error) {
    console.error("Failed to add manual hours", error);
    res.status(500).json({ success: false, message: "Unable to add manual hours" });
  }
};
