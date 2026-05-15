import dotenv from "dotenv";

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toNumber(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "1h",
  jwtAgentTtl: process.env.JWT_AGENT_TTL ?? "30d",
  inviteTtlHours: toNumber(process.env.INVITE_TTL_HOURS, 72),
  webAppUrl: process.env.WEB_APP_URL ?? "",
  webrtcIceServers:
    process.env.WEBRTC_ICE_SERVERS ??
    JSON.stringify([{ urls: "stun:stun.l.google.com:19302" }]),
};
