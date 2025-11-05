import { Server, Socket } from "socket.io";
import {
  rooms,
  routerForRoom,
  userToRoom,
} from "../controller/socket.controller";
import { getParticipantMutex, mutex, partcipantMutex } from "./mutex";
import { Room } from "../model/room.model";

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

export const handleSocketError = (
  socket: Socket,
  error: unknown,
  event: string
) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Message of socket error ", message);
  socket.emit("error-event", { event, message });
};

export const removeParticipant = async ({
  uid,
  roomId,
  io
}: {
  uid: string;
  roomId: string;
  io: Server;
}) => {
  let lock = mutex.get(roomId);
  if (!lock) {
    return;
  }
  await lock.runExclusive(async () => {
    // we se we have the room exist and that partrcipant also then we only get the rooms particular participant and make each track disable if availabe
    try {
      const room = rooms.get(roomId);
      if (!room) return;
      const participant = room.participants.get(uid);
      if (!participant) return;

      const partcipantLock = getParticipantMutex(uid);
      await partcipantLock.runExclusive(async () => {
        if (participant.transports) {
          Object.values(participant.transports).forEach((t) => t && t.close());
        }
        if (participant.producers) {
          // if(screenone) room.producersIndex.delete(screenone);
          Object.values(participant.producers).forEach((p) => {
            if (p) {
              room.producersIndex.delete(p.id);
              p.close();
            }
          });
        }
        if (participant.consumers) {
          participant.consumers.forEach((c) => c && c.close());
        }
        participant.pendingConsumers = [];

        if (participant.cleanupTimeout) {
          clearTimeout(participant.cleanupTimeout);
        }

        room.participants.delete(uid);
        userToRoom.delete(uid);
        // socketToUser.delete(socket.id);

        io.to(roomId).emit("participant-left", { uid });

        if (room.participants.size === 0) {
          rooms.delete(roomId);
          routerForRoom.delete(roomId);
        }
        console.log(`Removed participant ${uid} from room ${roomId}`);
        await Room.updateOne(
          { roomId },
          {
            $set: { "participants.$[elem].leftAt": new Date() },
          },
          {
            arrayFilters: [{ "elem.uid": uid }],
          }
        );
      });
    } catch (error) {
      console.error("Error occures in removeParticipant");
    }
  });
};
