import type { Request, Response } from "express";
import { z } from "zod";
import { ScreenshotService } from "../services/screenshot.service";
import path from "path";

const uploadScreenshotSchema = z.object({
  sessionId: z.string().optional(),
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

  const body = req.body || {};
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const capturedAt = typeof body.capturedAt === "string" ? body.capturedAt : undefined;

  try {
    const screenshot = await ScreenshotService.uploadScreenshot({
      userId: req.auth.userId,
      filePath: req.file.path,
      ...(sessionId ? { sessionId } : {}),
      capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
    });

    res.status(201).json({
      success: true,
      data: {
        id: screenshot.id,
        capturedAt: screenshot.capturedAt,
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
