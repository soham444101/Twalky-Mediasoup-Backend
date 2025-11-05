import {Router} from "express";
import { verifyFirebaseToken } from "../middleware/socket.middleware";


const router = Router();


// router.route("/verifyaccessToken").post(verifyaccessToken);
// router.route("/validebyrefereshToken").post(validebyrefereshToken);
// router.route("/auth").post(getAccessToken);

export default router;
