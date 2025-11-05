import { Server, Socket } from "socket.io";
import { Room } from "../model/room.model";
import { createRouter } from "../MediaSoup/router";
import { types } from "mediasoup";
import { error } from "console";
import { Mutex } from "async-mutex";
import { createTransport } from "../MediaSoup/transport";
import { Dead_One } from "../constant";
import { handleSocketError, removeParticipant } from "../Utilities/helper";
import { getMutexLock, getParticipantMutex, mutex } from "../Utilities/mutex";
import jwt, { Secret, SignOptions } from "jsonwebtoken";

/// storing the Session id with the routerId

// const sessionRouterMap = new Map<
//   string,
//   { router: Router; workerId: number }
// >();
export let rooms: Map<string, RoomState> = new Map(); // roomID ->  participant
export let userToRoom: Map<string, string> = new Map(); // userId->roomID
export let routerForRoom: Map<
  string,
  { router: types.Router; routerId: string; workerId: number }
> = new Map(); // router reference or routerId

type RoomState = {
  roomId: string;
  router: types.Router;
  participants: Map<string, ParticipantState>;
  producersIndex: Map<string, { uid: string; kind: string }>; // quick room-wide list
};

type ParticipantState = {
  uid: string;
  socketId: string;
  rtpCapabilities: types.RtpCapabilities | any; // store once at join
  transports: { send?: types.Transport; recv?: types.Transport };
  producers: {
    audio?: types.Producer;
    video?: types.Producer;
    screen?: types.Producer;
  };
  consumers: Map<String, types.Consumer>; // consumerId -> consumer
  pendingConsumers: Array<{
    producerId: string;
    kind: string;
    fromUserId: string;
  }>;
  metadata: {
    username: string;
    photoUrl: string;
    micOn: boolean;
    videOn: boolean;
    isSpeaking: boolean;
  };
  // lastSeen?: number; // for TTL cleanup
  cleanupTimeout?: NodeJS.Timeout; // optional for per-user setTimeout approach
};
// export let socketToUser: Map<string, string> = new Map();

