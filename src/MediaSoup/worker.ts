import * as mediasoup from "mediasoup";
import os from "os";
import { config } from "../Utilities/config";
import {Router,Worker,WorkerInfo,RouterInfo} from "../Utilities/type"
export const workers: Map<number, WorkerInfo> = new Map();
export const routers: Map<string, RouterInfo> = new Map();

// =====================================
// 🔧 TYPE DEFINITIONS - TypeScript types inferred from MediaSoup
// =====================================




// =====================================
// 💾 GLOBAL STATE - In-memory storage for workers and routers
// =====================================

// Global maps to store worker and router information

let nextWorkerId = 1; // Auto-incrementing worker ID counter

// =====================================
// 🏭 WORKER MANAGEMENT FUNCTIONS
// =====================================

/**
 * CREATE SINGLE WORKER
 * This creates one MediaSoup worker process
 * 
 * How it works:
 * 1. Calls mediasoup.createWorker() with our config
 * 2. Assigns it a unique ID (workerId)
 * 3. Sets up event handlers for worker death
 * 4. Stores worker info in global map
 * 5. Starts monitoring the worker's resource usage
 */
export const createWorker = async (): Promise<{ worker: Worker; workerId: number }> => {
  try {
    console.log(`🏭 Creating worker ${nextWorkerId}...`);
    
    // Create the actual MediaSoup worker process
    const worker = await mediasoup.createWorker(config.worker);
    const workerId = nextWorkerId++;

    console.log(`✅ Worker created [ID: ${workerId}, PID: ${worker.pid}]`);

    // Handle worker death - this is critical for stability
    worker.on("died", (error) => {
      console.error(`💀 Worker ${workerId} died [PID: ${worker.pid}]:`, error);
      handleWorkerDeath(workerId);
    });

    // Store worker information in our global state
    const workerInfo: WorkerInfo = {
      worker,
      pid: worker.pid,
      workerId,
      createdAt: new Date(),
      routersCount: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      isActive: true
    };

    workers.set(workerId, workerInfo);
    
    // Start monitoring this worker's resource usage
    startWorkerMonitoring(workerId);

    return { worker, workerId };
    
  } catch (error) {
    console.error("❌ Failed to create worker:", error);
    throw error;
  }
};

/**
 * CREATE WORKER POOL
 * Creates multiple workers based on CPU cores for optimal performance
 * 
 * Why base on CPU cores?
 * - Each MediaSoup worker is a separate OS process
 * - Each worker can fully utilize one CPU core
 * - More workers than cores = unnecessary context switching overhead
 * - Fewer workers than cores = underutilized CPU power
 * 
 * MediaSoup Best Practice: 1 worker per CPU core
 */
export const createWorkerPool = async (numWorkers?: number): Promise<WorkerInfo[]> => {
  const cpuCount = os.cpus().length;
  
  // Default to CPU count, but allow override for testing/special cases
  const totalWorkers = numWorkers !== undefined ? numWorkers : cpuCount;
  
  console.log(`🏭 Creating worker pool based on system specs:`);
  console.log(`   💻 CPU Cores detected: ${cpuCount}`);
  console.log(`   🏭 Workers to create: ${totalWorkers}`);
  
  if (totalWorkers > cpuCount) {
    console.warn(`⚠️  Creating ${totalWorkers} workers for ${cpuCount} CPU cores - may cause performance issues`);
  } else if (totalWorkers < cpuCount) {
    console.warn(`⚠️  Creating ${totalWorkers} workers for ${cpuCount} CPU cores - not fully utilizing CPU`);
  } else {
    console.log(`✅ Optimal configuration: ${totalWorkers} workers for ${cpuCount} CPU cores`);
  }
  
  // Create all workers in parallel for faster startup
  const workerPromises = Array.from({ length: totalWorkers }, () => createWorker());
  
  try {
    await Promise.all(workerPromises);
    const allWorkers = Array.from(workers.values());
    console.log(`✅ Worker pool created with ${totalWorkers} workers`);
    console.log(`📊 System ready to handle ${totalWorkers}x parallel processing`);
    return allWorkers;
  } catch (error) {
    console.error("❌ Failed to create worker pool:", error);
    throw error;
  }
};

