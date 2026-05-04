import type { Response } from "express";
import type { AuthRequest } from "../../../shared/types";
import { LocationService } from "../services/location.service";

export const searchOfficeLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const query = typeof req.query.q === "string" ? req.query.q : "";
  if (query.trim().length < 3) {
    res.status(400).json({ success: false, message: "Search query must be at least 3 characters" });
    return;
  }

  try {
    const results = await LocationService.searchOfficeAddresses(query);
    res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error("Failed to search office locations", error);
    res.status(500).json({ success: false, message: "Unable to search locations" });
  }
};

export const getOfficeLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const locations = await LocationService.getOfficeLocations(req.auth.organizationId);
    res.status(200).json({ success: true, data: locations });
  } catch (error) {
    console.error("Failed to fetch office locations", error);
    res.status(500).json({ success: false, message: "Unable to fetch office locations" });
  }
};

export const upsertOfficeLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const { label, latitude, longitude, radiusMeters } = req.body;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ success: false, message: "latitude and longitude are required numbers" });
    return;
  }

  try {
    const location = await LocationService.upsertOfficeLocation(req.auth.organizationId, {
      label: typeof label === "string" ? label : "Main Office",
      latitude,
      longitude,
      radiusMeters: typeof radiusMeters === "number" ? radiusMeters : 200,
    });

    await LocationService.reclassifyActiveSessions(req.auth.organizationId);

    res.status(200).json({ success: true, data: location });
  } catch (error) {
    console.error("Failed to upsert office location", error);
    res.status(500).json({ success: false, message: "Unable to save office location" });
  }
};

export const deleteOfficeLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const locationId = req.params.id as string;
  if (!locationId) {
    res.status(400).json({ success: false, message: "Location ID is required" });
    return;
  }

  try {
    await LocationService.deleteOfficeLocation(req.auth.organizationId, locationId);
    res.status(200).json({ success: true, message: "Deleted" });
  } catch (error) {
    console.error("Failed to delete office location", error);
    res.status(500).json({ success: false, message: "Unable to delete office location" });
  }
};
