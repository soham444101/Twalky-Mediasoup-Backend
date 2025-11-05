import { Router } from "express";
import { createRoom, rommAlive } from "../controller/main.controller";
// import { verifyFirebaseToken } from "../middleware/socket.middleware";
import { validateAccessToken } from "../middleware/accessTokenValidate";

const router = Router();

router.route("/create-room").get(validateAccessToken, createRoom);
router.route("/is-alive").post(validateAccessToken, rommAlive);
export default router;
