// src/stores/useGroupCallStore.ts
// Trạng thái cuộc gọi NHÓM (tách riêng với useCallStore của cuộc gọi 1-1)

import { create } from "zustand";

export type GroupCallStatus = "idle" | "incoming" | "active";

interface GroupCallState {
  status: GroupCallStatus;
  conversationId: string | null;
  callType: "audio" | "video";
  groupName: string;
  callerName: string;
  callerAvatar: string | null;

  // Mình bấm gọi / tham gia luôn
  startCall: (params: {
    conversationId: string;
    callType: "audio" | "video";
    groupName: string;
  }) => void;

  // Có người trong nhóm gọi tới
  receiveIncoming: (params: {
    conversationId: string;
    callType: "audio" | "video";
    groupName: string;
    callerName: string;
    callerAvatar?: string | null;
  }) => void;

  acceptIncoming: () => void;
  endCall: () => void;
}

export const useGroupCallStore = create<GroupCallState>((set, get) => ({
  status: "idle",
  conversationId: null,
  callType: "audio",
  groupName: "",
  callerName: "",
  callerAvatar: null,

  startCall: ({ conversationId, callType, groupName }) => {
    if (get().status !== "idle") return;
    set({
      status: "active",
      conversationId,
      callType,
      groupName,
      callerName: "",
      callerAvatar: null,
    });
  },

  receiveIncoming: ({ conversationId, callType, groupName, callerName, callerAvatar }) =>
    set({
      status: "incoming",
      conversationId,
      callType,
      groupName,
      callerName,
      callerAvatar: callerAvatar ?? null,
    }),

  acceptIncoming: () => set({ status: "active" }),

  endCall: () =>
    set({
      status: "idle",
      conversationId: null,
      callType: "audio",
      groupName: "",
      callerName: "",
      callerAvatar: null,
    }),
}));