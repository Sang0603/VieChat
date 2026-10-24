import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";

interface IncomingMessage {
  _id?: string;
  conversationId: string;
  senderId: string;
  content?: string | null;
  imgUrl?: string | null;
  videoUrl?: string | null;
  type?: string;
}

interface ParticipantLike {
  _id?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface ConversationLike {
  type?: string;
  group?: { name?: string } | null;
  participants?: ParticipantLike[];
}

const MAX_PERMISSION_ASKS = 3;

const isSupported = () => typeof window !== "undefined" && "Notification" in window;

// Xin quyền thông báo. Trình duyệt chỉ cho hỏi khi người dùng có thao tác,
// nên nghe click / gõ phím và hỏi, nếu popup bị đóng mà chưa chọn gì
// (quyền vẫn là "default") thì hỏi lại ở lần thao tác sau, tối đa
// MAX_PERMISSION_ASKS lần để không làm phiền.
// Trả về hàm dọn dẹp để dùng trong useEffect.
export const setupNotificationPermission = () => {
  if (!isSupported()) {
    console.debug("[notify] trình duyệt không hỗ trợ Notification");
    return () => {};
  }

  console.debug("[notify] quyền hiện tại:", Notification.permission);

  if (Notification.permission !== "default") {
    return () => {};
  }

  let asks = 0;
  let asking = false;

  const cleanup = () => {
    document.removeEventListener("click", handler);
    document.removeEventListener("keydown", handler);
  };

  function handler() {
    if (Notification.permission !== "default") {
      cleanup();
      return;
    }

    if (asking) return;
    asking = true;
    asks += 1;

    Notification.requestPermission()
      .then((result) => {
        console.debug("[notify] kết quả xin quyền:", result);
        if (result !== "default" || asks >= MAX_PERMISSION_ASKS) cleanup();
      })
      .catch(() => {
        if (asks >= MAX_PERMISSION_ASKS) cleanup();
      })
      .finally(() => {
        asking = false;
      });
  }

  document.addEventListener("click", handler);
  document.addEventListener("keydown", handler);

  return cleanup;
};

const getPreview = (message: IncomingMessage) => {
  if (message.content) return message.content;
  if (message.imgUrl) return "Đã gửi một ảnh";
  if (message.videoUrl) return "Đã gửi một video";
  if (message.type === "expense") return "Đã thêm một khoản chi";
  return "Tin nhắn mới";
};

const openConversation = (conversationId: string) => {
  const state = useChatStore.getState() as unknown as {
    setActiveConversation?: (id: string | null) => void;
  };

  if (typeof state.setActiveConversation === "function") {
    state.setActiveConversation(conversationId);
  } else {
    useChatStore.setState({ activeConversationId: conversationId });
  }
};

export const notifyIncomingMessage = (
  message: IncomingMessage,
  payloadConvo?: ConversationLike
) => {
  console.debug("[notify] nhận tin mới", message);

  if (!isSupported()) {
    console.debug("[notify] dừng: trình duyệt không hỗ trợ Notification");
    return;
  }

  if (Notification.permission !== "granted") {
    console.debug("[notify] dừng: chưa được cấp quyền, hiện là", Notification.permission);
    return;
  }

  const me = useAuthStore.getState().user?._id;

  // tin của chính mình (kể cả gửi từ thiết bị khác) thì không báo
  if (message.senderId?.toString() === me?.toString()) {
    console.debug("[notify] dừng: tin của chính mình");
    return;
  }

  // cuộc gọi đã có modal riêng
  if (message.type === "call") {
    console.debug("[notify] dừng: tin cuộc gọi");
    return;
  }

  const { activeConversationId, conversations } = useChatStore.getState();

  // đang nhìn đúng cuộc trò chuyện này, tab đang hiển thị và có focus -> khỏi báo
  const isLooking =
    document.visibilityState === "visible" &&
    document.hasFocus() &&
    activeConversationId === message.conversationId;

  if (isLooking) {
    console.debug("[notify] dừng: đang xem đúng cuộc trò chuyện này");
    return;
  }

  const convo: ConversationLike | undefined =
    conversations.find((c) => c._id === message.conversationId) ?? payloadConvo;

  const sender = convo?.participants?.find(
    (p) => p._id?.toString() === message.senderId?.toString()
  );

  const senderName = sender?.displayName || "Tin nhắn mới";
  const isGroup = convo?.type === "group";
  const title = isGroup ? convo?.group?.name || "Nhóm chat" : senderName;
  const preview = getPreview(message);
  const body = isGroup ? `${senderName}: ${preview}` : preview;

  try {
    const options: NotificationOptions & { renotify?: boolean } = {
      body,
      icon: sender?.avatarUrl ?? undefined,
      // cùng 1 cuộc trò chuyện thì thông báo mới thay thông báo cũ, không chất đống
      tag: `convo-${message.conversationId}`,
      renotify: true,
    };

    const notification = new Notification(title, options);
    console.debug("[notify] đã gọi hiện thông báo:", title, "-", body);

    notification.onclick = () => {
      window.focus();
      openConversation(message.conversationId);
      notification.close();
    };
  } catch (error) {
    // một số trình duyệt di động không cho dùng new Notification()
    console.error("[notify] không hiện được thông báo", error);
  }
};