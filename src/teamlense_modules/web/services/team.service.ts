import { prisma } from "../../../shared/db/prisma";
import { ActivityService } from "../../agent/services/activity.service";

type SqlRow = Record<string, unknown>;

const asString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapTeam = (row: SqlRow) => ({
  id: asString(row.id),
  name: asString(row.name),
  managerId: asString(row.manager_id),
  createdAt: asString(row.created_at),
  memberCount: asNumber(row.member_count),
});

const mapUser = (row: SqlRow) => ({
  id: asString(row.id),
  fullName: asString(row.full_name),
  email: asString(row.email),
  role: asString(row.role),
  status: asString(row.status),
});

export class TeamService {
  private static schemaReady = false;

  private static async ensureSchema(): Promise<void> {
    if (this.schemaReady || !prisma.$executeRawUnsafe) return;

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "teams" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "manager_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "team_memberships" (
        "id" TEXT PRIMARY KEY,
        "team_id" TEXT NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "teams_manager_id_idx" ON "teams"("manager_id")');
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "team_memberships_team_id_user_id_key" ON "team_memberships"("team_id", "user_id")',
    );
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "team_memberships_user_id_idx" ON "team_memberships"("user_id")');

    this.schemaReady = true;
  }

  private static async getOwnedTeam(teamId: string, managerId: string) {
    await this.ensureSchema();

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t."id", t."name", t."manager_id", t."created_at",
              COUNT(tm."id")::int AS "member_count"
       FROM "teams" t
       LEFT JOIN "team_memberships" tm ON tm."team_id" = t."id"
       WHERE t."id" = $1 AND t."manager_id" = $2
       GROUP BY t."id"
       LIMIT 1`,
      teamId,
      managerId,
    )) as SqlRow[];

    return rows[0] ? mapTeam(rows[0]) : null;
  }

  static async createTeam(input: { name: string; managerId: string }) {
    await this.ensureSchema();

    const rows = (await prisma.$queryRawUnsafe(
      `INSERT INTO "teams" ("id", "name", "manager_id", "created_at")
       VALUES ($1, $2, $3, NOW())
       RETURNING "id", "name", "manager_id", "created_at", 0::int AS "member_count"`,
      crypto.randomUUID(),
      input.name.trim(),
      input.managerId,
    )) as SqlRow[];

    return mapTeam(rows[0]!);
  }

  static async listTeams(managerId: string) {
    await this.ensureSchema();

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t."id", t."name", t."manager_id", t."created_at",
              COUNT(tm."id")::int AS "member_count"
       FROM "teams" t
       LEFT JOIN "team_memberships" tm ON tm."team_id" = t."id"
       WHERE t."manager_id" = $1
       GROUP BY t."id"
       ORDER BY t."created_at" DESC`,
      managerId,
    )) as SqlRow[];

    return rows.map(mapTeam);
  }

  static async getTeam(teamId: string, managerId: string) {
    const team = await this.getOwnedTeam(teamId, managerId);
    if (!team) return null;

    return {
      ...team,
      members: await this.listMembers(teamId, managerId),
    };
  }

  static async updateTeam(input: { teamId: string; managerId: string; name: string }) {
    await this.ensureSchema();

    const rows = (await prisma.$queryRawUnsafe(
      `UPDATE "teams"
       SET "name" = $1
       WHERE "id" = $2 AND "manager_id" = $3
       RETURNING "id", "name", "manager_id", "created_at", 0::int AS "member_count"`,
      input.name.trim(),
      input.teamId,
      input.managerId,
    )) as SqlRow[];

    return rows[0] ? this.getTeam(input.teamId, input.managerId) : null;
  }

  static async deleteTeam(teamId: string, managerId: string): Promise<boolean> {
    await this.ensureSchema();

    const rows = (await prisma.$queryRawUnsafe(
      `DELETE FROM "teams"
       WHERE "id" = $1 AND "manager_id" = $2
       RETURNING "id"`,
      teamId,
      managerId,
    )) as SqlRow[];

    return rows.length > 0;
  }

  static async addMember(input: { teamId: string; managerId: string; organizationId: string; userId: string }) {
    await this.ensureSchema();

    const team = await this.getOwnedTeam(input.teamId, input.managerId);
    if (!team) return { status: "team_not_found" as const };

    const userRows = (await prisma.$queryRawUnsafe(
      `SELECT "id"
       FROM "users"
       WHERE "id" = $1 AND "organization_id" = $2 AND "status" = 'ACTIVE'
       LIMIT 1`,
      input.userId,
      input.organizationId,
    )) as SqlRow[];

    if (userRows.length === 0) return { status: "user_not_found" as const };

    await prisma.$executeRawUnsafe(
      `INSERT INTO "team_memberships" ("id", "team_id", "user_id")
       VALUES ($1, $2, $3)
       ON CONFLICT ("team_id", "user_id") DO NOTHING`,
      crypto.randomUUID(),
      input.teamId,
      input.userId,
    );

    return { status: "ok" as const, members: await this.listMembers(input.teamId, input.managerId) };
  }

  static async removeMember(teamId: string, managerId: string, userId: string): Promise<boolean> {
    await this.ensureSchema();

    const team = await this.getOwnedTeam(teamId, managerId);
    if (!team) return false;

    await prisma.$executeRawUnsafe(
      `DELETE FROM "team_memberships"
       WHERE "team_id" = $1 AND "user_id" = $2`,
      teamId,
      userId,
    );

    return true;
  }

  static async listMembers(teamId: string, managerId: string) {
    await this.ensureSchema();

    const team = await this.getOwnedTeam(teamId, managerId);
    if (!team) return null;

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT u."id", u."full_name", u."email", u."role", u."status"
       FROM "team_memberships" tm
       JOIN "users" u ON u."id" = tm."user_id"
       WHERE tm."team_id" = $1
       ORDER BY u."full_name" ASC`,
      teamId,
    )) as SqlRow[];

    return rows.map(mapUser);
  }

  static async getAnalytics(input: { teamId: string; managerId: string; start: Date; end: Date }) {
    const team = await this.getOwnedTeam(input.teamId, input.managerId);
    if (!team) return null;

    const members = await this.listMembers(input.teamId, input.managerId);
    if (!members) return null;

    const memberAnalytics = await Promise.all(
      members.map(async (member) => {
        const analytics = await ActivityService.getAnalytics(member.id, input.start, input.end);
        const trackedSeconds = analytics.workSeconds + analytics.manualSeconds;
        return {
          userId: member.id,
          fullName: member.fullName,
          email: member.email,
          activeSeconds: analytics.activeSeconds,
          trackedSeconds,
          workSeconds: analytics.workSeconds,
          manualSeconds: analytics.manualSeconds,
          productivityPercent: analytics.productivityPercent,
        };
      }),
    );

    const totalActiveSeconds = memberAnalytics.reduce((sum, item) => sum + item.activeSeconds, 0);
    const totalTrackedSeconds = memberAnalytics.reduce((sum, item) => sum + item.trackedSeconds, 0);
    const totalMeasuredWorkSeconds = memberAnalytics.reduce((sum, item) => sum + item.workSeconds, 0);
    const avgActivityPercent =
      totalMeasuredWorkSeconds > 0 ? Math.round((totalActiveSeconds / totalMeasuredWorkSeconds) * 100) : 0;

    return {
      team,
      start: input.start.toISOString(),
      end: input.end.toISOString(),
      memberCount: members.length,
      totalActiveSeconds,
      totalTrackedSeconds,
      avgActivityPercent,
      members: memberAnalytics,
    };
  }
}
