"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web_routes_1 = __importDefault(require("./teamlense_modules/web/routes/web.routes"));
const agent_routes_1 = __importDefault(require("./teamlense_modules/agent/routes/agent.routes"));
const mobile_routes_1 = __importDefault(require("./teamlense_modules/mobile/routes/mobile.routes"));
const mainRoutes = (0, express_1.Router)();
mainRoutes.use("/web", web_routes_1.default);
mainRoutes.use("/agent", agent_routes_1.default);
mainRoutes.use("/mobile", mobile_routes_1.default);
exports.default = mainRoutes;
//# sourceMappingURL=mainRoutes.js.map