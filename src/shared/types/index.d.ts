import type { Request } from "express";
import type { AuthContext } from "./auth";
export type AuthRequest = Request & {
    auth?: AuthContext;
};
export type { AuthContext };
//# sourceMappingURL=index.d.ts.map