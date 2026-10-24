// src/hooks/useGroupWebRTC.ts
// Quản lý nhiều RTCPeerConnection (mesh): mỗi người khác trong cuộc gọi = 1 kết nối.
// Quy ước: NGƯỜI VỪA VÀO là bên tạo offer tới những người đã ở trong phòng.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

interface PeerEntry {
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[]; // ICE đến trước khi có remoteDescription
  hasRemote: boolean;
}

interface Params {
  socket: Socket | null;
  conversationId: string;
  callType: "audio" | "video";
}

export function useGroupWebRTC({ socket, conversationId, callType }: Params) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    if (!socket || !conversationId) return;

    let cancelled = false;
    let joined = false;
    const peers = peersRef.current;

    const sendSignal = (toUserId: string, data: any) => {
      socket.emit("group-call:signal", { conversationId, toUserId, data });
    };

    const removePeer = (peerId: string) => {
      const entry = peers.get(peerId);
      if (!entry) return;
      entry.pc.close();
      peers.delete(peerId);
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    const createPeer = (peerId: string): PeerEntry => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = { pc, pending: [], hasRemote: false };
      peers.set(peerId, entry);

      const local = localStreamRef.current;
      local?.getTracks().forEach((track) => pc.addTrack(track, local));

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(peerId, { type: "ice", candidate: e.candidate.toJSON() });
      };

      pc.ontrack = (e) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] }));
      };

      pc.onconnectionstatechange = () => {
        console.log(`[GroupCall] ${peerId} ->`, pc.connectionState);
        if (pc.connectionState === "failed") removePeer(peerId);
      };

      return entry;
    };

    const flushPending = async (entry: PeerEntry) => {
      const queued = entry.pending.splice(0);
      for (const c of queued) {
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (err) {
          console.error("[GroupCall] addIceCandidate (queue) lỗi:", err);
        }
      }
    };

    // Mình vừa vào -> tạo offer tới từng người đã có mặt
    const onParticipants = async ({
      conversationId: cid,
      peers: peerIds,
    }: {
      conversationId: string;
      peers: string[];
    }) => {
      if (cid !== conversationId) return;
      for (const peerId of peerIds) {
        try {
          const entry = createPeer(peerId);
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          sendSignal(peerId, { type: "offer", sdp: offer });
        } catch (err) {
          console.error("[GroupCall] tạo offer lỗi:", err);
        }
      }
    };

    const onSignal = async ({
      conversationId: cid,
      fromUserId,
      data,
    }: {
      conversationId: string;
      fromUserId: string;
      data: any;
    }) => {
      if (cid !== conversationId) return;

      try {
        if (data.type === "offer") {
          if (peers.has(fromUserId)) removePeer(fromUserId); // người đó vào lại
          const entry = createPeer(fromUserId);
          await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          entry.hasRemote = true;
          await flushPending(entry);
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          sendSignal(fromUserId, { type: "answer", sdp: answer });
        } else if (data.type === "answer") {
          const entry = peers.get(fromUserId);
          if (!entry) return;
          await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          entry.hasRemote = true;
          await flushPending(entry);
        } else if (data.type === "ice") {
          const entry = peers.get(fromUserId);
          if (!entry) return;
          if (entry.hasRemote) {
            await entry.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            entry.pending.push(data.candidate);
          }
        }
      } catch (err) {
        console.error("[GroupCall] xử lý signal lỗi:", err);
      }
    };

    const onPeerLeft = ({
      conversationId: cid,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      if (cid !== conversationId) return;
      removePeer(userId);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err: any) {
        console.error("[GroupCall] getUserMedia lỗi:", err);
        setMediaError(`Không lấy được micro/camera: ${err.name} - ${err.message}`);
        return;
      }

      socket.on("group-call:participants", onParticipants);
      socket.on("group-call:signal", onSignal);
      socket.on("group-call:peer-left", onPeerLeft);

      socket.emit("group-call:join", { conversationId, callType });
      joined = true;
    })();

    return () => {
      cancelled = true;

      socket.off("group-call:participants", onParticipants);
      socket.off("group-call:signal", onSignal);
      socket.off("group-call:peer-left", onPeerLeft);

      if (joined) socket.emit("group-call:leave", { conversationId });

      peers.forEach((entry) => entry.pc.close());
      peers.clear();

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      setLocalStream(null);
      setRemoteStreams({});
      setMediaError(null);
      setIsMuted(false);
      setIsCameraOff(false);
    };
  }, [socket, conversationId, callType]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraOff((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  return {
    localStream,
    remoteStreams,
    mediaError,
    isMuted,
    isCameraOff,
    toggleMute,
    toggleCamera,
  };
}