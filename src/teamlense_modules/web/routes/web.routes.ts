import { Router } from "express";
import { getDashboardAnalytics, addManualHours } from "../controllers/dashboard.controller";
import { getCalendarHeatmap } from "../controllers/calendar.controller";
import {
  createAgentConnectToken,
  getMe,
  getTeamUsers,
  login,
  logout,
  signupManager,
} from "../controllers/auth.controller";
import { acceptInvite, createInvite, validateInvite } from "../controllers/invite.controller";
import { getOfficeLocations, upsertOfficeLocation, deleteOfficeLocation } from "../controllers/location.controller";
import { uploadRecording, getRecordings, getRecordingFile, deleteRecording } from "../controllers/recording.controller";
import { requireAuth, requireRole } from "../../../shared/middlewares/auth.middleware";
import multer from "multer";
import fs from "fs";
import path from "path";

const webRouter = Router();

webRouter.get("/health", (_req, res) => {
  res.json({
    success: true,
    module: "web",
    message: "Web module ready",
  });
});

webRouter.get("/dashboard/analytics", requireAuth, getDashboardAnalytics);
webRouter.post("/dashboard/manual-hours", requireAuth, requireRole("MANAGER"), addManualHours);
webRouter.get("/dashboard/calendar", requireAuth, getCalendarHeatmap);

webRouter.post("/auth/signup-manager", signupManager);
webRouter.post("/auth/login", login);
webRouter.post("/auth/logout", logout);
webRouter.get("/auth/me", requireAuth, getMe);
webRouter.post("/auth/agent-token", requireAuth, createAgentConnectToken);

webRouter.get("/users", requireAuth, requireRole("MANAGER"), getTeamUsers);

webRouter.post("/invites", requireAuth, requireRole("MANAGER"), createInvite);
webRouter.get("/invites/validate", validateInvite);
webRouter.post("/invites/accept", acceptInvite);

// Office location management (Manager only)
webRouter.get("/locations", requireAuth, getOfficeLocations);
webRouter.put("/locations", requireAuth, requireRole("MANAGER"), upsertOfficeLocation);
webRouter.delete("/locations/:id", requireAuth, requireRole("MANAGER"), deleteOfficeLocation);

// Screen recording management
const recordingStorage = multer.diskStorage({
  destination: function (_req: any, _file, cb) {
    const auth = (_req as any).auth;
    const userId = auth?.userId || "anonymous";
    const date = new Date();
    const dateFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dir = path.join("uploads", "recordings", userId, dateFolder);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_req, _file, cb) {
    const date = new Date();
    const timeString = `${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}-${String(date.getSeconds()).padStart(2, "0")}`;
    const uniqueSuffix = Math.round(Math.random() * 1e9);
    cb(null, `recording_${timeString}_${uniqueSuffix}.webm`);
  },
});
const recordingUpload = multer({ storage: recordingStorage, limits: { fileSize: 500 * 1024 * 1024 } });

webRouter.post("/recordings", requireAuth, requireRole("MANAGER"), recordingUpload.single("recording"), uploadRecording);
webRouter.get("/recordings", requireAuth, getRecordings);
webRouter.get("/recordings/:id/file", requireAuth, getRecordingFile);
webRouter.delete("/recordings/:id", requireAuth, requireRole("MANAGER"), deleteRecording);

export default webRouter;
