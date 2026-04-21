import { Router } from "express";
import { clockIn, clockOut, createActivity, getActiveSession } from "../controllers/activity.controller";
import { loginAgent } from "../controllers/auth.controller";
import { uploadScreenshot, getScreenshots, getScreenshot } from "../controllers/screenshot.controller";
import { requireAuth } from "../../../shared/middlewares/auth.middleware";

import multer from "multer";
import fs from "fs";
import path from "path";

const agentRouter = Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req: any, file, cb) {
    const userId = req.auth?.userId || "anonymous";
    const date = new Date();
    const dateFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Create nested directory structure: uploads/screenshots/<userId>/<dateFolder>
    const dir = path.join('uploads', 'screenshots', userId, dateFolder);
    
    // Ensure the directory exists
    fs.mkdirSync(dir, { recursive: true });
    
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const date = new Date();
    const timeString = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
    const uniqueSuffix = Math.round(Math.random() * 1E9);
    
    // Generates files like: screenshot_14-30-05_123456789.png
    cb(null, `screenshot_${timeString}_${uniqueSuffix}.png`);
  }
});
const upload = multer({ storage: storage });

agentRouter.post("/auth/login", loginAgent);

agentRouter.get("/active-session", requireAuth, getActiveSession);
agentRouter.post("/clock-in", requireAuth, clockIn);
agentRouter.post("/clock-out", requireAuth, clockOut);
agentRouter.post("/activity", requireAuth, createActivity);

// Screenshot routes
agentRouter.post("/screenshots", requireAuth, upload.single("screenshot"), uploadScreenshot);
agentRouter.get("/screenshots", requireAuth, getScreenshots);
agentRouter.get("/screenshots/:id", getScreenshot);

export default agentRouter;
