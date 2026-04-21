import type { Request, Response } from "express";
import type { AuthRequest } from "../../../shared/types";
export declare const signupManager: (req: Request, res: Response) => Promise<void>;
export declare const login: (req: Request, res: Response) => Promise<void>;
export declare const logout: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMe: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createAgentConnectToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getTeamUsers: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map