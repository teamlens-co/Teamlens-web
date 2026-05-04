import type { Request, Response } from "express";
import { z } from "zod";
import { ScreenshotService } from "../services/screenshot.service";
import path from "path";
import { prisma } from "../../../shared/db/prisma";

const uploadScreenshotSchema = z.object({
  sessionId: z.string().optional(),
  activeApplication: z.string().max(200).optional(),
  windowTitle: z.string().max(500).optional(),
  domain: z.string().max(255).optional(),
  url: z.string().max(2000).optional(),
  projectName: z.string().max(200).optional(),
  capturedAt: z.string().datetime().optional(),
});

export const uploadScreenshot = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || req.auth.tokenType !== "agent") {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  // Check if multer saved the file
  if (!req.file) {
    res.status(400).json({
      success: false,
      message: "No image file provided",
    });
    return;
  }

  const parsed = uploadScreenshotSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid screenshot metadata",
      issues: parsed.error.flatten(),
    });
    return;
  }

  try {
    const users = (await prisma.$queryRawUnsafe(
      `SELECT "full_name" FROM "users" WHERE "id" = $1 LIMIT 1`,
      req.auth.userId,
    )) as Array<{ full_name?: string }>;

    const screenshot = await ScreenshotService.uploadScreenshot({
      userId: req.auth.userId,
      filePath: req.file.path,
      ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
      ...(parsed.data.activeApplication ? { activeApplication: parsed.data.activeApplication } : {}),
      ...(parsed.data.windowTitle ? { windowTitle: parsed.data.windowTitle } : {}),
      ...(parsed.data.domain ? { domain: parsed.data.domain } : {}),
      ...(parsed.data.url ? { url: parsed.data.url } : {}),
      employeeName: users[0]?.full_name ?? req.auth.userId,
      projectName: parsed.data.projectName ?? "Default Project",
      capturedAt: parsed.data.capturedAt ? new Date(parsed.data.capturedAt) : new Date(),
    });

    res.status(201).json({
      success: true,
      data: {
        id: screenshot?.id,
        capturedAt: screenshot?.capturedAt,
      },
    });
  } catch (error) {
    console.error("Failed to upload screenshot", error);

    res.status(500).json({
      success: false,
      message: "Unable to upload screenshot",
    });
  }
};

export const getScreenshots = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth || (req.auth.tokenType !== "access" && req.auth.tokenType !== "agent")) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "50", 10);
  
  const startDate = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : undefined;
  const endDate = typeof req.query.endDate === "string" ? new Date(req.query.endDate) : undefined;

  try {
    const screenshots = await ScreenshotService.getScreenshots({
      userId: userId || req.auth.userId,
      ...(sessionId ? { sessionId } : {}),
      limit: Math.min(limit, 200),
      ...(startDate && !Number.isNaN(startDate.getTime()) ? { startDate } : {}),
      ...(endDate && !Number.isNaN(endDate.getTime()) ? { endDate } : {}),
    });

    res.status(200).json({
      success: true,
      data: screenshots,
    });
  } catch (error) {
    console.error("Failed to fetch screenshots", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch screenshots",
    });
  }
};

export const getScreenshot = async (req: Request, res: Response): Promise<void> => {

  const { id } = req.params;

  if (typeof id !== "string") {
    res.status(400).json({
      success: false,
      message: "Invalid screenshot ID",
    });
    return;
  }

  try {
    const screenshot = await ScreenshotService.getScreenshotById(id);

    if (!screenshot) {
      res.status(404).json({
        success: false,
        message: "Screenshot not found",
      });
      return;
    }

    // Return the image file
    res.sendFile(path.resolve(screenshot.filePath));
  } catch (error) {
    console.error("Failed to fetch screenshot", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch screenshot",
    });
  }
};