export const webSocketFunction = async (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log("A user connected");
    socket.emit("message", "Hello");
    // const token = socket.handshake.auth.token;

    // const payload = jwt.decode(token); // no need to verify again
    // let expiryTimer: NodeJS.Timeout;
    // if (payload && typeof payload === "object" && payload.exp) {
    //   const expiresIn = payload.exp * 1000 - Date.now();
    //   expiryTimer = setTimeout(() => {
    //     socket.emit("accessTokenExpire");
    //   }, expiresIn + 2000);
    // }

    socket.on("prepare-screen", async ({ uid, roomId }) => {
      console.log("Preparing screen share");

      // No else block here we already check that the roomExist by using isAlive apicall
      // Room is surely present

      // Find the user routerForRoom if not present then find in Room model if not present then throw error
      // If the router present in routerForRoom

      let routerResponce: any;
      if (!routerForRoom.has(roomId)) {
        try {
          // For Db check in safty
          const session = await Room.findOne({ roomId: roomId });
          if (!session) {
            console.warn("Here the Room in not in Db ");

            socket.emit("prepare-room-error", { message: "Room not exist" });

            return;
          }
          const lock = getMutexLock(roomId);
          await lock.runExclusive(async () => {
            routerResponce = routerForRoom.get(roomId);
            // double check
            if (!routerResponce) {
              routerResponce = await createRouter();
              routerForRoom.set(roomId, {
                router: routerResponce.router,
                workerId: routerResponce.workerId,
                routerId: routerResponce.routerId,
              });
            }
          });
        } catch (error) {
          console.error("Error in Db request in prepare-screen", error);
          socket.emit("server-error", {
            message: "Db request error",
          });
          return;
        }
      } else {
        routerResponce = routerForRoom.get(roomId);
      }

      // no else condition because this is an first user
      // Following also we used or we direct send the empty array
      // following seem to more optimise save the call when no one is in room
      if (rooms.has(roomId)) {
        const participantsValues = rooms.get(roomId)?.participants?.values();
        if (participantsValues) {
          const partcipants = Array.from(participantsValues);
          socket.emit("room-info", {
            participant: partcipants,
          });
        }
      }

      // or
      // Send participants info
      // const participants = Array.from(
      //   rooms.get(roomId)?.participants?.values() ?? []
      // );
      // socket.emit("room-info", { participant: participants });
      socket.emit("rct-capability-from-server", {
        rtpCapabilities: routerResponce?.router?.rtpCapabilities,
      });
       console.log("the rctcapability send to frontend ")
       console.log("the rctcapability send to frontend ")       
      return;
    });

    // send from client and receive rctcapbilityes
    // socket.on(
    //   "send-request-rctcapability-from-client",
    //   async ({ uid, roomId }) => {
    //     // first we check that the room exist in (This we check in the time of join "isLive" event)
    //     //first if the map have the roomId and router present then create the router
    //     //save in roomIdtorouter map
    //     //send the rtccpabilities of router to frontend
    //     const isRouterPresent = routerForRoom.get(roomId);

    //     if (isRouterPresent) {
    //       socket.emit("rct-capability-from-server", {
    //         rtpCapabilities: isRouterPresent.router.rtpCapabilities,
    //       });
    //       return;
    //     }
    //     // Maximum time the code ends here because we emit first prepre-Event in that we creat that router for that room if not present

    //     const lock = getMutexLock(roomId);
    //     await lock.runExclusive(async () => {
    //       let routerResponce = routerForRoom.get(roomId);
    //       if (!routerResponce) {
    //         routerResponce = await createRouter();
    //         routerForRoom.set(roomId, {
    //           router: routerResponce.router,
    //           workerId: routerResponce.workerId,
    //           routerId: routerResponce.routerId,
    //         });
    //       }
    //       const participantLock = getParticipantMutex(uid);
    //       await participantLock.runExclusive(async () => {
    //         socket.emit("rct-capability-from-server", {
    //           rtpCapabilities: routerResponce?.router?.rtpCapabilities,
    //         });
    //       });
    //     });
    //   }
    // );
    socket.on(
      "send-rctcapability-from-client",
      async ({ uid, roomId, rtpCapabilities }) => {
        // we rtccapability see the room are created for eouter and set the rctcapability
        console.log("the rctcapability come from frontend ")
        console.log("the rctcapability come from frontend ")
        console.log("the rctcapability come from frontend ")
        console.log("the rctcapability come from frontend ")
        console.log("the rctcapability come from frontend ")
        if (
          !rtpCapabilities?.codecs ||
          !Array.isArray(rtpCapabilities.codecs)
        ) {
          socket.emit("error-event", { message: "Invalid RTP capabilities" });
          return;
        }

        const roomPresent = rooms.get(roomId);
        if (roomPresent) {
          const participant = roomPresent.participants.get(uid);

          if (participant) {
            // used here lcok of that uid
            const partcipantLock = getParticipantMutex(uid);
            await partcipantLock.runExclusive(() => {
              participant.rtpCapabilities = rtpCapabilities;
            });
            return;
          }
        }

        console.log("Room not present when setting rtpCapabilities");
        let lock = mutex.get(roomId);
        //safty check
        if (!lock) {
          lock = getMutexLock(roomId);
        }

        await lock.runExclusive(async () => {
          //
          const doubleCheck = rooms.get(roomId);
          if (doubleCheck) {
            const participant = doubleCheck.participants.get(uid);
            if (participant) {
              participant.rtpCapabilities = rtpCapabilities;
            }
            return;
          }
          //create Room And all
          if (!rooms.has(roomId)) {
            rooms.set(roomId, {
              roomId: roomId,
              router: routerForRoom.get(roomId)!.router,
              participants: new Map(),
              producersIndex: new Map(),
            });
          }
          const partcipantLock = getParticipantMutex(uid);
          await partcipantLock.runExclusive(() => {
            const room = rooms.get(roomId);
            const partcipant = room?.participants.get(uid);
            if (!partcipant) {
              let partcipant = {
                uid: uid,
                socketId: socket.id,
                transports: {},
                producers: {},
                rtpCapabilities: rtpCapabilities,
                consumers: new Map(), // consumerId -> consumer
                pendingConsumers: [],
                metadata: {
                  username: "",
                  photoUrl: "",
                  micOn: false,
                  videOn: false,
                  isSpeaking: false,
                },
              };
              room?.participants.set(uid, partcipant);
              userToRoom.set(uid, roomId);
            }
          });
        });
      }
    );

    socket.on("leave-preaparescreen", async ({ uid, roomId }) => {
      let lock = mutex.get(roomId);
      if (!lock) {
        lock = getMutexLock(roomId);
      }
      await lock.runExclusive(async () => {
        const roomExist = userToRoom.get(uid);
        if (!roomExist || roomExist !== roomId) return;
        const partcipantLock = getParticipantMutex(uid);
        await partcipantLock.runExclusive(() => {
          const participants = rooms.get(roomId)?.participants;
          if (!participants) return;
          participants.delete(uid);
          userToRoom.delete(uid);
          // here weused the mutex if two request of leave come once

          if (participants.size === 0) {
            rooms.delete(roomId);
            routerForRoom.delete(roomId);
          }
        });
      });
    });
    socket.on(
      "join-room",
      async ({
        roomId,
        uid,
        username = socket.data?.user.username || "Anonymous",
        photo,
        micOn,
        videOn,
        color,
      }) => {
        console.log("Joining room", roomId);
        //send rtc-capability from server
        //we check that the user exist in db or not
        // find that partcipant using id
        // if exist then change the user socketId , miconand videoOn
        //if not then add tod db with all details
        //see this exist any router for that first if not send responce that router generat messag flase (check in frontend) send direct thr rctcapability if fails
        // if yse then check that the rooms have this or if not the create and then add all things,
        // add to other map that userToRoom
        // send the rtccapabiltys if not having

        // send follow when we have the producer generated not know
        // throught all other that new-participant are here

        try {
          // Router present or not
          const roomLock = getMutexLock(roomId);
          await roomLock.runExclusive(async () => {
            // create the router id absence and send to the frontend if not
            let routerResponce = routerForRoom.get(roomId);
            if (!routerResponce) {
              routerResponce = await createRouter();
              routerForRoom.set(roomId, {
                router: routerResponce.router,
                workerId: routerResponce.workerId,
                routerId: routerResponce.routerId,
              });

              const participantLock = getParticipantMutex(uid);
              await participantLock.runExclusive(async () => {
                socket.emit("rct-capability-from-server", {
                  rtpCapabilities: routerResponce?.router?.rtpCapabilities,
                });
              });
            }
            // safty check we already check in send-rct-cap
            if (!rooms.has(roomId)) {
              const createLocalRoom = rooms.set(roomId, {
                roomId: roomId,
                router: routerForRoom.get(roomId)!.router,
                participants: new Map(),
                producersIndex: new Map(),
              });
            }

            const partcipantLock = getParticipantMutex(uid);
            await partcipantLock.runExclusive(async () => {
              let dbRoom;
              dbRoom = await Room.findOne({ roomId: roomId });
              if (!dbRoom) {
                dbRoom = await Room.create({
                  roomId: roomId,
                  participants: [
                    {
                      uid: uid,
                      username: username,
                      photo: photo,
                      color: color,
                    },
                  ],
                });
              } else {
                const isParticipantPresentIndex = dbRoom.participants.findIndex(
                  (p) => p.uid === uid
                );
                if (isParticipantPresentIndex !== -1) {
                  //user Already Present
                  dbRoom.participants[isParticipantPresentIndex].username =
                    username;
                  dbRoom.participants[isParticipantPresentIndex].photo = photo;
                } else {
                  // add the metadat like username and photo

                  await Room.updateOne(
                    { roomId },
                    {
                      $push: {
                        participants: {
                          uid: uid,
                          username: socket.data.user?.displayName | username,
                          photo: photo | socket.data.user?.photo,
                        },
                      },
                    }
                  );
                }
              }

              socket.join(roomId);

              const currentRoom = rooms.get(roomId);
              // if (
              //   currentUser &&
              //   !currentUser.participants.get(userId)?.rtpCapabilities
              // ) {
              //   const we_creating_router = await createRouter();
              //   routerForRoom.set(roomId, {
              //     router: we_creating_router.router,
              //     workerId: we_creating_router.workerId,
              //     routerId: we_creating_router.routerId,
              //   });
              //   socket.emit("rct-capability-from-server", {
              //     rtpCapabilities: we_creating_router.router.rtpCapabilities,
              //   });
              //   socket.on(
              //     "send-rctcapability-from-client",
              //     ({ userId, roomId, rtpCapabilities }) => {
              //       // we rtccapability see the room are created for eouter and set the rctcapability
              //       const roomPresent = rooms.get(roomId);
              //       if (roomPresent) {
              //         const participant = roomPresent.participants.get(userId);
              //         if (participant) {
              //           participant.rtpCapabilities = rtpCapabilities;
              //         }
              //       }
              //       return;
              //     }
              //   );
              // }

              const islocalParticipantExist =
                currentRoom?.participants.get(uid);
              if (currentRoom && !islocalParticipantExist) {
                currentRoom.participants.set(uid, {
                  uid: uid,
                  socketId: socket.id,
                  transports: {},
                  producers: {},
                  rtpCapabilities:
                    currentRoom.participants.get(uid)?.rtpCapabilities,
                  consumers: new Map(), // consumerId -> consumer
                  pendingConsumers: [],
                  metadata: {
                    username: username,
                    photoUrl: photo,
                    micOn: micOn,
                    videOn: videOn,
                    isSpeaking: false,
                  },
                  // lastSeen: Date.now(),
                  cleanupTimeout: undefined,
                });
              } else if (currentRoom && islocalParticipantExist) {
                islocalParticipantExist.metadata.username = username;
                islocalParticipantExist.metadata.photoUrl = photo;
                islocalParticipantExist.metadata.micOn = micOn;
                islocalParticipantExist.metadata.videOn = videOn;
                if (islocalParticipantExist.cleanupTimeout) {
                  clearTimeout(islocalParticipantExist.cleanupTimeout);
                  islocalParticipantExist.cleanupTimeout = undefined;
                }
              }
              userToRoom.set(uid, roomId);

              // socketToUser.set(socket.id, userId);
              // rooms.set(roomId, currentUser!);
              const newParticipant = rooms.get(roomId)?.participants.get(uid);
              // see this structure in frontend
              io.to(roomId).emit("new-participant", {
                user: {
                  uid: newParticipant?.uid,
                  metadata: newParticipant?.metadata,
                },
              });

              if (currentRoom) {
                const allproducers = Array.from(
                  currentRoom?.participants.values()
                ).map((p) => ({
                  uid: p.uid,
                  metadata: p.metadata,
                }));
                socket.emit("all-participant-metadata", {
                  partcipants: allproducers,
                });
              }
            });
          });

          // add the user with userId
        } catch (error) {
          console.log("Error in Join Event", error);
          const message =
            error instanceof Error
              ? error.message
              : "Server side error in Join Event";

          socket.emit("server-error", {
            message: message,
          });
        }
        //   socket.emit(
        //     "rct-capability-from-server",
        //  {
        //       roomId:userToRoom.get()
        //  }
        //   );
        //   socket.on(
        //     "rct-capability-from-client",
        //     ({ userId, roomId, rtpCapabilities }) => {
        //       console.log("Rct capabilities received from client", rtpCapabilities);
        //       const isRoomExist = rooms.get(roomId);
        //       if (isRoomExist) {
        //         rooms.set(roomId,{
        //           ...isRoomExist
        //           // participants:isRoomExist.participants.set(userId,{

        //           // })
        //       })

        //       }
        //     }
        //   );
        console.log("====================================");
        console.log("error in time of join the call ", error);
        console.log("====================================");
      }
    );
    // check heartbeatmeans every 5second this hearbeat evemt call from user side and we call the shedulatDieduser

    socket.on("heartbeat", async ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(uid);
      if (!participant) return;

      // participant.lastSeen = Date.now();

      const partcipantLock = getParticipantMutex(uid);
      await partcipantLock.runExclusive(() => {
        if (participant.cleanupTimeout) {
          clearTimeout(participant.cleanupTimeout);
        }

        // Schedule new cleanup
        participant.cleanupTimeout = setTimeout(() => {
          removeParticipant({ uid, roomId, io });
        }, Dead_One);
      });
    });

    /// here the creatTranport code starts
    socket.on("createTransport", async ({ direction, roomId, uid }, cb) => {
      let routerResponce = routerForRoom.get(roomId);
      console.log("Cb instance come from frontend", cb);
      //safty check if present itpresence not uselessfor my hearts satisfaction i done
      if (!routerResponce) {
        const lock = getMutexLock(roomId);
        await lock.runExclusive(async () => {
          if (!routerResponce) {
            routerResponce = await createRouter();
            routerForRoom.set(roomId, {
              router: routerResponce.router,
              workerId: routerResponce.workerId,
              routerId: routerResponce.routerId,
            });
          }
        });
      }
      const router = routerResponce?.router;
      try {
        const partcipantLock = getParticipantMutex(uid);
        await partcipantLock.runExclusive(async () => {
          const transport = await createTransport({
            router,
            uid,
            direction,
            roomId,
          });
          if (!transport?.params) {
            throw new Error(
              "Fail to create the new params and in 415/socket.controller.ts"
            );
          }
          cb({
            success: true,
            data: {
              message: "Params comes successfully",
              params: transport.params,
            },
          });
          // follow we remove because of callback
          // socket.emit("send-params", transport.params);
        });
      } catch (error: any) {
        const err = {
          success: false,
          error: { message: error?.message || "createTransport error" },
        };
        cb(err);
        console.log("createTransport Error", err);
        handleSocketError(socket, error, "createTransport");
      }
    });
    //connectTransport
    socket.on("connect-transport", async ({ dtlsParameters, uid }, cb) => {
      try {
        const lock = getParticipantMutex(uid);
        await lock.runExclusive(async () => {
          const roomId = userToRoom.get(uid);
          if (!roomId) {
            throw new Error(
              "RoomId is not Present in the cnnect-transport-Events"
            );
          }
          const room = rooms.get(roomId);
          if (!room) {
            userToRoom.delete(uid);

            throw new Error(
              "Room is not Present in the cnnect-transport-Events"
            );
          }
          const partcipant = rooms.get(roomId)?.participants.get(uid);
          if (!partcipant) {
            throw new Error(
              "Participant is not Present in connect-transport-Events"
            );
          }
          const sendTransport = room.participants.get(uid)?.transports?.send;

          if (sendTransport) {
            await sendTransport?.connect({ dtlsParameters });
            cb({ success: true, message: "sendTransport is created" });
            return;
          }
          const recvTransport = room.participants.get(uid)?.transports?.recv;
          if (recvTransport) {
            await recvTransport?.connect({ dtlsParameters });
            if (!room.producersIndex) {
              return;
            }

            const producerList = Array.from(room.producersIndex)
              .filter(([_, { uid: producerUserId }]) => producerUserId !== uid)
              .map(([id, info]) => ({ id, ...info }));
            socket.emit("all-producer-list-yet", producerList);
            cb({ success: true, message: "recvTransport is created" });

            if (!sendTransport || !recvTransport) {
              throw new Error(
                `"Missing the tranport here sendTransport := ",${sendTransport} ,"receiveTransport :", ${recvTransport}`
              );
            }
            return;
          }
        });
      } catch (error: any) {
        const err = {
          success: false,
          error: { message: error?.message || "Connect-transport Error error" },
        };
        cb(err);
        console.error("Error in connect-transport", error);
        handleSocketError(socket, error, "connect-transport");
      }
    });

    socket.on("produce", async ({ kind, rtpParameters, uid }, cb) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) {
          throw new Error("RoomId is not Present in the  producer Events");
        }
        const room = rooms.get(roomId);
        if (!room) {
          userToRoom.delete(uid);
          throw new Error("Room is not Present in the producer -Events");
        }

        const lock = getParticipantMutex(uid);
        await lock.runExclusive(async () => {
          const sendTransport = room.participants.get(uid)?.transports?.send;

          const producer = await sendTransport?.produce({
            kind,
            rtpParameters,
          });
          if (!producer) {
            throw new Error("Producer Event error defined");
          }
          const partcipant = room.participants.get(uid);
          if (kind === "audio" && partcipant) {
            partcipant.producers.audio = producer;
          } else if (kind === "video" && partcipant) {
            partcipant.producers.video = producer;
          }
          // else if (kind === "screen" && partcipant) {
          //   partcipant.producers.screen = producer;
          // }

          cb({
            success: true,
            data: {
              producerId: producer.id,
              message: "Producer Create Successful",
            },
          });
          console.log("====================================");
          console.log(`userId ${uid}  create ${kind} of producers`);
          console.log("====================================");
          // new producer created throught with producer so the consumer is created
          room.producersIndex.set(producer.id, { uid, kind });
          io.to(roomId).emit("new-producer", {
            kind: kind,
            producerId: producer.id,
            uid,
          });
          // current producer-list we send
        });
      } catch (error: any) {
        const err = {
          success: false,
          error: { message: error?.message || "Producer Error error" },
        };
        handleSocketError(socket, error, "produce");
        cb(err);
      }
    });

    socket.on("create-receive-transport", async ({ uid, direction }, cb) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) {
          throw new Error(
            "RoomId is not Present in the  create-receive transport - Events"
          );
        }
        const room = rooms.get(roomId);
        if (!room) {
          userToRoom.delete(uid);
          throw new Error(
            "Room is not Present in the create-receive transport - -Events"
          );
        }
        const partcipant = rooms.get(roomId)?.participants.get(uid);
        if (!partcipant) {
          throw new Error(
            "Participant is not Present in the create-receive transport -Events"
          );
        }
        // if (partcipant.transports.recv) {
        //   socket.emit("recv-transport-created", {
        //         params: {
        //   id: partcipant.transports.recv.id,
        //   iceParameters: partcipant.transports?.recv.iceParameters,
        //   iceCandidates: partcipant.transports?.recv.iceCandidates,
        //   dtlsParameters: partcipant.transports?.recv.dtlsParameters,
        // }
        //   });
        // create the new transport for userId and router
        // get the roomId router which user have
        //request the create the transport
        //send the parames to frontend

        const router = routerForRoom.get(roomId)?.router;
        const receiveTransport = await createTransport({
          router: router,
          uid: uid,
          direction: direction ? direction : "recv",
          roomId: roomId,
        });

        if (!receiveTransport?.params) {
          throw new Error(
            "Fail to create the new params and in 415/socket.controller.ts"
          );
        }
        // socket.emit("recv-transport-created", receiveTransport.params);
        cb({
          success: true,
          data: {
            message: "Params comes successfully",
            params: receiveTransport.params,
          },
        });
        const pendingConsumers = rooms
          .get(roomId)
          ?.participants.get(uid)?.pendingConsumers;
        socket.emit("pending-consumer", pendingConsumers);
        setTimeout(() => {
          const partcipant = rooms.get(roomId)?.participants.get(uid);
          if (partcipant && partcipant.pendingConsumers) {
            partcipant.pendingConsumers = [];
          }
        }, Dead_One);
        // we remove this also for safty check we used this
      } catch (error: any) {
        const err = {
          success: false,
          error: { message: error?.message || "createTransport error" },
        };
        cb(err);
        handleSocketError(socket, error, "create-receive-transport");
      }
    });
    // socket.on("conformation-pending-consumer", ({ uid }) => {
    //   const roomId = userToRoom.get(uid)!;
    //   const pendingConsumers = rooms.get(roomId)?.participants.get(uid);
    //   if (pendingConsumers?.pendingConsumers) {
    //     pendingConsumers.pendingConsumers = [];
    //   }
    // });
    socket.on(
      "create-consumer-particular-producerId",
      async ({ kind, producerId, uid, fromUserId }) => {
        try {
          //userId ; -> the one who consume
          // basic checks
          // get the recvTransport if not add to pending consumer onces
          //create the consumer for this and store this with that rooms
          const roomId = userToRoom.get(uid);
          if (!roomId) {
            throw new Error(
              "RoomId is not Present in the  create-consumer-particular-producerId- Events"
            );
          }
          const room = rooms.get(roomId);
          if (!room) {
            userToRoom.delete(uid);
            throw new Error(
              "Room is not Present in the create-consumer-particular-producerId - -Events"
            );
          }
          const partcipant = rooms.get(roomId)?.participants.get(uid);
          if (!partcipant) {
            throw new Error(
              "Participant is not Present in the create-consumer-particular-producerId -Events"
            );
          }
          const lock = getParticipantMutex(uid);
          await lock.runExclusive(async () => {
            const recvTransport = partcipant.transports?.recv;
            if (!recvTransport) {
              partcipant.pendingConsumers.push({
                kind,
                producerId,
                fromUserId,
              });
              return;
            }
            const createConsumer = await recvTransport?.consume({
              producerId: producerId,
              rtpCapabilities: partcipant.rtpCapabilities,
            });
            partcipant.consumers.set(createConsumer.id, createConsumer);

            // Notify the client about the consumer
            socket.emit("consumer-created", {
              producerId,
              consumerId: createConsumer.id,
              kind,
              rtpParameters: createConsumer.rtpParameters,
            });
          });
        } catch (error) {
          handleSocketError(
            socket,
            error,
            "create-consumer-particular-producerId"
          );
        }
      }
    );

    // Toggle-mute
    socket.on("toggle-mic", async ({ uid }) => {
      try {
        console.log("Toggel-mic",uid)
        const roomId = userToRoom.get(uid);
        if (!roomId) {
          throw new Error("RoomId is not Present in the  toggle-mic- Events");
        }
        const room = rooms.get(roomId);
        console.log("room  in toggle mic",room)
        if (!room) {
          userToRoom.delete(uid);
          throw new Error("Room is not Present in the toggle-mic -Events");
        }
        const partcipant = rooms.get(roomId)?.participants.get(uid);
        if (!partcipant) {
          throw new Error(
            "Participant is not Present in the toggle-mic-Events"
          );
        }
        const lock = getParticipantMutex(uid);
        await lock.runExclusive(() => {
          const audioProducer = partcipant.producers?.audio;
          if (!audioProducer) {
            return;
          }
          if (audioProducer.paused) {
            audioProducer.resume();
            partcipant.metadata.micOn = true;
          } else {
            audioProducer.pause();
            partcipant.metadata.micOn = false;
          }

          io.to(roomId).emit("mic-toggled", {
            uid,
            micOn: !audioProducer.paused,
          });
        });
      } catch (error) {
        handleSocketError(socket, error, "toggle-mic");
      }
    });
    //Toggle-Video

    socket.on("toggle-video", async ({ uid }) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) {
          throw new Error("RoomId is not Present in the  toggle-video Events");
        }
        const room = rooms.get(roomId);
        if (!room) {
          userToRoom.delete(uid);
          throw new Error("Room is not Present in the toggle-video-Events");
        }
        const partcipant = rooms.get(roomId)?.participants.get(uid);
        if (!partcipant) {
          throw new Error(
            "Participant is not Present in the toggle-video-Events"
          );
        }
        const lock = getParticipantMutex(uid);
        await lock.runExclusive(() => {
          const videoProducer = partcipant.producers?.video;
          if (!videoProducer) {
            return;
          }
          if (videoProducer.paused) {
            videoProducer.resume();
            partcipant.metadata.videOn = true;
          } else {
            videoProducer.pause();
            partcipant.metadata.videOn = false;
          }

          io.to(roomId).emit("video-toggled", {
            uid,
            videOn: !videoProducer.paused,
          });
        });
      } catch (error) {
        handleSocketError(socket, error, "toggle-video");
      }
    });

    // get all participant
    socket.on("get-all-participant", ({ uid }) => {
      //check roomId exist or not
      // check room exist
      //all partcipnat uid and metadata of that
      const roomId = userToRoom.get(uid);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const partcipant = Array.from(room?.participants.values()).map((p) => ({
        uid: uid,
        metadata: p.metadata,
      }));
      socket.emit("participant-list", partcipant);
    });
    // get all producer list
    socket.on("get-all-producder-list", ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const producerList = Array.from(room.producersIndex)
        .filter(([_, { uid: producerUserId }]) => producerUserId !== uid)
        .map(([id, info]) => ({ id, ...info }));
      socket.emit("all-producer-list-yet", producerList);
    });
    // reconnect -participant
    socket.emit("reconnect-participant", async ({ uid }: { uid: string }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) {
        socket.emit("reconnect-failed", { reason: "RoomId not found" });
        return;
      }
      const room = rooms.get(roomId);

      if (!room) {
        socket.emit("reconnect-failed", { reason: "Room not found" });
        return;
      }

      const participantLock = getParticipantMutex(uid);
      await participantLock.runExclusive(() => {
        // participant validation
        // cleanup the timerif present
        // update the socket.id in that partcipant
        // emit to all that the this one is reconnected
        // emit to self the details of metadata and all producer one (sel one metadata)
        const partcipant = room.participants.get(uid);
        if (!partcipant) {
          socket.emit("reconnect-failed", { reason: "Room not found" });
          return;
        }
        if (partcipant.cleanupTimeout) {
          clearTimeout(partcipant.cleanupTimeout);
        }
        socket.join(roomId);

        const partcipantMetadate = Array.from(room.participants.values())
          .filter((p) => p.uid !== uid)
          .map((p) => ({ uid: p.uid, metadata: p.metadata }));
        const producerList = Array.from(room.producersIndex.entries())
          .filter(([_, { uid: producerUid, kind }]) => producerUid !== uid)
          .map(([producerId, info]) => ({ producerId: producerId, ...info }));

        // emit event for all and socket
        socket.emit("reconnection-done", {
          partcipantMetadate,
          producerList,
          yourMetadata: partcipant.metadata,
        });

        io.to(roomId).emit("participant-reconnected", { uid });
      });
    });

    //pause
    // socket.on("pause", async ({ consumerId, uid }) => {
    //   const roomId = userToRoom.get(uid);
    //   if (!roomId) return;

    //   const room = rooms.get(roomId);
    //   if (!room) return;

    //   const participantLock = getParticipantMutex(uid);
    //   await participantLock.runExclusive(async () => {
    //     const participant = room.participants.get(uid);
    //     if (!participant) return;

    //     const consumer = participant.consumers.get(consumerId);
    //     if (!consumer) {
    //       socket.emit("error-event", { message: "Consumer not found" });
    //       return;
    //     }

    //     if (consumer.paused) {
    //       return;
    //     } else {
    //       await consumer.pause();
    //       socket.emit("consumer-pause", { consumerId });
    //     }
    //   });
    // });
    // //resume -consumer
    // socket.on("resume-consumer", async ({ consumerId, uid }) => {
    //   const roomId = userToRoom.get(uid);
    //   if (!roomId) return;

    //   const room = rooms.get(roomId);
    //   if (!room) return;

    //   const participantLock = getParticipantMutex(uid);
    //   await participantLock.runExclusive(async () => {
    //     const participant = room.participants.get(uid);
    //     if (!participant) return;

    //     const consumer = participant.consumers.get(consumerId);
    //     if (!consumer) {
    //       socket.emit("error-event", { message: "Consumer not found" });
    //       return;
    //     }

    //     if (consumer.paused) {
    //       await consumer.resume();
    //       socket.emit("consumer-resumed", { consumerId });
    //     }
    //   });
    // });

    socket.on("hang-up", ({ uid }) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) {
          throw new Error("RoomId is not Present in the  toggle-video Events");
          return;
        }
        removeParticipant({ uid, roomId, io });
      } catch (error) {
        handleSocketError(socket, error, "hang-up");
      }
    });
    socket.on("disconnect", async () => {
      console.log("Disconnected");
      const uid = socket.data.user?.uid as string;
      if (!uid) {
        return;
      }
      const roomId = userToRoom.get(uid);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const partcipant = room.participants.get(uid);
      if (!partcipant) return;
      const lock = getParticipantMutex(uid);
      await lock.runExclusive(() => {
        if (partcipant.cleanupTimeout) {
          clearTimeout(partcipant.cleanupTimeout);
        }
        partcipant.cleanupTimeout = setTimeout(() => {
          removeParticipant({ uid, roomId, io });
        }, 10000);
      });

      // checks all
      // remove partcipnat withtimeout 10-15 sec
    });
  });
};
