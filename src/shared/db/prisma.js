"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
const buildPrismaClient = () => {
    try {
        return new client_1.PrismaClient({
            log: ["warn", "error"],
        });
    }
    catch {
        // Prisma client may not be generated yet during early scaffolding.
    }
    throw new Error("Prisma client is not available. Check DATABASE_URL and Prisma setup.");
};
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? buildPrismaClient();
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = exports.prisma;
}
//# sourceMappingURL=prisma.js.map