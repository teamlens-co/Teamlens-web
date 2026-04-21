import type { NextFunction, Request, Response } from "express";
import type { AuthRole } from "../types/auth";
export declare const requireAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const requireRole: (allowedRole: AuthRole) => (req: Request, res: Response, next: NextFunction) => void;
export declare const attachOptionalAuth: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map