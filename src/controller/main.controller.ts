import { Request, Response } from "express";
import { customAlphabet } from "nanoid";
import { Room } from "../model/room.model";
import admin from "../firebase/firrebase";
import { User } from "../model/user.model";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { AuthRequest } from "../middleware/accessTokenValidate";
import bcrypt from "bcrypt";
import ColorHash from "color-hash";
import { generateUserColor } from "../Utilities/colorGenerator";
import { json } from "stream/consumers";
import { platform } from "os";

const createRoom = async (req: AuthRequest, res: Response) => {
  // validation
  // create a 9 letter room id using
  // creaete the room frothat
  // return the roomId
  try {
    const uid = req.user?.uid;

    if (!uid) {
      res.status(401).json({ message: "No uid get by backend" });
      return;
    }
    const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz", 9);
    let isExist;
    let roomId;
    let attempts = 0;
    do {
      roomId = nanoid();
      isExist = await Room.exists({ roomId });
      attempts++;
      if (attempts > 5)
        throw new Error("Room ID generation failed after multiple tries");
    } while (isExist);

    console.log("Calling the Room Create ", roomId);
    const roomCreated = await Room.create({
      roomId: roomId,
      owner: uid,
      participants: [],
    });
    console.log("Create Room ", roomCreated);

    if (!roomCreated) {
      throw new Error("Fail To create the RoomId");
    }
    return res
      .status(201)
      .json({ message: "Room Id creat succesfully", data: { roomId: roomId } });
  } catch (error) {
    console.error("Fail To create the RoomId", error);
    return res
      .status(500)
      .json({ messag: "Server Error", error: true, errormessage: error });
  }
};
const rommAlive = async (req: AuthRequest, res: Response) => {
  // get the room id
  // validate (size and all)
  //see this exist in db
  // is isalive flag if presenet or not
  try {
    // const { roomId } = req.body;
    const roomId = req.query.roomId;
    console.log("RoomId is Coming in Controller", roomId);
    if (!roomId || roomId.length !== 9) {
      res.status(401).json({ message: "Invalide roomId" });
      return;
    }
    const isExist = await Room.findOne({ roomId: roomId });
    if (!isExist) {
      res.status(401).json({ message: "No roomId Exist", isAlive: false });
      return;
    }
    return res
      .status(200)
      .json({ message: "roomId Exist", isAlive: true, roomId: roomId });
  } catch (error) {
    console.error("Fail To room alive the RoomId");
    return res
      .status(500)
      .json({ messag: "Server Error", error: true, errormessage: error });
  }
};
// const verifyaccessToken = async (req: Request, res: Response) => {
//   // here we get the accesToken from the header and
//   // match that accessToken with map we have if present then no tension we
//   //  if match then send valide true or false
//   try {
//     const Token = req.header("Authorization")?.replace("Bearer ", "");
//     if (!Token) {
//       throw new Error("Token is missing");
//     }

//     const status = jwt.verify(Token, process.env.ACCESS_TOKEN_SECRET as Secret);

//     if (!status) {
//       res.status(400).json({
//         message: "UnSuccefully access Token MAtch",
//         success: false,
//       });
//     }
//     res.status(200).json({
//       message: "Succefully access Token MAtch",
//       success: true,
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: "Server Error During access Token Match",
//       success: false,
//     });
//     console.error("Server Error During access Token Match");
//   }
// };
// const validebyrefereshToken = async (req: Request, res: Response) => {
//   // here we get the uid from token by decode that one
//   // find the user in db
//   // if referesh token present then issue the access token
//   // and then send the access token to frontend
//   //not send the accessToken flag false
//   try {
//     const { uid } = req.body;
//     if (!uid) {
//       throw new Error("Uid is missing");
//     }
//     const dbCall = await User.findOne({ uid: uid });
//     if (!dbCall) {
//       return res.status(200).json({
//         meaage: "USer is not present",
//         success: false,
//       });
//     }
//     if (!dbCall.refreshToken) {
//       res.status(200).json({
//         meaage: "Referesh Token Expire",
//         success: false,
//       });
//     }
//     const refershT = jwt.verify(
//       dbCall.refreshToken as string,
//       process.env.REFRESH_TOKEN_SECRET as string
//     );
//     if (refershT) {
//       const accessToken = dbCall.GenerateAccesToken();

//       res.status(200).json({
//         meaage: "Access Token Generate Succesfully",
//         success: true,
//         data: {
//           accessToken,
//           uid: dbCall.uid,
//           email: dbCall.email,
//         },
//       });
//       return;
//     }

