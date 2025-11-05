import { config } from "../Utilities/config";
import { Router, RouterInfo } from "../Utilities/type";
import { getLeastLoadedWorker, getWorker, getWorkerStats, routers } from "./worker";

/**
 * CREATE ROUTER ON LEAST LOADED WORKER
 * Creates a router and automatically assigns it to the best available worker
 * 
 * How it works:
 * 1. Find the worker with the least routers
 * 2. Create a router on that worker
 * 3. Update our tracking information
 */
export const createRouter = async (): Promise<{ router: Router; routerId: string; workerId: number }> => {
  const workerInfo = getLeastLoadedWorker();
  
  if (!workerInfo) {
    throw new Error("No available workers to create router");
  }

  return createRouterOnWorker(workerInfo.workerId);
};

/**
 * CREATE ROUTER ON SPECIFIC WORKER
 * Creates a router on a specific worker (when you need precise control)
 * 
 * Process:
 * 1. Verify the worker exists and is active
 * 2. Call worker.createRouter() with our media codec config
 * 3. Set up event handlers for router lifecycle
 * 4. Store router information in our global state
 * 5. Update worker's router count for load balancing
 */
export const createRouterOnWorker = async (workerId: number): Promise<{ router: Router; routerId: string; workerId: number }> => {
  const worker = getWorker(workerId);
  
  if (!worker) {
    throw new Error(`Worker ${workerId} not available`);
  }

  try {
    console.log(`🛣️ Creating router on worker ${workerId}...`);
    
    // Create the actual MediaSoup router with our codec configuration
    const router = await worker.createRouter(config.router);
    const routerId = router.id; // MediaSoup generates a unique ID

    console.log(`✅ Router created [ID: ${routerId}] on worker ${workerId}`);
    console.log("router",router)

    // Store router information in our global state
    const routerInfo: RouterInfo = {
      router,
      id: routerId,
      workerId,
      createdAt: new Date(),
      transportsCount: 0
    };

    routers.set(routerId, routerInfo);

    // Update worker's router count for load balancing
    const workerStats = getWorkerStats(workerId);
    if (workerStats) {
      workerStats.routersCount++;
      console.log(`📊 Worker ${workerId} now has ${workerStats.routersCount} routers`);
    }

    // Handle router closure - clean up our tracking
    router.on('@close', () => {
      console.log(`🗑️ Router ${routerId} closed`);
      routers.delete(routerId);
      
      // Decrease worker's router count
      if (workerStats) {
        workerStats.routersCount = Math.max(0, workerStats.routersCount - 1);
        console.log(`📊 Worker ${workerId} now has ${workerStats.routersCount} routers`);
      }
    });

    return { router, routerId, workerId };
    
  } catch (error) {
    console.error(`❌ Failed to create router on worker ${workerId}:`, error);
    throw error;
  }
};

/**
 * GET ROUTER BY ID
 * Retrieve a specific router by its MediaSoup ID
 */
export const getRouter = (routerId: string): Router | null => {
  const routerInfo = routers.get(routerId);
  return routerInfo?.router || null;
};

/**
 * GET ROUTER INFORMATION
 * Get detailed information about a router
 */
export const getRouterInfo = (routerId: string): RouterInfo | null => {
  return routers.get(routerId) || null;
};

/**
 * GET ALL ROUTERS
 * Get information about all routers - useful for monitoring
 */
export const getAllRouters = (): RouterInfo[] => {
  return Array.from(routers.values());
};

/**
 * CLOSE SPECIFIC ROUTER
 * Close a router without affecting its worker
 */
export const closeRouter = async (routerId: string): Promise<void> => {
  const routerInfo = routers.get(routerId);
  if (!routerInfo) {
    console.warn(`⚠️ Router ${routerId} not found`);
    return;
  }

  console.log(`🔄 Closing router ${routerId}...`);
  routerInfo.router.close(); // This will trigger our cleanup via the '@close' event
  console.log(`✅ Router ${routerId} closed`);
};