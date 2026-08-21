// src/stores/useCallStore.ts
// Store quản lý trạng thái cuộc gọi hiện tại

import { create } from "zustand";

export type CallStatus =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "ongoing";

export interface CallPeerInfo {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface CallState {
  status: CallStatus;
  callId: string | null;
  callType: "audio" | "video";
  conversationId: string | null;
  peer: CallPeerInfo | null;
  isMuted: boolean;
  startedAt: number | null;

  startOutgoingCall: (params: {
    callId: string;
    conversationId: string;
    peer: CallPeerInfo;
    callType?: "audio" | "video";
  }) => void;

  receiveIncomingCall: (params: {
    callId: string;
    conversationId: string;
    peer: CallPeerInfo;
    callType: "audio" | "video";
  }) => void;

  setConnecting: () => void;
  setOngoing: () => void;
  toggleMute: () => void;
  endCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: "idle",
  callId: null,
  callType: "audio",
  conversationId: null,
  peer: null,
  isMuted: false,
  startedAt: null,

  startOutgoingCall: ({ callId, conversationId, peer, callType = "audio" }) =>
    set({
      status: "outgoing",
      callId,
      conversationId,
      peer,
      callType,
      isMuted: false,
      startedAt: null,
    }),

  receiveIncomingCall: ({ callId, conversationId, peer, callType }) =>
    set({
      status: "incoming",
      callId,
      conversationId,
      peer,
      callType,
      isMuted: false,
      startedAt: null,
    }),

  setConnecting: () => set({ status: "connecting" }),

  setOngoing: () => set({ status: "ongoing", startedAt: Date.now() }),

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

  endCall: () =>
    set({
      status: "idle",
      callId: null,
      conversationId: null,
      peer: null,
      isMuted: false,
      startedAt: null,
    }),
}));