/**
 * GET LEAST LOADED WORKER
 * Finds the worker with the fewest routers for load balancing
 * 
 * Load balancing strategy:
 * - Count how many routers each worker has
 * - Return the worker with the least routers
 * - This spreads the load evenly across workers
 */
export const getLeastLoadedWorker = (): { worker: Worker; workerId: number } | null => {
  let leastLoadedWorker: { worker: Worker; workerId: number } | null = null;
  let minRouterCount = Infinity;

  // Loop through all workers to find the one with least routers
  for (const [workerId, workerInfo] of workers) {
    if (workerInfo.isActive && workerInfo.routersCount < minRouterCount) {
      minRouterCount = workerInfo.routersCount;
      leastLoadedWorker = { worker: workerInfo.worker, workerId };
    }
  }

  if (!leastLoadedWorker) {
    console.warn("⚠️ No active workers available");
  }

  return leastLoadedWorker;
};

/**
 * GET WORKER BY ID
 * Retrieve a specific worker by its ID
 */
export const getWorker = (workerId: number): Worker | null => {
  const workerInfo = workers.get(workerId);
  return workerInfo?.isActive ? workerInfo.worker : null;
};

/**
 * GET WORKER STATISTICS
 * Get detailed information about a worker's resource usage
 */
export const getWorkerStats = (workerId: number): WorkerInfo | null => {
  return workers.get(workerId) || null;
};

/**
 * GET ALL WORKERS STATISTICS
 * Get statistics for all workers - useful for monitoring
 */
export const getAllWorkersStats = (): WorkerInfo[] => {
  return Array.from(workers.values());
};

/**
 * HANDLE WORKER DEATH
 * Called when a worker process crashes
 * 
 * Recovery strategy:
 * 1. Mark worker as inactive
 * 2. Remove all routers associated with this worker
 * 3. In production: automatically create a replacement worker
 * 4. In development: exit the process for debugging
 */
const handleWorkerDeath = (workerId: number): void => {
  const workerInfo = workers.get(workerId);
  if (workerInfo) {
    workerInfo.isActive = false;
    console.log(`🗑️ Worker ${workerId} marked as inactive`);
    
    // Remove all routers that belonged to this worker
    for (const [routerId, routerInfo] of routers) {
      if (routerInfo.workerId === workerId) {
        routers.delete(routerId);
        console.log(`🗑️ Router ${routerId} removed due to worker death`);
      }
    }
  }

  // Auto-recovery based on environment
  if (process.env.NODE_ENV === 'production') {
    console.log("🔄 Auto-restarting worker in 2 seconds...");
    setTimeout(() => createWorker(), 2000);
  } else {
    console.log("💥 Development mode: exiting process for debugging");
    setTimeout(() => process.exit(1), 2000);
  }
};

/**
 * MONITOR WORKER RESOURCE USAGE
 * Continuously monitor worker memory and CPU usage
 * 
 * This helps with:
 * - Detecting memory leaks
 * - Identifying overloaded workers
 * - Making better load balancing decisions
 */
