// import { RtpCodecCapability, TransportListenIp, WorkerLogTag } from "mediasoup/types";
import os from "os";

// export const config = {
//   listenIp: "0.0.0.0",
//   listenPort: 3016,
//   mediasoap: {
//     // Worker settings
//     numberWorker: Object.keys(os.cpus()).length,
//     worker: {
//       rtcminport: 40000,
//       rtcmaxport: 49999,
//       loglevel: "debug",
//       logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"] as WorkerLogTag[],
//     },
//     roter: {
//       mediaCodecs: [
//         {
//           kind: "audio",
//           mimeType: "audio/opus",
//           clockRate: 48000,
//           channels: 2,
//         },
//         {
//           kind: "video",
//           mimeType: "video/VP8",
//           clockRate: 90000,
//           parameters: {
//             "x-google-start-bitrate": 1000,
//           },
//         },
//       ] as RtpCodecCapability[],
//     },
//     webRtcTransport: {
//       listenIps: [
//         {
//           ip: "0.0.0.0",
//           announcedIp: undefined, // replace by public IP address
//         },
//       ] as TransportListenIp[],
//     },
//   },
// } as const;





type WorkerLogTag = 'info' | 'ice' | 'dtls' | 'rtp' | 'srtp' | 'rtcp' | 'rtx' | 'bwe' | 'score' | 'simulcast' | 'svc' | 'sctp' | 'message';
 type WorkerLogLevel = "debug" | "warn" | "error" | "none"
// =====================================
// 📋 CONFIGURATION - All settings in one place
// =====================================

export const config = {
  // Worker configuration - These are MediaSoup worker process settings
  worker: {
    logLevel: "debug" as WorkerLogLevel,        // How much logging: debug, warn, error, none
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"]  as WorkerLogTag[], // What to log
    rtcMinPort: 40000,                 // Start of port range for RTC connections
    rtcMaxPort: 49999,                 // End of port range for RTC connections
    // dtlsCertificateFile: undefined,    // Optional: Custom DTLS certificate
    // dtlsPrivateKeyFile: undefined,     // Optional: Custom DTLS private key
  },
  
  // Router configuration - These define what media formats are supported
  router: {
    mediaCodecs: [
      // Audio codecs
      {
        kind: "audio" as const,
        mimeType: "audio/opus",         // Opus codec for high-quality audio
        clockRate: 48000,               // Sample rate
        channels: 2,                    // Stereo
        parameters: {
          "useinbandfec": 1,            // Forward Error Correction
          "usedtx": 1,                  // Discontinuous Transmission (silence suppression)
        }
      },
      {
        kind: "audio" as const,
        mimeType: "audio/PCMU",         // G.711 μ-law for compatibility
        clockRate: 8000,
      },
      // Video codecs
      {
        kind: "video" as const,
        mimeType: "video/VP8",          // VP8 codec (WebRTC standard)
        clockRate: 90000,               // Standard video clock rate
        parameters: {
          "x-google-start-bitrate": 1000, // Starting bitrate in kbps
          "x-google-max-bitrate": 2000,   // Maximum bitrate
          "x-google-min-bitrate": 100,    // Minimum bitrate
        }
      },
      {
        kind: "video" as const,
        mimeType: "video/H264",         // H.264 codec for broader compatibility
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,       // NAL unit mode
          "profile-level-id": "4d0032",  // Main profile, level 5.0
          "level-asymmetry-allowed": 1,
        }
      }
    ]
  },
  
  // System limits - Based on CPU architecture
  system: {
    // Optimal workers = CPU cores (MediaSoup best practice)
    optimalWorkers: os.cpus().length,        // Always match CPU count
    maxWorkersAllowed: os.cpus().length * 2, // Emergency override (not recommended)
    maxRoutersPerWorker: 50,                 // Reasonable limit per worker
    maxTransportsPerRouter: 500,             // Reasonable limit per router
    
    // Resource monitoring thresholds
    memoryWarningThreshold: 512,             // MB per worker
    cpuWarningThreshold: 80,                 // CPU usage percentage
  }
} ;
