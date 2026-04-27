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
import { requireAuth, requireRole } from "../../../shared/middlewares/auth.middleware";

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

export default webRouter;
