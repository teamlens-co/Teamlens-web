import { prisma } from "../../../shared/db/prisma";

type UploadRecordingPayload = {
  managerId: string;
  employeeId: string;
  organizationId: string;
  liveSessionId?: string;
  filePath: string;
  fileSize: number;
  durationMs: number;
  mimeType?: string;
  recordedAt: Date;
};

type GetRecordingsPayload = {
  organizationId: string;
  employeeId?: string;
  managerId?: string;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
};

export const RecordingService = {
  async saveRecording(payload: UploadRecordingPayload) {
    return prisma.screenRecording.create({
      data: {
        managerId: payload.managerId,
        employeeId: payload.employeeId,
        organizationId: payload.organizationId,
        liveSessionId: payload.liveSessionId ?? null,
        filePath: payload.filePath,
        fileSize: payload.fileSize,
        durationMs: payload.durationMs,
        mimeType: payload.mimeType ?? "video/webm",
        recordedAt: payload.recordedAt,
      },
    });
  },

  async getRecordings(payload: GetRecordingsPayload) {
    return prisma.screenRecording.findMany({
      where: {
        organizationId: payload.organizationId,
        ...(payload.employeeId ? { employeeId: payload.employeeId } : {}),
        ...(payload.managerId ? { managerId: payload.managerId } : {}),
        ...(payload.startDate || payload.endDate
          ? {
              recordedAt: {
                ...(payload.startDate ? { gte: payload.startDate } : {}),
                ...(payload.endDate ? { lte: payload.endDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { recordedAt: "desc" },
      take: payload.limit ?? 50,
    });
  },

  async getRecordingById(id: string) {
    return prisma.screenRecording.findUnique({
      where: { id },
    });
  },

  async deleteRecording(id: string) {
    return prisma.screenRecording.delete({
      where: { id },
    });
  },
};
