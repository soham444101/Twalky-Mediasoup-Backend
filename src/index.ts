import * as http from "http";
import { Server } from "socket.io";
import { webSocketFunction } from "./controller/socket.controller";
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { connectDb } from "./database";
import { socketMiddleware } from "./middleware/socket.middleware";
import userRoute from "./router/user.router";
import authRouter from "./router/auth.router";
import { initializeSystem } from "./MediaSoup/worker";

const app = express();
// app.use(express.json())
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

dotenv.config({
  path: "./.env",
});
// console.log(`${process.env.PORT} , type : `,typeof(process.env.PORT))//String
const PORT = Number(process.env.PORT) || 5000;
//Db Connection
connectDb()
  .then(async () => {
    console.log("DB Coonected!!!!!!!!!!!!!!!!!");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on port ${PORT} !!!`);
    });
    // app.listen(PORT, "0.0.0.0", () => {
    //   console.log(`app is running on port ${PORT} !!!`);
    // });
  })
  .catch((error) => {
    console.log("Error in DB Connection", error);
  });

io.use(socketMiddleware);

app.use(express.json());
// inlizatioSystem with one worker
// initializeSystem(1);


app.use("/user", userRoute);
// app.use("/api",verifiactionCalls)
app.use("/auth", authRouter);

// app.post("/auth/google", (req: Request, res: Response) => {
//   console.log("Auth/Google Called ");
//   // const {firebaseIdToken,fcmToken}= req.body;
//   // console.log("ft",firebaseIdToken)
//   // console.log("token",fcmToken)
//   console.log("Data", req.body);
//   return res.status(200).json({ message: "SuccessFul", success: true });
// });
webSocketFunction(io);

// startCleanupJobs();
