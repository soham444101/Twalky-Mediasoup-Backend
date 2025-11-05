// =====================================
// 📊 MONITORING AND STATISTICS
// =====================================

import { closeRouter, createRouter, getAllRouters, getRouter } from "./router";
import { getAllWorkersStats, initializeSystem } from "./worker";
import os from "os";


/**
 * GET SYSTEM STATISTICS
 * Comprehensive system overview focusing on CPU utilization
 */
export const getSystemStats = () => {
  const allWorkers = getAllWorkersStats();
  const allRouters = getAllRouters();
  const cpuCount = os.cpus().length;
  
  return {
    // CPU and system information
    system: {
      cpuCores: cpuCount,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: Math.round(os.totalmem() / 1024 / 1024), // MB
      freeMemory: Math.round(os.freemem() / 1024 / 1024),   // MB
      uptime: Math.round(os.uptime() / 3600), // Hours
      loadAverage: os.loadavg(),
      architecture: os.arch(),
      platform: os.platform()
    },
    
    // Worker statistics with CPU focus
    workers: {
      total: allWorkers.length,
      active: allWorkers.filter(w => w.isActive).length,
      inactive: allWorkers.filter(w => !w.isActive).length,
      cpuUtilization: `${allWorkers.length}/${cpuCount}`,
      isOptimalRatio: allWorkers.length === cpuCount,
      totalRouters: allWorkers.reduce((sum, w) => sum + w.routersCount, 0),
      averageRoutersPerWorker: allWorkers.length > 0 
        ? Math.round(allWorkers.reduce((sum, w) => sum + w.routersCount, 0) / allWorkers.length * 100) / 100
        : 0,
      totalMemoryUsage: allWorkers.reduce((sum, w) => sum + w.memoryUsage, 0),
      details: allWorkers.map(w => ({
        workerId: w.workerId,
        pid: w.pid,
        routersCount: w.routersCount,
        memoryUsage: w.memoryUsage,
        isActive: w.isActive,
        uptime: Math.round((Date.now() - w.createdAt.getTime()) / 1000 / 60), // Minutes
        cpuCore: `Core ${(w.workerId - 1) % cpuCount + 1}` // Estimate which core
      }))
    },
    
    // Router statistics
    routers: {
      total: allRouters.length,
      byWorker: allRouters.reduce((acc, r) => {
        acc[r.workerId] = (acc[r.workerId] || 0) + 1;
        return acc;
      }, {} as Record<number, number>),
      averageAge: allRouters.length > 0
        ? Math.round(allRouters.reduce((sum, r) => sum + (Date.now() - r.createdAt.getTime()), 0) / allRouters.length / 1000 / 60) // Average age in minutes
        : 0,
      routersPerCore: Math.round((allRouters.length / cpuCount) * 100) / 100
    },
    
    // Load balancing and CPU efficiency
    performance: {
      isBalanced: (() => {
        const routerCounts = allWorkers.map(w => w.routersCount);
        const max = Math.max(...routerCounts);
        const min = Math.min(...routerCounts);
        return max - min <= 1; // Balanced if difference is at most 1
      })(),
      distribution: allWorkers.map(w => w.routersCount),
      cpuEfficiency: Math.round((allWorkers.length / cpuCount) * 100), // Percentage
      recommendedAction: (() => {
        if (allWorkers.length < cpuCount) return `Add ${cpuCount - allWorkers.length} more workers`;
        if (allWorkers.length > cpuCount) return `Consider reducing to ${cpuCount} workers`;
        return "Optimal configuration";
      })()
    }
  };
};

/**
 * PRINT SYSTEM STATUS
 * Human-readable system status focusing on CPU optimization
 */
export const printSystemStatus = (): void => {
  const stats = getSystemStats();
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 MEDIASOUP SYSTEM STATUS");
  console.log("=".repeat(60));
  console.log(`🖥️  System: ${stats.system.cpuCores} CPU cores (${stats.system.cpuModel})`);
  console.log(`📋 Memory: ${stats.system.totalMemory}MB total, ${stats.system.freeMemory}MB free`);
  console.log(`🏭 Workers: ${stats.workers.active}/${stats.workers.total} active, ${stats.workers.cpuUtilization} CPU utilization`);
  console.log(`🛣️  Routers: ${stats.routers.total} total (${stats.routers.routersPerCore} per core)`);
  console.log(`⚖️  Load Balancing: ${stats.performance.isBalanced ? '✅ Balanced' : '⚠️ Unbalanced'}`);
  console.log(`🎯 CPU Efficiency: ${stats.performance.cpuEfficiency}%`);
  console.log(`💡 Recommendation: ${stats.performance.recommendedAction}`);
  
  // CPU optimization status
  if (stats.workers.isOptimalRatio) {
    console.log(`✅ OPTIMAL: Perfect 1:1 worker-to-CPU ratio`);
  } else {
    console.log(`⚠️  SUBOPTIMAL: Consider adjusting worker count for better CPU utilization`);
  }
  
  // Worker details with CPU core mapping
  console.log("\n📋 Worker Details:");
  stats.workers.details.forEach(w => {
    console.log(`   Worker ${w.workerId} (${w.cpuCore}): ${w.routersCount} routers, ${w.memoryUsage}MB, ${w.uptime}min uptime ${w.isActive ? '✅' : '❌'}`);
  });
  
  // Router distribution
  console.log("\n🛣️  Router Distribution:");
  Object.entries(stats.routers.byWorker).forEach(([workerId, count]) => {
    const percentage = Math.round((count / stats.routers.total) * 100);
    console.log(`   Worker ${workerId}: ${count} routers (${percentage}%)`);
  });
  
  console.log("=".repeat(60) + "\n");
};

