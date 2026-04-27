require("dotenv/config");

const { PrismaClient, UserRole, UserStatus, InviteStatus, AgentTokenStatus } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const now = new Date();
const hoursAgo = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000);

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany();
    await tx.liveScreenSession.deleteMany();
    await tx.screenshot.deleteMany();
    await tx.agentToken.deleteMany();
    await tx.inviteToken.deleteMany();
    await tx.workSession.deleteMany();
    await tx.user.deleteMany();
    await tx.organization.deleteMany();

    const passwordHash = await bcrypt.hash("Password123!", 12);

    const organization = await tx.organization.create({
      data: {
        name: "Demo TeamLens",
        slug: "demo-teamlens",
      },
    });

    const manager = await tx.user.create({
      data: {
        organizationId: organization.id,
        fullName: "Ava Manager",
        email: "ava.manager@teamlens.dev",
        passwordHash,
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
      },
    });

    const employee = await tx.user.create({
      data: {
        organizationId: organization.id,
        fullName: "Noah Employee",
        email: "noah.employee@teamlens.dev",
        passwordHash,
        role: UserRole.EMPLOYEE,
        status: UserStatus.ACTIVE,
        invitedById: manager.id,
      },
    });

    await tx.inviteToken.create({
      data: {
        organizationId: organization.id,
        invitedById: manager.id,
        email: "mia.invited@teamlens.dev",
        role: UserRole.EMPLOYEE,
        token: "demo-invite-token",
        status: InviteStatus.PENDING,
        expiresAt: hoursAgo(-72),
      },
    });

    await tx.agentToken.create({
      data: {
        organizationId: organization.id,
        userId: employee.id,
        tokenHash: "demo-token-hash-employee",
        label: "Noah's laptop",
        status: AgentTokenStatus.ACTIVE,
        expiresAt: hoursAgo(-24),
      },
    });

    await tx.workSession.create({
      data: {
        id: "demo-session-1",
        userId: employee.id,
        clockInAt: hoursAgo(8),
        clockOutAt: hoursAgo(1),
      },
    });

    await tx.liveScreenSession.create({
      data: {
        id: "demo-live-screen-session",
        managerId: manager.id,
        employeeId: employee.id,
        organizationId: organization.id,
        status: "ACTIVE",
      },
    });

    await tx.screenshot.create({
      data: {
        userId: employee.id,
        sessionId: "demo-session-1",
        filePath: "/uploads/screenshots/demo/1.png",
        capturedAt: hoursAgo(2),
      },
    });

    await tx.activityLog.create({
      data: {
        userId: employee.id,
        sessionId: "demo-session-1",
        mouseMoves: 142,
        keyPresses: 88,
        isActive: true,
        capturedAt: hoursAgo(2),
      },
    });
  });

  console.log("Seeded demo data successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });