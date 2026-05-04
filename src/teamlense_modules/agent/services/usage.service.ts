import { prisma } from "../../../shared/db/prisma";

export type ActivityCategory = "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
export type ActivityTargetType = "APP" | "DOMAIN" | "URL";

type UsagePayload = {
  organizationId: string;
  userId: string;
  sessionId?: string;
  appName: string;
  windowTitle?: string;
  domain?: string;
  url?: string;
  durationSeconds: number;
  idleSeconds: number;
  isIdle: boolean;
  capturedAt: Date;
};

type RulePayload = {
  organizationId: string;
  targetType: ActivityTargetType;
  targetValue: string;
  category: ActivityCategory;
};

type SqlRow = Record<string, unknown>;

const productiveApps = [
  "visual studio code",
  "code.exe",
  "cursor",
  "intellij",
  "webstorm",
  "pycharm",
  "rider",
  "android studio",
  "xcode",
  "terminal",
  "windows terminal",
  "powershell",
  "git",
  "slack",
  "microsoft teams",
  "figma",
  "postman",
  "notion",
  "jira",
  "trello",
  "linear",
  "github",
  "gitlab",
  "bitbucket",
];

const productiveDomains = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "stackoverflow.com",
  "docs.microsoft.com",
  "developer.mozilla.org",
  "vercel.com",
  "linear.app",
  "jira.com",
  "atlassian.net",
  "notion.so",
  "figma.com",
  "slack.com",
  "teams.microsoft.com",
  "google.com",
];

const unproductiveDomains = [
  "youtube.com",
  "netflix.com",
  "primevideo.com",
  "hotstar.com",
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "tiktok.com",
  "twitch.tv",
  "spotify.com",
];

const aiDomains = [
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "perplexity.ai",
  "poe.com",
  "cursor.com",
];

const aiApps = ["chatgpt", "claude", "gemini", "copilot", "perplexity"];

const normalize = (value?: string | null): string => (value ?? "").trim().toLowerCase();

const asString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toCategory = (value: unknown): ActivityCategory => {
  if (value === "PRODUCTIVE" || value === "UNPRODUCTIVE" || value === "NEUTRAL") return value;
  return "NEUTRAL";
};

const toTargetType = (value: unknown): ActivityTargetType => {
  if (value === "APP" || value === "DOMAIN" || value === "URL") return value;
  return "APP";
};

const domainMatches = (domain: string, candidates: string[]): boolean => {
  const clean = normalize(domain).replace(/^www\./, "");
  return candidates.some((candidate) => clean === candidate || clean.endsWith(`.${candidate}`));
};

export class UsageService {
  private static schemaReady = false;

  private static async ensureSchema(): Promise<void> {
    if (this.schemaReady || !prisma.$executeRawUnsafe) return;

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivityCategory') THEN
          CREATE TYPE "ActivityCategory" AS ENUM ('PRODUCTIVE', 'UNPRODUCTIVE', 'NEUTRAL');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivityTargetType') THEN
          CREATE TYPE "ActivityTargetType" AS ENUM ('APP', 'DOMAIN', 'URL');
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "activity_usage_logs" (
        "id" TEXT PRIMARY KEY,
        "organization_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "session_id" TEXT,
        "target_type" "ActivityTargetType" NOT NULL,
        "app_name" TEXT NOT NULL,
        "window_title" TEXT,
        "domain" TEXT,
        "url" TEXT,
        "category" "ActivityCategory" NOT NULL DEFAULT 'NEUTRAL',
        "duration_seconds" INTEGER NOT NULL DEFAULT 0,
        "idle_seconds" INTEGER NOT NULL DEFAULT 0,
        "is_idle" BOOLEAN NOT NULL DEFAULT false,
        "captured_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "classification_rules" (
        "id" TEXT PRIMARY KEY,
        "organization_id" TEXT NOT NULL,
        "target_type" "ActivityTargetType" NOT NULL,
        "target_value" TEXT NOT NULL,
        "category" "ActivityCategory" NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "active_application" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "window_title" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "domain" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "url" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "employee_name" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "project_name" TEXT`);

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "classification_rules_organization_id_target_type_target_value_key"
       ON "classification_rules" ("organization_id", "target_type", "target_value")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "activity_usage_logs_user_captured_idx"
       ON "activity_usage_logs" ("user_id", "captured_at")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "activity_usage_logs_org_captured_idx"
       ON "activity_usage_logs" ("organization_id", "captured_at")`,
    );

    this.schemaReady = true;
  }

  static async classify(
    organizationId: string,
    targetType: ActivityTargetType,
    appName: string,
    domain?: string,
    url?: string,
  ): Promise<ActivityCategory> {
    await this.ensureSchema();

    const checks: Array<[ActivityTargetType, string | undefined]> = [
      ["URL", url],
      ["DOMAIN", domain],
      ["APP", appName],
    ];

    for (const [type, rawValue] of checks) {
      const targetValue = normalize(rawValue);
      if (!targetValue || !prisma.$queryRawUnsafe) continue;

      const rows = (await prisma.$queryRawUnsafe(
        `SELECT "category"
         FROM "classification_rules"
         WHERE "organization_id" = $1
           AND "target_type" = $2::"ActivityTargetType"
           AND "target_value" = $3
         LIMIT 1`,
        organizationId,
        type,
        targetValue,
      )) as SqlRow[];

      if (rows[0]) return toCategory(rows[0].category);
    }

    const app = normalize(appName);
    const cleanDomain = normalize(domain).replace(/^www\./, "");

    if (domainMatches(cleanDomain, aiDomains) || aiApps.some((candidate) => app.includes(candidate))) {
      return "NEUTRAL";
    }

    if (domainMatches(cleanDomain, unproductiveDomains)) return "UNPRODUCTIVE";
    if (domainMatches(cleanDomain, productiveDomains)) return "PRODUCTIVE";
    if (productiveApps.some((candidate) => app.includes(candidate))) return "PRODUCTIVE";

    return "NEUTRAL";
  }

