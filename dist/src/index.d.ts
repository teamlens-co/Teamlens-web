import type { AuthContext } from "./shared/types/auth";
declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
        }
    }
}
//# sourceMappingURL=index.d.ts.map