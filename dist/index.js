"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const socket_1 = require("./socket");
const server = http_1.default.createServer(app_1.default);
(0, socket_1.registerSocket)(server);
server.listen(env_1.env.port, () => {
    console.log(`TeamLens backend running on port ${env_1.env.port}`);
});
//# sourceMappingURL=index.js.map