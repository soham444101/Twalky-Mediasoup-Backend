import * as mediasoup from "mediasoup";
import { Types } from "mongoose";

export type Worker = Awaited<ReturnType<typeof mediasoup.createWorker>>;
export type Router = Awaited<ReturnType<Worker['createRouter']>>;

// Worker information structure
 export interface WorkerInfo {
  worker: Worker;
  pid: number;                         // Process ID of the worker
  workerId: number;                    // Our internal ID
  createdAt: Date;                     // When worker was created
  routersCount: number;                // How many routers this worker has
  isActive: boolean;                   // Is this worker still alive
  memoryUsage: number;                 // Memory usage in MB
  cpuUsage: number;                    // CPU usage
}

// Router information structure
export interface RouterInfo {
  router: Router;
  id: string;                    // MediaSoup's router ID
  workerId: number;                    // Which worker owns this router
  createdAt: Date;                     // When router was created
  transportsCount: number;             // How many transports this router has
  
}

export interface Participant {
  socketId: string;
  micOn: boolean;
  videOn: boolean;
  joinedAt: Date;
  user?: Types.ObjectId;
}
