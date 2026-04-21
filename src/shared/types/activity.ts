export interface ActivityPayload {
  userId: string;
  sessionId?: string;
  mouseMoves: number;
  keyPresses: number;
  capturedAt?: string;
}

export interface ActivityRecord extends ActivityPayload {
  id: string;
  createdAt: string;
}
