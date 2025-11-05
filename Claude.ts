import { Server, Socket } from "socket.io";
import { Room } from "../model/room.model";
import { createRouter } from "../MediaSoup/router";
import { types } from "mediasoup";
import { Mutex } from "async-mutex";
import { createTransport } from "../MediaSoup/transport";
import mongoose from "mongoose";
import { Dead_One } from "../constant";

export let rooms: Map<string, RoomState> = new Map();
export let userToRoom: Map<string, string> = new Map();
export let routerForRoom: Map
  string,
  { router: types.Router; routerId: string; workerId: number }
> = new Map();
export const mutex = new Map<string, Mutex>();
export const partcipantMutex = new Map<string, Mutex>();

type RoomState = {
  roomId: string;
  router: types.Router;
  participants: Map<string, ParticipantState>;
  producersIndex: Map<string, { uid: string; kind: string }>;
};

type ParticipantState = {
  uid: string;
  socketId: string;
  rtpCapabilities: types.RtpCapabilities | any;
  transports: { send?: types.Transport; recv?: types.Transport };
  producers: {
    audio?: types.Producer;
    video?: types.Producer;
    screen?: types.Producer;
  };
  consumers: Map<string, types.Consumer>;
  pendingConsumers: Array<{
    producerId: string;
    kind: string;
    fromUserId: string;
  }>;
  metadata: {
    username: string;
    photoUrl: string;
    micOn: boolean;
    videoOn: boolean; // Fixed typo
    isSpeaking: boolean;
  };
  cleanupTimeout?: NodeJS.Timeout;
};

// Consistent lock ordering: always room → participant
const getMutexLock = (roomId: string) => {
  if (!mutex.has(roomId)) {
    mutex.set(roomId, new Mutex());
  }
  return mutex.get(roomId)!;
};

const getParticipantMutex = (uid: string) => {
  if (!partcipantMutex.has(uid)) {
    partcipantMutex.set(uid, new Mutex());
  }
  return partcipantMutex.get(uid)!;
};

