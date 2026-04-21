"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = exports.sha256 = exports.randomToken = exports.comparePassword = exports.hashPassword = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const BCRYPT_ROUNDS = 12;
const hashPassword = async (rawPassword) => {
    return bcryptjs_1.default.hash(rawPassword, BCRYPT_ROUNDS);
};
exports.hashPassword = hashPassword;
const comparePassword = async (rawPassword, passwordHash) => {
    return bcryptjs_1.default.compare(rawPassword, passwordHash);
};
exports.comparePassword = comparePassword;
const randomToken = (bytes = 32) => {
    return crypto_1.default.randomBytes(bytes).toString("hex");
};
exports.randomToken = randomToken;
const sha256 = (value) => {
    return crypto_1.default.createHash("sha256").update(value).digest("hex");
};
exports.sha256 = sha256;
const slugify = (value) => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
};
exports.slugify = slugify;
//# sourceMappingURL=crypto.js.map