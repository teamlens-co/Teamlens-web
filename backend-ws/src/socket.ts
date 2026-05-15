import type { Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { Server, type Socket } from "socket.io";
import { env } from "./config/env";
import { sha256 } from "./shared/auth/crypto";
import { verifyToken } from "./shared/auth/jwt";
import { prisma } from "./shared/db/prisma";
import type { AuthContext } from "./shared/types/auth";

type AuthSocket = Socket & { auth?: AuthContext };

type LiveSession = {
  id: string;
  managerId: string;
  employeeId: string;
  organizationId: string;
  status: "REQUESTED" | "ACTIVE";
  touchedAt: number;
};

const sessions = new Map<string, LiveSession>();
const SESSION_TTL_MS = 1000 * 60 * 20;

const managerRoom = (managerId: string) => `manager:${managerId}`;
const employeeRoom = (employeeId: string) => `employee:${employeeId}`;
const sessionRoom = (sessionId: string) => `live:${sessionId}`;

const parseIceServers = (): unknown[] => {
  try {
    const parsed = JSON.parse(env.webrtcIceServers);
    return Array.isArray(parsed) ? parsed : [{ urls: "stun:stun.l.google.com:19302" }];
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
};

const extractToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim()) return authToken.trim();

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7).trim();

  const cookieHeader = socket.handshake.headers.cookie;
  if (typeof cookieHeader === "string") {
    const cookie = cookieHeader
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("teamlens_access_token="));
    const cookieToken = cookie?.slice("teamlens_access_token=".length).trim();
    if (cookieToken) return decodeURIComponent(cookieToken);
  }

  return null;
};

const isActiveAgentToken = async (token: string): Promise<boolean> => {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "id"
     FROM "agent_tokens"
     WHERE "token_hash" = $1
       AND "status" = 'ACTIVE'
       AND "expires_at" > NOW()
       AND "revoked_at" IS NULL
     LIMIT 1`,
    sha256(token),
  )) as Array<{ id: string }>;

  return rows.length > 0;
};

const authenticateSocket = async (socket: AuthSocket, next: (err?: Error) => void): Promise<void> => {
  const token = extractToken(socket);
  if (!token) {
    console.warn("[LiveSocket] rejected connection: missing auth token", {
      id: socket.id,
      origin: socket.handshake.headers.origin,
      transport: socket.conn.transport.name,
    });
    next(new Error("Missing auth token"));
    return;
  }

  try {
    const claims = verifyToken(token);
    if (claims.type === "agent" && !(await isActiveAgentToken(token))) {
      console.warn("[LiveSocket] rejected agent connection: inactive token", {
        id: socket.id,
        userId: claims.sub,
      });
      next(new Error("Agent token is not active"));
      return;
    }
    if (claims.type === "agent" && claims.role !== "EMPLOYEE") {
      console.warn("[LiveSocket] rejected agent connection: non-employee role", {
        id: socket.id,
        userId: claims.sub,
        role: claims.role,
      });
      next(new Error("Desktop agent sockets are only available for employees"));
      return;
    }

    socket.auth = {
      userId: claims.sub,
      organizationId: claims.orgId,
      role: claims.role,
      tokenType: claims.type,
      token,
    };

    next();
  } catch (error) {
    console.warn("[LiveSocket] rejected connection: invalid token", {
      id: socket.id,
      origin: socket.handshake.headers.origin,
      error: error instanceof Error ? error.message : String(error),
    });
    next(new Error("Invalid or expired token"));
  }
};

const managerCanViewEmployee = async (manager: AuthContext, employeeId: string): Promise<boolean> => {
  if (manager.role !== "MANAGER" || manager.tokenType !== "access") return false;

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "id"
     FROM "users"
     WHERE "id" = $1
       AND "organization_id" = $2
       AND "role" = 'EMPLOYEE'
       AND "status" = 'ACTIVE'
     LIMIT 1`,
    employeeId,
    manager.organizationId,
  )) as Array<{ id: string }>;

  return rows.length > 0;
};

const employeeIsClockedIn = async (employeeId: string): Promise<boolean> => {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "id"
     FROM "work_sessions"
     WHERE "user_id" = $1
       AND "clock_out_at" IS NULL
     LIMIT 1`,
    employeeId,
  )) as Array<{ id: string }>;

  return rows.length > 0;
};

const createAuditSession = async (session: LiveSession): Promise<void> => {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "live_screen_sessions"
       ("id","manager_id","employee_id","organization_id","session_start","status","created_at","updated_at")
     VALUES ($1,$2,$3,$4,NOW(),$5,NOW(),NOW())`,
    session.id,
    session.managerId,
    session.employeeId,
    session.organizationId,
    session.status,
  );
};

const markSession = async (sessionId: string, status: string, ended = false): Promise<void> => {
  await prisma.$executeRawUnsafe(
    `UPDATE "live_screen_sessions"
     SET "status" = $2,
         "session_end" = CASE WHEN $3 THEN COALESCE("session_end", NOW()) ELSE "session_end" END,
         "updated_at" = NOW()
     WHERE "id" = $1`,
    sessionId,
    status,
    ended,
  );
};

const getSessionForSocket = (socket: AuthSocket, sessionId: string): LiveSession | null => {
  const auth = socket.auth;
  const session = sessions.get(sessionId);
  if (!auth || !session) return null;

  const allowed =
    (auth.role === "MANAGER" && auth.userId === session.managerId) ||
    (auth.role === "EMPLOYEE" && auth.userId === session.employeeId);

  return allowed ? session : null;
};

