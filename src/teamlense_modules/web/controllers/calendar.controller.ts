import type { Response } from "express";
import type { AuthRequest } from "../../../shared/types";
import { ActivityService } from "../../agent/services/activity.service";

export const getCalendarHeatmap = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const userId = req.auth.role === "MANAGER" && requestedUserId ? requestedUserId : req.auth.userId;

  const year = parseInt(typeof req.query.year === "string" ? req.query.year : "", 10);
  const month = parseInt(typeof req.query.month === "string" ? req.query.month : "", 10);

  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ success: false, message: "Valid year and month (1-12) are required" });
    return;
  }

  try {
    const data = await ActivityService.getCalendarHeatmap(userId, year, month);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Failed to fetch calendar heatmap", error);
    res.status(500).json({ success: false, message: "Unable to fetch calendar data" });
  }
};
