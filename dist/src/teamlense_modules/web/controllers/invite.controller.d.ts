import type { Response } from "express";
import type { AuthRequest } from "../../../shared/types";
export declare const createInvite: (req: AuthRequest, res: Response) => Promise<void>;
export declare const validateInvite: (req: AuthRequest, res: Response) => Promise<void>;
export declare const acceptInvite: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=invite.controller.d.ts.map