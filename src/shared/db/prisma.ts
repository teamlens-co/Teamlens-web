import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const buildPrismaClient = (): PrismaClient => {
  try {
    return new PrismaClient({
      log: ["warn", "error"],
    });
  } catch {
    // Prisma client may not be generated yet during early scaffolding.
  }

  throw new Error("Prisma client is not available. Check DATABASE_URL and Prisma setup.");
};

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
