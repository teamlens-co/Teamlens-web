"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClient = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
const globalForPrisma = globalThis;
exports.prismaClient = globalForPrisma.prismaClient ??
    new client_1.PrismaClient({
        log: ["warn", "error"],
    });
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaClient = exports.prismaClient;
}
//# sourceMappingURL=prisma-client.js.map