import { Mutex } from "async-mutex";

export const mutex = new Map<string, Mutex>(); // roomId -> mutex
export const partcipantMutex = new Map<string, Mutex>(); // uid -> mutex

export const getMutexLock = (roomId: string) => {
  if (!mutex.has(roomId)) {
    mutex.set(roomId, new Mutex());
  }
  return mutex.get(roomId)!;
};

export const getParticipantMutex = (uid: string) => {
  if (!partcipantMutex.has(uid)) {
    partcipantMutex.set(uid, new Mutex());
  }
  return partcipantMutex.get(uid)!;
};