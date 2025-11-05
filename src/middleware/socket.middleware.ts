import jwt, { JwtPayload, Secret, VerifyErrors } from "jsonwebtoken";
import { rawListeners } from "process";
import { DefaultEventsMap, ExtendedError, Socket } from "socket.io";
interface Myplaylod extends JwtPayload {
  username: string;
  uid: string;
}
export const socketMiddleware = async (
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
  next: (err?: ExtendedError | undefined) => void
) => {
  const token = socket.handshake.auth.token;
  const uid = socket.handshake.auth.uid;

  if (!token || !uid) {
    return next(new Error("Unauthorized"));
  }
  try {
    // check the access token verify and call get accessToken and then generate the access token and send access token
    // If fallback then create the refereshToken and send to frontend when the user socket is coonnected

    const payload = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as Secret
    ) as Myplaylod;
    if (payload.uid !== uid) {
      return next(new Error("Uid mismatch"));
    }
    socket.data.user = {
      username: payload.username,
      uid: payload.uid,
    };
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      return next(new Error("Token Expired"));
    }
    console.error("Socket auth error:", err);
    next(new Error("Invalide Token"));
  }
};
