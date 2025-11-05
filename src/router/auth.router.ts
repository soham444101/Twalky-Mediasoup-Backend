import { Router } from "express";

import { googleLogin, googleLogout, refereshTokenFun } from "../controller/main.controller";
import { validateAccessToken } from "../middleware/accessTokenValidate";

const router = Router();

router.route("/google").post(googleLogin);
router.route("/logout").post(validateAccessToken,googleLogout);
router.route("/refresh").post(refereshTokenFun);
router.route("/fcmUpdate").post(validateAccessToken,refereshTokenFun);

export default router;
