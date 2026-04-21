"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClockOutPayload = exports.isClockInPayload = exports.isActivityPayload = void 0;
const isActivityPayload = (value) => {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.userId === "string" &&
        (candidate.sessionId === undefined || typeof candidate.sessionId === "string") &&
        typeof candidate.mouseMoves === "number" &&
        typeof candidate.keyPresses === "number" &&
        (candidate.capturedAt === undefined || typeof candidate.capturedAt === "string"));
};
exports.isActivityPayload = isActivityPayload;
const isClockInPayload = (value) => {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.userId === "string" &&
        (candidate.timestamp === undefined || typeof candidate.timestamp === "string"));
};
exports.isClockInPayload = isClockInPayload;
const isClockOutPayload = (value) => {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.userId === "string" &&
        (candidate.sessionId === undefined || typeof candidate.sessionId === "string") &&
        (candidate.timestamp === undefined || typeof candidate.timestamp === "string"));
};
exports.isClockOutPayload = isClockOutPayload;
//# sourceMappingURL=validator.js.map