export const registerSocket = (server: HttpServer): void => {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => void authenticateSocket(socket as AuthSocket, next));

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthSocket;
    const auth = socket.auth;
    if (!auth) {
      socket.disconnect(true);
      return;
    }

    socket.join(auth.role === "MANAGER" ? managerRoom(auth.userId) : employeeRoom(auth.userId));
    console.info("[LiveSocket] connected", {
      socketId: socket.id,
      userId: auth.userId,
      role: auth.role,
      tokenType: auth.tokenType,
      transport: socket.conn.transport.name,
    });

    socket.on("live:view-request", async (payload: { employeeId?: string }, ack?: (response: unknown) => void) => {
      try {
        const employeeId = payload.employeeId;
        if (!employeeId || !(await managerCanViewEmployee(auth, employeeId))) {
          console.warn("[LiveSocket] live:view-request denied", {
            managerId: auth.userId,
            employeeId,
          });
          ack?.({ ok: false, error: "Not authorized to view this employee" });
          return;
        }

        if (!(await employeeIsClockedIn(employeeId))) {
          console.warn("[LiveSocket] live:view-request denied: employee not clocked in", { employeeId });
          ack?.({ ok: false, error: "Employee is not clocked in" });
          return;
        }

        const sockets = await io.in(employeeRoom(employeeId)).allSockets();
        if (sockets.size === 0) {
          console.warn("[LiveSocket] live:view-request denied: employee agent offline", { employeeId });
          ack?.({ ok: false, error: "Employee agent is not connected" });
          return;
        }

        const session: LiveSession = {
          id: randomUUID(),
          managerId: auth.userId,
          employeeId,
          organizationId: auth.organizationId,
          status: "REQUESTED",
          touchedAt: Date.now(),
        };
        sessions.set(session.id, session);
        await createAuditSession(session);
        console.info("[LiveSocket] live:view-request accepted", {
          sessionId: session.id,
          managerId: auth.userId,
          employeeId,
          employeeSockets: sockets.size,
        });

        socket.join(sessionRoom(session.id));
        ack?.({ ok: true, sessionId: session.id, iceServers: parseIceServers() });
        io.to(employeeRoom(employeeId)).emit("live:view-request", {
          sessionId: session.id,
          managerId: auth.userId,
          employeeId,
          iceServers: parseIceServers(),
        });
      } catch (error) {
        console.error("live:view-request failed", error);
        ack?.({ ok: false, error: "Unable to start live view" });
      }
    });

    socket.on("live:view-accepted", async (payload: { sessionId?: string }) => {
      const session = payload.sessionId ? getSessionForSocket(socket, payload.sessionId) : null;
      if (!session || auth.userId !== session.employeeId) return;

      session.status = "ACTIVE";
      session.touchedAt = Date.now();
      socket.join(sessionRoom(session.id));
      await markSession(session.id, "ACTIVE");
      console.info("[LiveSocket] live:view-accepted", {
        sessionId: session.id,
        employeeId: session.employeeId,
      });
      socket.to(sessionRoom(session.id)).emit("live:view-accepted", {
        sessionId: session.id,
        employeeId: session.employeeId,
        iceServers: parseIceServers(),
      });
    });

    socket.on("live:view-ended", async (payload: { sessionId?: string; reason?: string }) => {
      const session = payload.sessionId ? getSessionForSocket(socket, payload.sessionId) : null;
      if (!session) return;

      sessions.delete(session.id);
      await markSession(session.id, payload.reason === "error" ? "ERROR" : "ENDED", true);
      io.to(sessionRoom(session.id)).emit("live:view-ended", {
        sessionId: session.id,
        reason: payload.reason ?? "ended",
      });
    });

    socket.on("webrtc:offer", (payload: { sessionId?: string; offer?: unknown }) => {
      const session = payload.sessionId ? getSessionForSocket(socket, payload.sessionId) : null;
      if (!session || auth.userId !== session.employeeId) return;
      session.touchedAt = Date.now();
      console.info("[LiveSocket] webrtc:offer", { sessionId: session.id });
      socket.to(sessionRoom(session.id)).emit("webrtc:offer", payload);
    });

    socket.on("webrtc:answer", (payload: { sessionId?: string; answer?: unknown }) => {
      const session = payload.sessionId ? getSessionForSocket(socket, payload.sessionId) : null;
      if (!session || auth.userId !== session.managerId) return;
      session.touchedAt = Date.now();
      console.info("[LiveSocket] webrtc:answer", { sessionId: session.id });
      socket.to(sessionRoom(session.id)).emit("webrtc:answer", payload);
    });

    socket.on("webrtc:ice-candidate", (payload: { sessionId?: string; candidate?: unknown }) => {
      const session = payload.sessionId ? getSessionForSocket(socket, payload.sessionId) : null;
      if (!session) return;
      session.touchedAt = Date.now();
      socket.to(sessionRoom(session.id)).emit("webrtc:ice-candidate", payload);
    });

    socket.on("disconnect", async () => {
      const affected = [...sessions.values()].filter(
        (session) => session.managerId === auth.userId || session.employeeId === auth.userId,
      );
      for (const session of affected) {
        sessions.delete(session.id);
        await markSession(session.id, "ENDED", true);
        io.to(sessionRoom(session.id)).emit("live:view-ended", {
          sessionId: session.id,
          reason: "disconnect",
        });
      }
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (now - session.touchedAt <= SESSION_TTL_MS) continue;
      sessions.delete(session.id);
      void markSession(session.id, "EXPIRED", true);
      io.to(sessionRoom(session.id)).emit("live:view-ended", {
        sessionId: session.id,
        reason: "inactive",
      });
    }
  }, 60_000).unref();
};
