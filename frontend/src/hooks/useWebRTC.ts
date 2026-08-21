// src/hooks/useWebRTC.ts
// BẢN DEBUG: thêm console.log ở mọi bước quan trọng + bắt lỗi getUserMedia
// để tìm ra chính xác chỗ đang bị nghẽn. Sau khi fix xong có thể bỏ bớt log.

import { useCallback, useRef, useState } from "react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface UseWebRTCParams {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  callType?: "audio" | "video";
}

export function useWebRTC({ onIceCandidate, callType = "audio" }: UseWebRTCParams) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const initConnection = useCallback(async () => {
    console.log("[WebRTC] initConnection() bắt đầu");

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("[WebRTC] có ICE candidate mới, gửi đi:", event.candidate.candidate);
        onIceCandidate(event.candidate.toJSON());
      } else {
        console.log("[WebRTC] ICE gathering hoàn tất (candidate cuối = null)");
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] connectionState đổi thành:", pc.connectionState);
      setConnectionState(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] iceConnectionState đổi thành:", pc.iceConnectionState);
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC] nhận được remote track!", event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      console.log("[WebRTC] getUserMedia thành công, tracks:", stream.getTracks());
    } catch (err: any) {
      console.error("[WebRTC] getUserMedia LỖI:", err.name, err.message);
      setMediaError(`Không lấy được micro/camera: ${err.name} - ${err.message}`);
      throw err; // ném lại để createOffer/createAnswer biết mà dừng
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    return pc;
  }, [callType, onIceCandidate]);

  const createOffer = useCallback(async () => {
    console.log("[WebRTC] createOffer() được gọi");
    const pc = pcRef.current ?? (await initConnection());
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("[WebRTC] đã tạo offer:", offer.type);
    return offer;
  }, [initConnection]);

  const createAnswer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      console.log("[WebRTC] createAnswer() được gọi với offer:", offer.type);
      const pc = pcRef.current ?? (await initConnection());
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("[WebRTC] đã tạo answer:", answer.type);
      return answer;
    },
    [initConnection]
  );

  const acceptAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    console.log("[WebRTC] acceptAnswer() được gọi");
    const pc = pcRef.current;
    if (!pc) {
      console.error("[WebRTC] acceptAnswer LỖI: pcRef.current là null (chưa từng createOffer?)");
      return;
    }
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("[WebRTC] đã set remote description (answer)");
  }, []);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) {
      console.warn("[WebRTC] addIceCandidate: pcRef.current chưa tồn tại, bỏ qua candidate này");
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("[WebRTC] đã thêm ICE candidate từ đối phương");
    } catch (err) {
      console.error("[WebRTC] Lỗi khi thêm ICE candidate:", err);
    }
  }, []);

  const toggleMute = useCallback((muted: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, []);

  // Bật/tắt camera - chỉ có tác dụng với cuộc gọi video (audio call không có video track)
  const toggleCamera = useCallback((cameraOff: boolean) => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
    setIsCameraOff(cameraOff);
  }, []);

  const cleanup = useCallback(() => {
    console.log("[WebRTC] cleanup() - đóng kết nối");
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setRemoteStream(null);
    setLocalStream(null);
    setConnectionState("new");
    setMediaError(null);
    setIsCameraOff(false);
  }, []);

  return {
    localStream,
    remoteStream,
    connectionState,
    mediaError,
    isCameraOff,
    initConnection,
    createOffer,
    createAnswer,
    acceptAnswer,
    addIceCandidate,
    toggleMute,
    toggleCamera,
    cleanup,
  };
}