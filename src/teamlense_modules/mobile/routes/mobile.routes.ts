import { Router } from "express";

const mobileRouter = Router();

mobileRouter.get("/health", (_req, res) => {
  res.json({
    success: true,
    module: "mobile",
    message: "Mobile module placeholder ready",
  });
});

export default mobileRouter;
