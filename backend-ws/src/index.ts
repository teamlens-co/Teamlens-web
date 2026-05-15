import http from "http";
import { env } from "./config/env";
import { registerSocket } from "./socket";

const server = http.createServer((_req, res) => {
  // Minimal health check — all REST APIs are in the Go service
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, message: "TeamLens WebSocket service is running" }));
});

registerSocket(server);

server.listen(env.port, () => {
  console.log(`TeamLens WebSocket service running on port ${env.port}`);
});
