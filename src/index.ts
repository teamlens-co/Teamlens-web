import type { AuthContext } from "./shared/types/auth";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

import http from "http";
import app from "./app";
import { env } from "./config/env";
import { registerSocket } from "./socket";

const server = http.createServer(app);

registerSocket(server);

server.listen(env.port, () => {
  console.log(`TeamLens backend running on port ${env.port}`);
});