//     dbCall.refreshToken = "";
//     await dbCall.save({
//       validateBeforeSave: true,
//     });

//     res.status(404).json({
//       meaage: "Referesh Token Expire ",
//       success: false,
//     });
//     return;
//   } catch (error) {
//     res.status(500).json({
//       meaage: "Referesh Token Expire Server Error",
//       success: false,
//     });
//     console.error("Referesh Token Expire Server Error");
//     return;
//   }
// };
// const getAccessToken = async (req: Request, res: Response) => {
//   try {
//     const { token } = req.body;
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     // 2. Fetch full user profile
//     const userRecord = await admin.auth().getUser(decodedToken.uid);

//     const dbUser = await User.findOneAndUpdate(
//       { email: userRecord.email },
//       {
//         $set: {
//           uid: userRecord.uid,
//           username: userRecord.displayName,
//           photo: userRecord.photoURL,
//           email: userRecord.email,
//         },
//       },
//       { upsert: true, new: true }
//     );
//     if (!dbUser) {
//       throw new Error("Db call Error In getting Access Token ");
//     }
//     // generate RefereshToken and access token
//     const accessToken = dbUser.GenerateAccesToken();
//     const refereshToken = dbUser.GenerateRefreshToken();

//     dbUser.refreshToken = refereshToken;
//     await dbUser.save({
//       validateBeforeSave: false,
//     });