  static async createUsageLog(payload: UsagePayload) {
    await this.ensureSchema();

    const domain = normalize(payload.domain) || null;
    const url = payload.url?.trim() || null;
    const targetType: ActivityTargetType = url ? "URL" : domain ? "DOMAIN" : "APP";
    const category = await this.classify(
      payload.organizationId,
      targetType,
      payload.appName,
      domain ?? undefined,
      url ?? undefined,
    );

    const durationSeconds = payload.isIdle ? 0 : Math.max(0, Math.round(payload.durationSeconds));
    const idleSeconds = Math.max(0, Math.round(payload.idleSeconds));

    if (prisma.$executeRawUnsafe) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "activity_usage_logs"
          ("id", "organization_id", "user_id", "session_id", "target_type", "app_name", "window_title",
           "domain", "url", "category", "duration_seconds", "idle_seconds", "is_idle", "captured_at", "created_at")
         VALUES ($1, $2, $3, $4, $5::"ActivityTargetType", $6, $7, $8, $9, $10::"ActivityCategory", $11, $12, $13, $14, NOW())`,
        crypto.randomUUID(),
        payload.organizationId,
        payload.userId,
        payload.sessionId ?? null,
        targetType,
        payload.appName,
        payload.windowTitle ?? null,
        domain,
        url,
        category,
        durationSeconds,
        idleSeconds,
        payload.isIdle,
        payload.capturedAt,
      );
    }

    return { category, targetType, durationSeconds };
  }

  static async upsertRule(payload: RulePayload) {
    await this.ensureSchema();
    const targetValue = normalize(payload.targetValue);

    const rows = (await prisma.$queryRawUnsafe(
      `INSERT INTO "classification_rules"
        ("id", "organization_id", "target_type", "target_value", "category", "created_at", "updated_at")
       VALUES ($1, $2, $3::"ActivityTargetType", $4, $5::"ActivityCategory", NOW(), NOW())
       ON CONFLICT ("organization_id", "target_type", "target_value")
       DO UPDATE SET "category" = EXCLUDED."category", "updated_at" = NOW()
       RETURNING "id", "target_type", "target_value", "category"`,
      crypto.randomUUID(),
      payload.organizationId,
      payload.targetType,
      targetValue,
      payload.category,
    )) as SqlRow[];

    return rows[0];
  }

  static async listRules(organizationId: string) {
    await this.ensureSchema();
    return prisma.$queryRawUnsafe(
      `SELECT "id", "target_type" AS "targetType", "target_value" AS "targetValue", "category"
       FROM "classification_rules"
       WHERE "organization_id" = $1
       ORDER BY "updated_at" DESC`,
      organizationId,
    ) as Promise<SqlRow[]>;
  }

  static async getUsageReport(params: {
    organizationId: string;
    userId?: string;
    start: Date;
    end: Date;
    groupBy?: "total" | "employee" | "team" | "location";
  }) {
    await this.ensureSchema();

    const userFilter = params.userId ? `AND l."user_id" = $4` : "";
    const values = params.userId
      ? [params.organizationId, params.start, params.end, params.userId]
      : [params.organizationId, params.start, params.end];

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT
          COALESCE(NULLIF(l."domain", ''), l."app_name") AS "name",
          MAX(l."target_type"::text) AS "targetType",
          MAX(l."app_name") AS "appName",
          MAX(l."domain") AS "domain",
          MAX(l."category"::text) AS "category",
          SUM(l."duration_seconds")::int AS "durationSeconds",
          COUNT(*)::int AS "samples"
       FROM "activity_usage_logs" l
       WHERE l."organization_id" = $1
         AND l."captured_at" >= $2
         AND l."captured_at" <= $3
         ${userFilter}
       GROUP BY COALESCE(NULLIF(l."domain", ''), l."app_name")
       ORDER BY SUM(l."duration_seconds") DESC
       LIMIT 100`,
      ...values,
    )) as SqlRow[];

    const categoryRows = (await prisma.$queryRawUnsafe(
      `SELECT l."category"::text AS "category", SUM(l."duration_seconds")::int AS "durationSeconds"
       FROM "activity_usage_logs" l
       WHERE l."organization_id" = $1
         AND l."captured_at" >= $2
         AND l."captured_at" <= $3
         ${userFilter}
       GROUP BY l."category"
       ORDER BY SUM(l."duration_seconds") DESC`,
      ...values,
    )) as SqlRow[];

    return {
      items: rows.map((row) => ({
        name: asString(row.name),
        targetType: toTargetType(row.targetType),
        appName: asString(row.appName),
        domain: asString(row.domain),
        category: toCategory(row.category),
        durationSeconds: asNumber(row.durationSeconds),
        samples: asNumber(row.samples),
      })),
      categories: categoryRows.map((row) => ({
        category: toCategory(row.category),
        durationSeconds: asNumber(row.durationSeconds),
      })),
      groupBy: params.groupBy ?? "total",
    };
  }

}
