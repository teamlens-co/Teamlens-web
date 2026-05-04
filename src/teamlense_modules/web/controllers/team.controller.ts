import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../../../shared/types";
import { TeamService } from "../services/team.service";

const teamSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const memberSchema = z.object({
  userId: z.string().min(1),
});

const getRange = (req: AuthRequest): { start: Date; end: Date } => {
  const start = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : new Date();
  const end = typeof req.query.endDate === "string" ? new Date(req.query.endDate) : new Date();

  if (!req.query.startDate) start.setHours(0, 0, 0, 0);
  if (!req.query.endDate) end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getParam = (req: AuthRequest, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};

const requireManagerAuth = (req: AuthRequest, res: Response): boolean => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return false;
  }

  if (req.auth.role !== "MANAGER") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return false;
  }

  return true;
};

export const createTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  try {
    const team = await TeamService.createTeam({ name: parsed.data.name, managerId: req.auth!.userId });
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    console.error("Failed to create team", error);
    res.status(500).json({ success: false, message: "Unable to create team" });
  }
};

export const listTeams = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  try {
    const teams = await TeamService.listTeams(req.auth!.userId);
    res.status(200).json({ success: true, data: teams });
  } catch (error) {
    console.error("Failed to fetch teams", error);
    res.status(500).json({ success: false, message: "Unable to fetch teams" });
  }
};

export const getTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  try {
    const team = await TeamService.getTeam(getParam(req, "id"), req.auth!.userId);
    if (!team) {
      res.status(404).json({ success: false, message: "Team not found" });
      return;
    }

    res.status(200).json({ success: true, data: team });
  } catch (error) {
    console.error("Failed to fetch team", error);
    res.status(500).json({ success: false, message: "Unable to fetch team" });
  }
};

export const updateTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  try {
    const team = await TeamService.updateTeam({
      teamId: getParam(req, "id"),
      managerId: req.auth!.userId,
      name: parsed.data.name,
    });

    if (!team) {
      res.status(404).json({ success: false, message: "Team not found" });
      return;
    }

    res.status(200).json({ success: true, data: team });
  } catch (error) {
    console.error("Failed to update team", error);
    res.status(500).json({ success: false, message: "Unable to update team" });
  }
};

export const deleteTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  try {
    const deleted = await TeamService.deleteTeam(getParam(req, "id"), req.auth!.userId);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Team not found" });
      return;
    }

    res.status(200).json({ success: true, message: "Team deleted" });
  } catch (error) {
    console.error("Failed to delete team", error);
    res.status(500).json({ success: false, message: "Unable to delete team" });
  }
};

export const addTeamMember = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await TeamService.addMember({
      teamId: getParam(req, "id"),
      managerId: req.auth!.userId,
      organizationId: req.auth!.organizationId,
      userId: parsed.data.userId,
    });

    if (result.status === "team_not_found") {
      res.status(404).json({ success: false, message: "Team not found" });
      return;
    }

    if (result.status === "user_not_found") {
      res.status(404).json({ success: false, message: "User not found in organization" });
      return;
    }

    res.status(200).json({ success: true, data: result.members });
  } catch (error) {
    console.error("Failed to add team member", error);
    res.status(500).json({ success: false, message: "Unable to add team member" });
  }
};

export const removeTeamMember = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  try {
    const removed = await TeamService.removeMember(getParam(req, "id"), req.auth!.userId, getParam(req, "userId"));
    if (!removed) {
      res.status(404).json({ success: false, message: "Team not found" });
      return;
    }

    res.status(200).json({ success: true, message: "Member removed" });
  } catch (error) {
    console.error("Failed to remove team member", error);
    res.status(500).json({ success: false, message: "Unable to remove team member" });
  }
};

export const getTeamAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!requireManagerAuth(req, res)) return;

  const { start, end } = getRange(req);

  try {
    const analytics = await TeamService.getAnalytics({
      teamId: getParam(req, "id"),
      managerId: req.auth!.userId,
      start,
      end,
    });

    if (!analytics) {
      res.status(404).json({ success: false, message: "Team not found" });
      return;
    }

    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    console.error("Failed to fetch team analytics", error);
    res.status(500).json({ success: false, message: "Unable to fetch team analytics" });
  }
};
