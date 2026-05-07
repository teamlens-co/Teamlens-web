import type { Response } from "express";
import type { AuthRequest } from "../../../shared/types";
import { DashboardService } from "../services/dashboard.service";
import { z } from "zod";
import { UsageService } from "../../agent/services/usage.service";

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
  } else if (req.query.range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (req.query.range === "week") {
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    // Default to last 7 days
    start.setDate(end.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
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

const manualTimeStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
const createManualTimeRequestSchema = z.object({
  userId: z.string().min(1).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().trim().min(3).max(1000),
});
const reviewManualTimeRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(1000).optional(),
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

export const listManualTimeRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const parsedStatus = typeof req.query.status === "string" ? manualTimeStatusSchema.safeParse(req.query.status.toUpperCase()) : null;

  try {
    const listParams: {
      organizationId: string;
      requestingUserId: string;
      isManager: boolean;
      status?: "PENDING" | "APPROVED" | "REJECTED";
    } = {
      organizationId: req.auth.organizationId,
      requestingUserId: req.auth.userId,
      isManager: req.auth.role === "MANAGER",
    };
    if (parsedStatus?.success) listParams.status = parsedStatus.data;

    const requests = await DashboardService.listManualTimeRequests(listParams);

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("Failed to fetch manual time requests", error);
    res.status(500).json({ success: false, message: "Unable to fetch manual time requests" });
  }
};

export const createManualTimeRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const parsed = createManualTimeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  try {
    const createParams: {
      organizationId: string;
      requestingUserId: string;
      isManager: boolean;
      userId?: string;
      startAt: Date;
      endAt: Date;
      reason: string;
    } = {
      organizationId: req.auth.organizationId,
      requestingUserId: req.auth.userId,
      isManager: req.auth.role === "MANAGER",
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      reason: parsed.data.reason,
    };
    if (parsed.data.userId) createParams.userId = parsed.data.userId;

    const request = await DashboardService.createManualTimeRequest(createParams);

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    console.error("Failed to create manual time request", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to create manual time request",
    });
  }
};

export const reviewManualTimeRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth || req.auth.role !== "MANAGER") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const parsed = reviewManualTimeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  const requestId = req.params.id;
  if (typeof requestId !== "string" || requestId.length === 0) {
    res.status(400).json({ success: false, message: "Missing request id" });
    return;
  }

  try {
    const reviewParams: {
      organizationId: string;
      managerId: string;
      requestId: string;
      status: "APPROVED" | "REJECTED";
      reviewNote?: string;
    } = {
      organizationId: req.auth.organizationId,
      managerId: req.auth.userId,
      requestId,
      status: parsed.data.status,
    };
    if (parsed.data.reviewNote) reviewParams.reviewNote = parsed.data.reviewNote;

    const request = await DashboardService.reviewManualTimeRequest(reviewParams);

    res.status(200).json({ success: true, data: request });
  } catch (error) {
    console.error("Failed to review manual time request", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to review manual time request",
    });
  }
};

export const getActivityTimeline = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  let start = new Date();
  let end = new Date();

  if (typeof req.query.startDate === "string" && typeof req.query.endDate === "string") {
    start = new Date(req.query.startDate);
    end = new Date(req.query.endDate);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  try {
    const timeline = await DashboardService.getActivityTimeline({
      organizationId: req.auth.organizationId,
      requestingUserId: req.auth.userId,
      isManager: req.auth.role === "MANAGER",
      start,
      end,
    });

    res.status(200).json({
      success: true,
      data: timeline,
    });
  } catch (error) {
    console.error("Failed to fetch activity timeline", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch activity timeline",
    });
  }
};

const categorySchema = z.enum(["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"]);
const targetTypeSchema = z.enum(["APP", "DOMAIN", "URL"]);

const classificationRuleSchema = z.object({
  targetType: targetTypeSchema,
  targetValue: z.string().trim().min(1).max(2000),
  category: categorySchema,
});

export const getUsageReport = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const userId = req.auth.role === "MANAGER" && requestedUserId ? requestedUserId : req.auth.userId;
  const start = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : new Date();
  const end = typeof req.query.endDate === "string" ? new Date(req.query.endDate) : new Date();
  const groupBy = typeof req.query.groupBy === "string" ? req.query.groupBy : "total";

  if (!req.query.startDate) start.setHours(0, 0, 0, 0);
  if (!req.query.endDate) end.setHours(23, 59, 59, 999);

  try {
    const report = await UsageService.getUsageReport({
      organizationId: req.auth.organizationId,
      userId,
      start,
      end,
      groupBy: groupBy === "employee" || groupBy === "team" || groupBy === "location" ? groupBy : "total",
    });

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error("Failed to fetch usage report", error);
    res.status(500).json({ success: false, message: "Unable to fetch usage report" });
  }
};

export const listClassificationRules = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const rules = await UsageService.listRules(req.auth.organizationId);
    res.status(200).json({ success: true, data: rules });
  } catch (error) {
    console.error("Failed to fetch classification rules", error);
    res.status(500).json({ success: false, message: "Unable to fetch classification rules" });
  }
};

export const upsertClassificationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth || req.auth.role !== "MANAGER") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const parsed = classificationRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  try {
    const rule = await UsageService.upsertRule({
      organizationId: req.auth.organizationId,
      targetType: parsed.data.targetType,
      targetValue: parsed.data.targetValue,
      category: parsed.data.category,
    });

    res.status(200).json({ success: true, data: rule });
  } catch (error) {
    console.error("Failed to save classification rule", error);
    res.status(500).json({ success: false, message: "Unable to save classification rule" });
  }
};