export const webSocketFunction = async (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log("User connected:", socket.id);

    socket.on(
      "send-request-rctcapability-from-client",
      async ({ uid, roomId }) => {
        const isRouterPresent = routerForRoom.get(roomId);

        if (isRouterPresent) {
          socket.emit("rct-capability-from-server", {
            rtpCapabilities: isRouterPresent.router.rtpCapabilities,
          });
          return;
        }

        const lock = getMutexLock(roomId);
        await lock.runExclusive(async () => {
          let routerResponce = routerForRoom.get(roomId);
          if (!routerResponce) {
            routerResponce = await createRouter();
            routerForRoom.set(roomId, {
              router: routerResponce.router,
              workerId: routerResponce.workerId,
              routerId: routerResponce.routerId,
            });
          }

          socket.emit("rct-capability-from-server", {
            rtpCapabilities: routerResponce.router.rtpCapabilities,
          });
        });
      }
    );

    socket.on(
      "send-rctcapability-from-client",
      async ({ uid, roomId, rtpCapabilities }) => {
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
            const participantLock = getParticipantMutex(uid);
            await participantLock.runExclusive(() => {
              participant.rtpCapabilities = rtpCapabilities;
            });
            return;
          }
        }

        const roomLock = getMutexLock(roomId);
        await roomLock.runExclusive(async () => {
          const doubleCheck = rooms.get(roomId);
          if (doubleCheck) {
            const participant = doubleCheck.participants.get(uid);
            if (participant) {
              const participantLock = getParticipantMutex(uid);
              await participantLock.runExclusive(() => {
                participant.rtpCapabilities = rtpCapabilities;
              });
              return;
            }
          }

          if (!rooms.has(roomId)) {
            rooms.set(roomId, {
              roomId,
              router: routerForRoom.get(roomId)!.router,
              participants: new Map(),
              producersIndex: new Map(),
            });
          }

          const participantLock = getParticipantMutex(uid);
          await participantLock.runExclusive(() => {
            const room = rooms.get(roomId)!;
            room.participants.set(uid, {
              uid,
              socketId: socket.id,
              transports: {},
              producers: {},
              rtpCapabilities,
              consumers: new Map(),
              pendingConsumers: [],
              metadata: {
                username: "",
                photoUrl: "",
                micOn: false,
                videoOn: false,
                isSpeaking: false,
              },
            });
            userToRoom.set(uid, roomId);
          });
        });
      }
    );

    socket.on(
      "join-room",
      async ({ roomId, uid, username, photo, micOn, videoOn }) => {
        try {
          const roomLock = getMutexLock(roomId);
          await roomLock.runExclusive(async () => {
            // Create router if needed
            if (!routerForRoom.has(roomId)) {
              const routerResponce = await createRouter();
              routerForRoom.set(roomId, {
                router: routerResponce.router,
                workerId: routerResponce.workerId,
                routerId: routerResponce.routerId,
              });
            }

            // Create room if needed
            if (!rooms.has(roomId)) {
              rooms.set(roomId, {
                roomId,
                router: routerForRoom.get(roomId)!.router,
                participants: new Map(),
                producersIndex: new Map(),
              });
            }

            const participantLock = getParticipantMutex(uid);
            await participantLock.runExclusive(async () => {
              // DB operations
              let dbRoom = await Room.findOne({ roomId });
              if (!dbRoom) {
                dbRoom = await Room.create({
                  roomId,
                  participants: [{ uid, username, photo }],
                });
              } else {
                const participantIndex = dbRoom.participants.findIndex(
                  (p) => p.uid === uid
                );

                // FIX: Check for -1, not falsy
                if (participantIndex === -1) {
                  await Room.updateOne(
                    { roomId },
                    { $push: { participants: { uid, username, photo } } }
                  );
                } else {
                  dbRoom.participants[participantIndex].username = username;
                  dbRoom.participants[participantIndex].photo = photo;
                  await dbRoom.save();
                }
              }

              socket.join(roomId);

              const room = rooms.get(roomId)!;
              const existingParticipant = room.participants.get(uid);

              if (!existingParticipant) {
                room.participants.set(uid, {
                  uid,
                  socketId: socket.id,
                  transports: {},
                  producers: {},
                  rtpCapabilities: undefined,
                  consumers: new Map(),
                  pendingConsumers: [],
                  metadata: {
                    username,
                    photoUrl: photo,
                    micOn,
                    videoOn,
                    isSpeaking: false,
                  },
                  cleanupTimeout: undefined,
                });
              } else {
                existingParticipant.socketId = socket.id;
                existingParticipant.metadata.username = username;
                existingParticipant.metadata.photoUrl = photo;
                existingParticipant.metadata.micOn = micOn;
                existingParticipant.metadata.videoOn = videoOn;

                if (existingParticipant.cleanupTimeout) {
                  clearTimeout(existingParticipant.cleanupTimeout);
                  existingParticipant.cleanupTimeout = undefined;
                }
              }

              userToRoom.set(uid, roomId);

              const participant = room.participants.get(uid)!;
              
              io.to(roomId).emit("new-participant", {
                user: { uid, metadata: participant.metadata },
              });

              const allParticipants = Array.from(room.participants.values()).map(
                (p) => ({
                  uid: p.uid,
                  metadata: p.metadata,
                })
              );
              socket.emit("all-participant-metadata", {
                participants: allParticipants,
              });
            });
          });
        } catch (error) {
          handleSocketError(socket, error, "join-room");
        }
      }
    );

    socket.on("heartbeat", async ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(uid);
      if (!participant) return;

      const participantLock = getParticipantMutex(uid);
      await participantLock.runExclusive(() => {
        if (participant.cleanupTimeout) {
          clearTimeout(participant.cleanupTimeout);
        }

        participant.cleanupTimeout = setTimeout(() => {
          removeParticipant({ uid, roomId, io });
        }, Dead_One);
      });
    });

    socket.on("createTransport", async ({ direction, roomId, uid }) => {
      try {
        let routerResponce = routerForRoom.get(roomId);
        if (!routerResponce) {
          const roomLock = getMutexLock(roomId);
          await roomLock.runExclusive(async () => {
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

        const participantLock = getParticipantMutex(uid);
        await participantLock.runExclusive(async () => {
          const transport = await createTransport({
            router: routerResponce!.router,
            uid,
            direction,
            roomId,
          });

          if (!transport?.params) {
            throw new Error("Failed to create transport params");
          }

          socket.emit("send-params", transport.params);
        });
      } catch (error) {
        handleSocketError(socket, error, "createTransport");
      }
    });

    socket.on("connect-transport", async ({ dtlsParameters, uid }) => {
      try {
        const participantLock = getParticipantMutex(uid);
        await participantLock.runExclusive(async () => {
          const roomId = userToRoom.get(uid);
          if (!roomId) throw new Error("Room not found");

          const room = rooms.get(roomId);
          if (!room) throw new Error("Room not found");

          const participant = room.participants.get(uid);
          if (!participant) throw new Error("Participant not found");

          const sendTransport = participant.transports.send;
          if (sendTransport) {
            await sendTransport.connect({ dtlsParameters });
            return;
          }

          const recvTransport = participant.transports.recv;
          if (recvTransport) {
            await recvTransport.connect({ dtlsParameters });

            const producerList = Array.from(room.producersIndex)
              .filter(([_, { uid: producerUid }]) => producerUid !== uid)
              .map(([id, info]) => ({ id, ...info }));

            socket.emit("all-producer-list-yet", producerList);
          }
        });
      } catch (error) {
        handleSocketError(socket, error, "connect-transport");
      }
    });

    socket.on("produce", async ({ kind, rtpParameters, uid }) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) throw new Error("Room not found");

        const room = rooms.get(roomId);
        if (!room) throw new Error("Room not found");

        const participantLock = getParticipantMutex(uid);
        await participantLock.runExclusive(async () => {
          const participant = room.participants.get(uid);
          if (!participant) throw new Error("Participant not found");

          const sendTransport = participant.transports.send;
          if (!sendTransport) throw new Error("Send transport not found");

          const producer = await sendTransport.produce({ kind, rtpParameters });

          if (kind === "audio") {
            participant.producers.audio = producer;
          } else if (kind === "video") {
            participant.producers.video = producer;
          } else if (kind === "screen") {
            participant.producers.screen = producer;
          }

          room.producersIndex.set(producer.id, { uid, kind });

          io.to(roomId).emit("new-producer", {
            kind,
            producerId: producer.id,
            uid,
          });
        });
      } catch (error) {
        handleSocketError(socket, error, "produce");
      }
    });

    socket.on("toggle-mic", async ({ uid }) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const participantLock = getParticipantMutex(uid);
        await participantLock.runExclusive(() => {
          const participant = room.participants.get(uid);
          if (!participant) return;

          const audioProducer = participant.producers.audio;
          if (!audioProducer) return;

          if (audioProducer.paused) {
            audioProducer.resume();
            participant.metadata.micOn = true;
          } else {
            audioProducer.pause();
            participant.metadata.micOn = false;
          }

          io.to(roomId).emit("mic-toggled", {
            uid,
            micOn: participant.metadata.micOn,
          });
        });
      } catch (error) {
        handleSocketError(socket, error, "toggle-mic");
      }
    });

    socket.on("toggle-video", async ({ uid }) => {
      try {
        const roomId = userToRoom.get(uid);
        if (!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const participantLock = getParticipantMutex(uid);
        await participantLock.runExclusive(() => {
          const participant = room.participants.get(uid);
          if (!participant) return;

          const videoProducer = participant.producers.video;
          if (!videoProducer) return;

          if (videoProducer.paused) {
            videoProducer.resume();
            participant.metadata.videoOn = true;
          } else {
            videoProducer.pause();
            participant.metadata.videoOn = false;
          }

          // FIX: Changed videOn to videoOn
          io.to(roomId).emit("video-toggled", {
            uid,
            videoOn: participant.metadata.videoOn,
          });
        });
      } catch (error) {
        handleSocketError(socket, error, "toggle-video");
      }
    });

    // New events
    socket.on("get-participants", ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participants = Array.from(room.participants.values()).map((p) => ({
        uid: p.uid,
        metadata: p.metadata,
      }));

      socket.emit("participants-list", { participants });
    });

    socket.on("get-producer-list", ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const producers = Array.from(room.producersIndex.entries())
        .filter(([_, info]) => info.uid !== uid)
        .map(([producerId, info]) => ({ producerId, ...info }));

      socket.emit("producer-list", { producers });
    });

    socket.on("reconnect-participant", async ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) {
        socket.emit("reconnect-failed", { reason: "Room not found" });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit("reconnect-failed", { reason: "Room not found" });
        return;
      }

      const participantLock = getParticipantMutex(uid);
      await participantLock.runExclusive(() => {
        const participant = room.participants.get(uid);
        if (!participant) {
          socket.emit("reconnect-failed", { reason: "Participant not found" });
          return;
        }

        participant.socketId = socket.id;

        if (participant.cleanupTimeout) {
          clearTimeout(participant.cleanupTimeout);
          participant.cleanupTimeout = undefined;
        }

        socket.join(roomId);

        const participants = Array.from(room.participants.values())
          .filter((p) => p.uid !== uid)
          .map((p) => ({ uid: p.uid, metadata: p.metadata }));

        const producers = Array.from(room.producersIndex.entries())
          .filter(([_, info]) => info.uid !== uid)
          .map(([producerId, info]) => ({ producerId, ...info }));

          // reconnection can we share the old consumerId so they direct consume without ? no need then send producers
        socket.emit("reconnected", {
          participants,
          producers,
          yourMetadata: participant.metadata,
        });

        io.to(roomId).emit("participant-reconnected", { uid });
      });
    });
    socket.on("pause", async ({ consumerId, uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participantLock = getParticipantMutex(uid);
      await participantLock.runExclusive(async () => {
        const participant = room.participants.get(uid);
        if (!participant) return;

        const consumer = participant.consumers.get(consumerId);
        if (!consumer) {
          socket.emit("error-event", { message: "Consumer not found" });
          return;
        }

        if (consumer.paused) {
          return
        }else{
          await consumer.pause();
          socket.emit("consumer-pause", { consumerId });
        }
      });

    socket.on("resume-consumer", async ({ consumerId, uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participantLock = getParticipantMutex(uid);
      await participantLock.runExclusive(async () => {
        const participant = room.participants.get(uid);
        if (!participant) return;

        const consumer = participant.consumers.get(consumerId);
        if (!consumer) {
          socket.emit("error-event", { message: "Consumer not found" });
          return;
        }

        if (consumer.paused) {
          await consumer.resume();
          socket.emit("consumer-resumed", { consumerId });
        }
      });

    });

    socket.on("disconnect", async () => {
      const uid = socket.data.user?.uid as string;
      if (!uid) return;

      const roomId = userToRoom.get(uid);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participantLock = getParticipantMutex(uid);
      await participantLock.runExclusive(() => {
        const participant = room.participants.get(uid);
        if (!participant) return;

        if (participant.cleanupTimeout) {
          clearTimeout(participant.cleanupTimeout);
        }

        participant.cleanupTimeout = setTimeout(() => {
          removeParticipant({ uid, roomId, io });
        }, 10000);
      });
    });

    socket.on("hang-up", ({ uid }) => {
      const roomId = userToRoom.get(uid);
      if (!roomId) return;
      removeParticipant({ uid, roomId, io });
    });
  });
};

const removeParticipant = async ({
  uid,
  roomId,
  io,
}: {
  uid: string;
  roomId: string;
  io: Server;
}) => {
  const roomLock = getMutexLock(roomId);
  await roomLock.runExclusive(async () => {
    const room = rooms.get(roomId);
    if (!room) return;

    const participantLock = getParticipantMutex(uid);
    await participantLock.runExclusive(async () => {
      const participant = room.participants.get(uid);
      if (!participant) return;

      Object.values(participant.transports).forEach((t) => t?.close());
      Object.values(participant.producers).forEach((p) => {
        if (p) {
          room.producersIndex.delete(p.id);
          p.close();
        }
      });
      participant.consumers.forEach((c) => c.close());

      if (participant.cleanupTimeout) {
        clearTimeout(participant.cleanupTimeout);
      }

      room.participants.delete(uid);
      userToRoom.delete(uid);
      partcipantMutex.delete(uid);

      io.to(roomId).emit("participant-left", { uid });

      if (room.participants.size === 0) {
        rooms.delete(roomId);
        routerForRoom.delete(roomId);
        mutex.delete(roomId);
      }

      await Room.updateOne(
        { roomId },
        { $set: { "participants.$[elem].leftAt": new Date() } },
        { arrayFilters: [{ "elem.uid": uid }] }
      );
    });
  });
};

const handleSocketError = (socket: Socket, error: unknown, event: string) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Error in ${event}:`, error);
  socket.emit("error-event", { event, message });
};

export const startCleanupJobs = () => {
  setInterval(() => {
    mutex.forEach((_, roomId) => {
      if (!rooms.has(roomId)) {
        mutex.delete(roomId);
      }
    });
  }, 300000);

  setInterval(() => {
    const activeUids = new Set(userToRoom.keys());
    partcipantMutex.forEach((_, uid) => {
      if (!activeUids.has(uid)) {
        partcipantMutex.delete(uid);
      }
    });
  }, 300000);
};