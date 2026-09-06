import api from "@/lib/axios";
import type { ConversationResponse, Message, MessageReaction } from "@/types/chat";

interface FetchMessageProps {
  messages: Message[];
  cursor?: string;
}

// 👇 MỚI THÊM: thông tin video sau khi upload xong lên Cloudinary
interface VideoUploadResult {
  videoUrl: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
}

const pageLimit = 50;

export const chatService = {
  async fetchConversations(): Promise<ConversationResponse> {
    const res = await api.get("/conversations");
    return res.data;
  },

  async fetchMessages(id: string, cursor?: string): Promise<FetchMessageProps> {
    const res = await api.get(
      `/conversations/${id}/messages?limit=${pageLimit}&cursor=${cursor}`
    );

    return { messages: res.data.messages, cursor: res.data.nextCursor };
  },

  async uploadMessageImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await api.post("/messages/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data.imgUrl;
  },

  // 👇 MỚI THÊM: upload video, có callback theo dõi % tiến độ (vì video
  // dài sẽ mất thời gian, cần hiện progress cho người dùng)
  async uploadMessageVideo(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<VideoUploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await api.post("/messages/upload-video", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded * 100) / event.total));
      },
    });

    return {
      videoUrl: res.data.videoUrl,
      thumbnailUrl: res.data.thumbnailUrl,
      duration: res.data.duration,
    };
  },

  async sendDirectMessage(
    recipientId: string,
    content: string = "",
    imgUrl?: string,
    conversationId?: string,
    replyTo?: string,
    video?: VideoUploadResult // 👈 MỚI THÊM, để cuối cùng cho dễ tương thích ngược
  ) {
    const res = await api.post("/messages/direct", {
      recipientId,
      content,
      imgUrl,
      conversationId,
      replyTo,
      videoUrl: video?.videoUrl,
      thumbnailUrl: video?.thumbnailUrl,
      duration: video?.duration,
    });

    return res.data.message;
  },

  async sendGroupMessage(
    conversationId: string,
    content: string = "",
    imgUrl?: string,
    replyTo?: string,
    video?: VideoUploadResult // 👈 MỚI THÊM
  ) {
    const res = await api.post("/messages/group", {
      conversationId,
      content,
      imgUrl,
      replyTo,
      videoUrl: video?.videoUrl,
      thumbnailUrl: video?.thumbnailUrl,
      duration: video?.duration,
    });
    return res.data.message;
  },

  async markAsSeen(conversationId: string) {
    const res = await api.patch(`/conversations/${conversationId}/seen`);
    return res.data;
  },

  async createConversation(
    type: "direct" | "group",
    name: string,
    memberIds: string[]
  ) {
    const res = await api.post("/conversations", { type, name, memberIds });
    return res.data.conversation;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<MessageReaction[]> {
    const res = await api.patch(`/messages/${messageId}/reaction`, { emoji });
    return res.data.reactions;
  },

  async hideConversation(conversationId: string) {
    const res = await api.delete(`/conversations/${conversationId}`);
    return res.data;
  },
};