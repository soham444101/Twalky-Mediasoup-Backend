// import { Router, WebRtcTransport } from "mediasoup/node/lib/Router";

import { types } from "mediasoup";
import { rooms } from "../controller/socket.controller";

interface CreateTransportOptions {
  router: types.Router | undefined;
  uid: string;
  direction: "send" | "recv";
  roomId: string;
}

export const createTransport = async ({
  router,
  uid,
  direction,
  roomId,
}: CreateTransportOptions) => {
  try {
    // create mediasoup WebRtcTransport
    if (!router) {
      console.error("Router is not defined");
      throw new Error("Router is not defined for this room");
    }
    const transport: types.WebRtcTransport = await router.createWebRtcTransport(
      {
        listenIps: [
          {
            ip: "0.0.0.0", // local machine IP
            announcedIp: "YOUR_PUBLIC_IP", // public IP (from server)
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      }
    );


    const participants = rooms.get(roomId)?.participants;
    const localuser = participants?.get(uid);
    if (direction === "send") {
      if (!localuser) return; // safety

      participants?.set(uid, {
        ...localuser, // keep existing consumers, pendingConsumers, metadata
        transports: {
          send: transport,
          recv: localuser.transports?.recv,
        },
      });
    } else {
      if (!localuser) return; // safety

      participants?.set(uid, {
        ...localuser, // keep existing consumers, pendingConsumers, metadata
        transports: {
          send: localuser?.transports?.send,
          recv: transport,
        },
      });
    }

    // prepare params to send to frontend
    return {
      transport,
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  } catch (error) {
    console.error("error", error);
  }
};
