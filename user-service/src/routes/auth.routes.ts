import { Router } from "express";
import * as authCtrl from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { authRateLimiter, guestRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = Router();

// Public routes — auth rate limiter applies to login/register to prevent brute-force
router.post("/register", authRateLimiter, authCtrl.register);
router.post("/login", authRateLimiter, authCtrl.login);
// Ephemeral guest sessions — stricter hourly cap (anonymous + cheap to mint).
router.post("/guest", guestRateLimiter, authCtrl.guest);

// Protected routes
router.get("/me", authMiddleware, authCtrl.me);
router.post("/refresh", authMiddleware, authCtrl.refresh);
// Guest -> full account conversion (requires the guest JWT).
router.post("/claim", authMiddleware, authCtrl.claim);

export default router;