//     // save the referesh token and send the info and from backend like uid and email ,accessToken
//     res.status(200).json({
//       message: "Access Token Generate Succesfully",
//       success: true,
//       data: {
//         accessToken,
//         uid: userRecord.uid,
//         email: userRecord.email,
//         photo: userRecord.photoURL,
//         displayname: userRecord.displayName,
//       },
//     });
//   } catch (error) {
//     console.error("Error in getAccessToken");
//     res.status(500).json({
//       message: "Error Due to server isssue",
//       success: false,
//     });
//   }
// };
const googleLogin = async (req: Request, res: Response) => {
  const { firebaseIdToken, deviceId, fcmToken, platform } = req.body;
  // const { data } = req.body;
  console.log("We are got the request to the backend ", req.body);
  // console.table([firebaseIdToken, deviceId, fcmToken, platform]);

  // we first verify using firebase token
  // if verification successful then find and update the user with that uid decoded
  // add this device platform and fcmToken ,
  // we generats the refersh and accessToken
  //send the user details and access and refersh token
  console.log("firebaseIdtoken", firebaseIdToken)
  console.log("deviceId", deviceId)
  console.log("fcmToken", fcmToken)
  console.log("platform", platform)
  try {
    if (!firebaseIdToken || !deviceId || !fcmToken || !platform) {
      return res
        .status(400)
        .json({ mesage: "Missing the value in time of  login" });
    }
    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    if (!decodedToken.uid) {
      return res.status(403).json({ message: "Invalid Firebase token" });
    }
    console.log("Data", decodedToken);
    console.log("username", decodedToken?.name);
    if (!decodedToken.name) {
      throw new Error("Username is not present");
    }
    let user = await User.findOne({ uid: decodedToken.uid });
    let newUser = false;

    if (!user) {
      const userColore = generateUserColor(decodedToken.uid);

      user = await User.create({
        uid: decodedToken.uid,
        email: decodedToken.email,
        username: decodedToken?.name,
        photo: decodedToken.picture,
        color: userColore,
        device: [],
      });

      newUser = true;
    }
    const accessToken = user.GenerateAccesToken();
    const refereshToken = user.GenerateRefreshToken();
    const hashedRefreshToken = await bcrypt.hash(refereshToken, 10);

    user.device = user.device || [];
    const deviceDate = {
      refreshToken: hashedRefreshToken,
      deviceId: deviceId,
      fcmToken: fcmToken,
      lastActive: Date.now(),
      platform: platform,
    };

    const existingDevice = user.device.findIndex(
      (p) => p.deviceId === deviceId
    );
    if (existingDevice !== -1) {
      user.device[existingDevice] = deviceDate;
    } else {
      user.device.push(deviceDate);
    }
    await user.save({
      validateBeforeSave: false,
    });

    if (newUser) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: "Welcome to Twalky!",
          body: `Hi ${decodedToken?.name}, welcome to the app!`,
        },
      });
    } else {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: "Welcome Back!",
          body: `Hi ${decodedToken?.name}, welcome back!`,
        },
      });
    }
    const metdata = {
      uid: user.uid,
      username: user.username,
      photo: user.photo,
      email: user.email,
      color: user.color,
    };
    return res.status(200).json({
      message: newUser ? "User Signup succesfully" : "User Login successsfully",
      data: {
        accessToken: accessToken,
        refereshToken: refereshToken,
        newUser: newUser,
        user: metdata,
      },
    });
  } catch (error: any) {
    console.error("Google login error:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};
const googleLogout = async (req: AuthRequest, res: Response) => {
  // validate the accessToken
  // we get the uid and device which we remove
  // find the user and remove that device not user
  // send responce of success
  try {
    const { deviceId } = req.body;
    const uid = req.user?.uid;

    console.log("We are calling the logout come in controller");
    console.log("Device ID", deviceId);
    if (!uid || !deviceId) {
      return res
        .status(400)
        .json({ mesage: "Missing the value in time of  logout" });
    }
    const result = await User.updateOne(
      { uid: uid },
      {
        $pull: { device: { deviceId: deviceId } },
      }
    );
    if (result.modifiedCount === 0) {
      console.log("result.modeifiesCount", result.modifiedCount)
      return res.status(404).json({ message: "Device not found for user" });
    }

    console.log("logout Succesfull");

    return res.status(200).json({ message: "Logout successful" });
  } catch (error: any) {
    console.error("Google logout error:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};
const refereshTokenFun = async (req: Request, res: Response) => {
  // refershToken comes from the fron
  // validate that token
  // if its succefully validate decode the uid from them find the user and change the refersh token for that device particularly
  // send the access token back to the user
  try {
    const { refreshToken, deviceId, uid } = req.body;
    console.log("Refersh Controller is called")
    console.log("refershToken", refreshToken)
    console.log("uid", uid)
    if (!refreshToken || !deviceId || !uid) {
      return res
        .status(400)
        .json({ mesage: "Missing the value referesh token,uid or deviceId" });
    }
    const userExist = await User.findOne({ uid: uid });
    console.log("User is exist ", userExist);
    if (!userExist) {
      return res.status(404).json({ message: "USer not found in Db" });
    }
    const device = userExist.device?.find((d) => d.deviceId === deviceId);
    console.log("current device is present", device);
    if (!device) {
      return res.status(404).json({ message: "Device not found for user" });
    }
    const isMatch = await bcrypt.compare(refreshToken, device.refreshToken);
    console.log("bcrypt match", isMatch)
    if (!isMatch) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    const newaccesssToken = userExist.GenerateAccesToken();
    const newrefereshToken = userExist.GenerateRefreshToken();
    console.log("Generat both tokens", newaccesssToken, newrefereshToken);
    const hashrefereshToken = await bcrypt.hash(newrefereshToken, 10);
    device.refreshToken = hashrefereshToken;
    userExist.save({
      validateBeforeSave: false,
    });
    // maintain the same refersh Token
    return res.status(200).json({
      mesasage: "Referesh Token generated successfully",
      data: {
        accessToken: newaccesssToken,
        refreshToken: newrefereshToken,
      },
    });
  } catch (error: any) {
    console.error("Referesh Token  error:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};
const updateFCMToken = async (req: AuthRequest, res: Response) => {

  try {
    // getting the fcm fron frontend with user uid and deviceId
    const { fcmToken, deviceId } = req.body;
    const uid = req.user?.uid;
    if (!deviceId || !fcmToken) {
      return res
        .status(400)
        .json({ mesage: "Missing the value in time of  updateFCM", success: false });
    }
    let user = await User.findOne({ uid: uid });
    if (!user) {
      return res
        .status(402)
        .json({ mesage: "Invalide user ", success: false });
    }
    const deviceIndex = user.device?.findIndex((d) => d.deviceId === deviceId);
    // if device not present means the user not login/sigup 
    if (!deviceIndex) {
      return res.status(402).json({ success: false, message: "Missing user device data" })
    }

    if (deviceIndex && deviceIndex !== -1 && user?.device && user.device[deviceIndex]) {
      user.device[deviceIndex].fcmToken = fcmToken;
      user.device[deviceIndex].lastActive = Date.now();
    }
    await user.save();
    return res.status(200).json({ success: true, message: "Update Done successfully" })

  } catch (error: any) {
    console.error("Error in updateFCM")
    return res
      .status(500)
      .json({ message: error.message || "Internal server error", success: false });

  }
}

export {
  createRoom,
  rommAlive,
  // verifyaccessToken,
  // validebyrefereshToken,
  // getAccessToken,
  googleLogin,
  googleLogout,
  refereshTokenFun,
};
