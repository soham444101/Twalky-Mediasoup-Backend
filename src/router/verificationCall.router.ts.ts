import {Router} from "express";
import {  createRoom, rommAlive } from "../controller/main.controller";
import { verifyFirebaseToken } from "../middleware/verification";


const router = Router();


// router.route("/verifyaccessToken").post(verifyaccessToken);

export default router;
