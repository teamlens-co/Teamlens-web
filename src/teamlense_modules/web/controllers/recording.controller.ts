import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { RecordingService } from "../services/recording.service";

export const uploadRecording = async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = req.auth;
    if (!auth || auth.role !== "MANAGER") {
      res.status(403).json({ success: false, error: "Only managers can upload recordings" });
      return;
    }

    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ success: false, error: "No recording file provided" });
      return;
    }

    const { employeeId, durationMs, liveSessionId, recordedAt } = req.body;

    if (!employeeId || !durationMs) {
      res.status(400).json({ success: false, error: "employeeId and durationMs are required" });
      return;
    }

    const recording = await RecordingService.saveRecording({
      managerId: auth.userId,
      employeeId: String(employeeId),
      organizationId: auth.organizationId,
      ...(liveSessionId ? { liveSessionId: String(liveSessionId) } : {}),
      filePath: file.path.replace(/\\/g, "/"),
      fileSize: file.size,
      durationMs: parseInt(durationMs, 10),
      mimeType: file.mimetype || "video/webm",
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
    });

    res.json({ success: true, data: recording });
  } catch (error) {
    console.error("Failed to upload recording", error);
    res.status(500).json({ success: false, error: "Failed to upload recording" });
  }
};

export const getRecordings = async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;

    const payload: Parameters<typeof RecordingService.getRecordings>[0] = {
      organizationId: auth.organizationId,
      limit,
    };
    if (employeeId) payload.employeeId = employeeId;
    if (startDate) payload.startDate = new Date(startDate);
    if (endDate) payload.endDate = new Date(endDate);

    const recordings = await RecordingService.getRecordings(payload);

    res.json({ success: true, data: recordings });
  } catch (error) {
    console.error("Failed to get recordings", error);
    res.status(500).json({ success: false, error: "Failed to get recordings" });
  }
};

export const getRecordingFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const recording = await RecordingService.getRecordingById(id);

    if (!recording) {
      res.status(404).json({ success: false, error: "Recording not found" });
      return;
    }

    const filePath = path.resolve(recording.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: "Recording file not found on disk" });
      return;
    }

    res.setHeader("Content-Type", recording.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="recording-${recording.id}.webm"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Failed to serve recording file", error);
    res.status(500).json({ success: false, error: "Failed to serve recording" });
  }
};

export const deleteRecording = async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = req.auth;
    if (!auth || auth.role !== "MANAGER") {
      res.status(403).json({ success: false, error: "Only managers can delete recordings" });
      return;
    }

    const id = String(req.params.id);
    const recording = await RecordingService.getRecordingById(id);

    if (!recording) {
      res.status(404).json({ success: false, error: "Recording not found" });
      return;
    }

    // Verify the recording belongs to the same organization
    if (recording.organizationId !== auth.organizationId) {
      res.status(403).json({ success: false, error: "Not authorized to delete this recording" });
      return;
    }

    // Delete file from disk
    const filePath = path.resolve(recording.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await RecordingService.deleteRecording(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete recording", error);
    res.status(500).json({ success: false, error: "Failed to delete recording" });
  }
};
