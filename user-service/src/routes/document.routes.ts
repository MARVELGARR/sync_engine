import { Router } from "express";
import * as docCtrl from "../controllers/document.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// All document routes require authentication
router.use(authMiddleware);

router.post("/", docCtrl.create);
router.get("/", docCtrl.list);
router.get("/:id", docCtrl.getById);
router.delete("/:id", docCtrl.remove);
router.post("/:id/share", docCtrl.share);
router.delete("/:id/share/:userId", docCtrl.revokeShare);

// Internal endpoint — called by sync-service to verify access
router.get("/:id/authorize", docCtrl.authorize);

export default router;
