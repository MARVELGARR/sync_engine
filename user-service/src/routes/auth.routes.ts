import { Router } from "express";
import * as authCtrl from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);

// Protected routes
router.get("/me", authMiddleware, authCtrl.me);

export default router;
