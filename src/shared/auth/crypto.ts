import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_ROUNDS = 12;

export const hashPassword = async (rawPassword: string): Promise<string> => {
  return bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
};

export const comparePassword = async (rawPassword: string, passwordHash: string): Promise<boolean> => {
  return bcrypt.compare(rawPassword, passwordHash);
};

export const randomToken = (bytes = 32): string => {
  return crypto.randomBytes(bytes).toString("hex");
};

export const sha256 = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

export const slugify = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
};
