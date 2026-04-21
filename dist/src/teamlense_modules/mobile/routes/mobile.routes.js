"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mobileRouter = (0, express_1.Router)();
mobileRouter.get("/health", (_req, res) => {
    res.json({
        success: true,
        module: "mobile",
        message: "Mobile module placeholder ready",
    });
});
exports.default = mobileRouter;
//# sourceMappingURL=mobile.routes.js.map