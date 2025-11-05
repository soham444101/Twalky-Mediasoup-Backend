import jwt from "jsonwebtoken";
import { User } from "../model/user.model";
import { NextFunction, Request, Response } from "express";

export const verifyJWT = async (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];

    const decodeToken: any = jwt.verify(token, process.env.JWT_SECRET_KEY!);
    // if (!decodeToken) {
    //   console.error("Line20 /auth.middleware.ts");
    //   return res.status(401).json({ message: "User no found" });
    // }
    const user = await User.findById(decodeToken?._id).select("-email");
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = user;
    next();
  } catch (error) {
    res.status(404).json({ message: "Invalide Access Token" });
  }
};
