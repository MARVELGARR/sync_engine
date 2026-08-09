import { Router } from "express";
import * as authCtrl from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { authRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = Router();

// Public routes — auth rate limiter applies to login/register to prevent brute-force
router.post("/register", authRateLimiter, authCtrl.register);
router.post("/login", authRateLimiter, authCtrl.login);

// Protected routes
router.get("/me", authMiddleware, authCtrl.me);

export default router;
