import { Router } from "express";
import webRouter from "./teamlense_modules/web/routes/web.routes";
import agentRouter from "./teamlense_modules/agent/routes/agent.routes";
import mobileRouter from "./teamlense_modules/mobile/routes/mobile.routes";

const mainRoutes = Router();

mainRoutes.use("/web", webRouter);
mainRoutes.use("/agent", agentRouter);
mainRoutes.use("/mobile", mobileRouter);

export default mainRoutes;