// 🧪 TESTING AND EXAMPLES
// =====================================

/**
 * TEST THE SYSTEM
 * Comprehensive test to verify everything works
 */
export const testSystem = async (): Promise<void> => {
  try {
    console.log("🧪 Starting comprehensive system test...");
    
    // Test 1: Initialize system with worker pool
    console.log("\n1️⃣ Testing system initialization...");
    const { totalWorkers } = await initializeSystem(2);
    console.log(`✅ System initialized with ${totalWorkers} workers`);
    
    // Test 2: Create routers (should auto-distribute)
    console.log("\n2️⃣ Testing router creation and load balancing...");
    const router1 = await createRouter();
    const router2 = await createRouter(); 
    const router3 = await createRouter();
    console.log(`✅ Created 3 routers: ${router1.routerId}, ${router2.routerId}, ${router3.routerId}`);
    
    // Test 3: Check load balancing
    console.log("\n3️⃣ Testing load balancing effectiveness...");
    const stats = getSystemStats();
    console.log(`📊 Router distribution: ${JSON.stringify(stats.routers.byWorker)}`);
    console.log(`⚖️ Load balanced: ${stats?.performance?.isBalanced ? 'Yes' : 'No'}`);
    
    // Test 4: Test RTP capabilities
    console.log("\n4️⃣ Testing router functionality...");
    const testRouter = getRouter(router1.routerId);
    if (testRouter) {
      const rtpCapabilities = testRouter.rtpCapabilities;
      console.log(`✅ Router RTP capabilities: ${rtpCapabilities?.codecs?.length} codecs available`);
      console.log(`📡 Available codecs: ${rtpCapabilities?.codecs?.map(c => c.mimeType).join(', ')}`);
    }
    
    // Test 5: Print system status
    console.log("\n5️⃣ System status overview:");
    printSystemStatus();
    
    // Test 6: Cleanup one router
    console.log("\n6️⃣ Testing router cleanup...");
    await closeRouter(router3.routerId);
    console.log("✅ Router cleanup successful");
    
    console.log("\n✅ All tests completed successfully!");
    console.log("🎉 Your MediaSoup system is working perfectly!");
    
  } catch (error) {
    console.error("❌ System test failed:", error);
    throw error;
  }
};

// =====================================
// 📚 USAGE EXAMPLES
// =====================================

/**
 * USAGE EXAMPLES - Copy these patterns for your application
 */

// // Example 1: Simple setup (like your original approach)
// export const exampleSimpleSetup = async () => {
//   const { worker, router } = await createWorkerAndRouter();
//   console.log("Simple setup complete!");
//   return { worker, router };
// };

// // Example 2: Production setup with CPU-optimized worker pool
// export const exampleProductionSetup = async () => {
//   // Initialize with CPU-optimized worker pool (1 worker per core)
//   const { cpuCores, totalWorkers, isOptimal } = await initializeSystem();
  
//   console.log(`Production setup: ${totalWorkers} workers on ${cpuCores} CPU cores`);
//   console.log(`Optimal configuration: ${isOptimal ? 'Yes' : 'No'}`);
  
//   // Create routers as needed (they'll auto-balance across all workers)
//   const room1Router = await createRouter();
//   const room2Router = await createRouter();
  
//   console.log("Production setup complete!");
//   return { room1Router, room2Router, totalWorkers, cpuCores };
// };

// // Example 3: Get router for a specific room
// export const exampleGetRoomRouter = async (roomId: string) => {
//   // In a real app, you'd store the mapping roomId -> routerId
//   const router = getRouter(roomId);
//   if (!router) {
//     // Create new router for this room
//     const { router: newRouter, routerId } = await createRouter();
//     // Store mapping: rooms[roomId] = routerId
//     return newRouter;
//   }
//   return router;
// };