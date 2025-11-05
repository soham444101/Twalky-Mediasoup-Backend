import { NextFunction, Request, Response } from "express";
import jwt, { Secret, SignOptions } from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    uid: string;
  };
}
export interface JwtPayloadType {
  uid: string;
  username?: string;
  iat?: number;
  exp?: number;
}

export const validateAccessToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // first get the access token fron the header
  /// varify it if fails then call the error with particular code
 try {
   console.log("Req Header accessToken Check", req.headers);
   const authHeader = req.headers.authorization as string;
   const idToken = authHeader?.startsWith("Bearer ")
     ? authHeader.split("Bearer ")[1]
     : null;
 
     console.log("Access Token",idToken)
   if (!idToken) return res.status(401).json({ message: "Unauthorized" });
   const decodeUser = jwt.verify(
     idToken,
     process.env.ACCESS_TOKEN_SECRET as string
   ) as JwtPayloadType;
   
   console.log("DecodeUSer",decodeUser)
   if (decodeUser && decodeUser.uid) {
     req.user = {
       uid: decodeUser.uid,
     };
    return next();
   }
   return res.status(401).json({ message: "Unauthorized" });
  } catch (error) {
    console.error("Error in valideAccessssToken",error)
   return res.status(401).json({ message: "Unauthorized" });
  
 }
};