const startWorkerMonitoring = async (workerId: number): Promise<void> => {
  const workerInfo = workers.get(workerId);
  if (!workerInfo || !workerInfo.isActive) return;

  const updateStats = async () => {
    try {
      // Get resource usage from MediaSoup worker
      const usage = await workerInfo.worker.getResourceUsage();
      workerInfo.memoryUsage = Math.round(usage.ru_maxrss / 1024); // Convert to MB
      workerInfo.cpuUsage = usage.ru_utime + usage.ru_stime;
      
      // Log high resource usage
      if (workerInfo.memoryUsage > 500) { // More than 500MB
        console.warn(`⚠️ Worker ${workerId} using ${workerInfo.memoryUsage}MB memory`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to get worker ${workerId} stats:`, error);
    }
  };

  // Update stats every 30 seconds
  const interval = setInterval(updateStats, 30000);
  
  // Stop monitoring when worker dies
  workerInfo.worker.on('died', () => {
    clearInterval(interval);
    console.log(`📊 Stopped monitoring worker ${workerId}`);
  });
};

// =====================================
// 🛣️ ROUTER MANAGEMENT FUNCTIONS
// =====================================


// =====================================
// 🎯 CONVENIENCE FUNCTIONS
// =====================================

/**
 * CREATE WORKER AND ROUTER TOGETHER
 * Backward compatibility with your original function
 * 
 * This creates a dedicated worker with one router - simple but less efficient
 * Use this for small applications or when you need guaranteed isolation
 */
// export const createWorkerAndRouter = async (): Promise<{ 
//   worker: Worker; 
//   router: Router; 
//   workerId: number; 
//   routerId: string 
// }> => {
//   // Create a dedicated worker
//   const { worker, workerId } = await createWorker();
  
//   // Create a router specifically on this worker
//   const { router, routerId } = await createRouterOnWorker(workerId);
  
//   console.log(`✅ Dedicated worker ${workerId} and router ${routerId} created together`);
  
//   return { worker, router, workerId, routerId };
// };

/**
 * INITIALIZE SYSTEM
 * Sets up the entire system with CPU-optimized worker pool
 * Call this once when your server starts
 * 
 * Default behavior: Creates 1 worker per CPU core (MediaSoup best practice)
 */
export const initializeSystem = async (customWorkerCount?: number): Promise<{
  workers: WorkerInfo[];
  totalWorkers: number;
  cpuCores: number;
  isOptimal: boolean;
}> => {
  const cpuCount = os.cpus().length;
  
  console.log("🚀 Initializing MediaSoup system...");
  console.log(`💻 Detected ${cpuCount} CPU cores`);
  
  const workerInfos = await createWorkerPool(customWorkerCount);
  const isOptimal = workerInfos.length === cpuCount;
  
  console.log("✅ MediaSoup system initialized");
  console.log(`📊 System ready with ${workerInfos.length} workers on ${cpuCount} CPU cores`);
  
  if (isOptimal) {
    console.log("🎯 Perfect! Using optimal 1:1 worker-to-CPU ratio");
  } else {
    console.log(`⚠️  Non-optimal ratio: ${workerInfos.length} workers : ${cpuCount} cores`);
  }
  
  return {
    workers: workerInfos,
    totalWorkers: workerInfos.length,
    cpuCores: cpuCount,
    isOptimal
  };
};

// =====================================
// 🔧 CLEANUP FUNCTIONS
// =====================================

/**
 * CLOSE WORKER
 * Gracefully close a specific worker and all its routers
 */
export const closeWorker = async (workerId: number): Promise<void> => {
  const workerInfo = workers.get(workerId);
  if (!workerInfo) {
    console.warn(`⚠️ Worker ${workerId} not found`);
    return;
  }

  console.log(`🔄 Closing worker ${workerId}...`);
  
  // Close all routers first (they'll be automatically removed from our tracking)
  for (const [routerId, routerInfo] of routers) {
    if (routerInfo.workerId === workerId) {
      console.log(`🗑️ Closing router ${routerId}...`);
      routerInfo.router.close(); // This triggers the '@close' event we set up earlier
    }
  }

  // Close the worker process
  workerInfo.worker.close();
  workers.delete(workerId);
  
  console.log(`✅ Worker ${workerId} closed`);
};

/**
 * CLOSE ALL WORKERS
 * Gracefully shutdown the entire system
 */
export const closeAllWorkers = async (): Promise<void> => {
  console.log("🔄 Closing all workers...");
  
  // Close all workers in parallel for faster shutdown
  const closePromises = Array.from(workers.keys()).map(workerId => closeWorker(workerId));
  await Promise.all(closePromises);
  
  // Clear global state
  workers.clear();
  routers.clear();
  nextWorkerId = 1;
  
  console.log("✅ All workers closed, system shutdown complete");
};



