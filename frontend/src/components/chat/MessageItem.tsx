import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Reply } from "lucide-react";
import { useStartCall } from "@/hooks/useStartCall";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore"; // 👈 mới thêm

interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
  lastMessageStatus: "delivered" | "seen";
}

// 👇 MỚI THÊM: bộ emoji reaction theo kiểu Facebook
const REACTION_EMOJIS = ["👍", "❤️", "😆", "😮", "😢", "😡"];

function getCallLabel(message: Message, isOwn: boolean) {
  const info = message.callInfo;
  if (!info) return { title: "", subtitle: "" };

  const callTypeLabel = info.callType === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại";

  if (info.status === "completed") {
    const m = Math.floor(info.durationInSeconds / 60);
    const s = info.durationInSeconds % 60;
    return {
      title: isOwn ? `${callTypeLabel} đi` : `${callTypeLabel} đến`,
      subtitle: `${m} phút ${s} giây`,
    };
  }

  if (info.status === "missed" || info.status === "cancelled") {
    return {
      title: isOwn ? "Bạn đã hủy" : "Cuộc gọi nhỡ",
      subtitle: callTypeLabel,
    };
  }

  // rejected
  return {
    title: isOwn ? "Cuộc gọi bị từ chối" : "Bạn đã từ chối",
    subtitle: callTypeLabel,
  };
}

// 👇 MỚI THÊM: thanh chọn emoji hiện khi hover vào tin nhắn (giống Facebook)
const ReactionPicker = ({
  isOwn,
  myReaction,
  onSelect,
}: {
  isOwn: boolean;
  myReaction?: string;
  onSelect: (emoji: string) => void;
}) => {
  return (
    <div
      className={cn(
        "absolute -top-11 z-10 flex items-center gap-0.5 rounded-full bg-background border shadow-md px-2 py-1",
        "opacity-0 scale-95 pointer-events-none",
        "group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto",
        "transition-smooth",
        isOwn ? "right-0" : "left-0"
      )}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className={cn(
            "text-lg leading-none rounded-full p-1.5 hover:scale-125 hover:bg-muted transition-transform",
            myReaction === emoji && "bg-muted"
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

const MessageItem = ({
  message,
  index,
  messages,
  selectedConvo,
  lastMessageStatus,
}: MessageItemProps) => {
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const toggleReaction = useChatStore((s) => s.toggleReaction); // 👈 mới thêm
  const currentUser = useAuthStore((s) => s.user); // 👈 mới thêm

  const prev = index + 1 < messages.length ? messages[index + 1] : undefined;

  const isShowTime =
    index === 0 ||
    new Date(message.createdAt).getTime() -
      new Date(prev?.createdAt || 0).getTime() >
      300000; // 5 phút

  const isGroupBreak = isShowTime || message.senderId !== prev?.senderId;

  const participant = selectedConvo.participants.find(
    (p: Participant) => p._id.toString() === message.senderId.toString()
  );

  const isCallMessage = message.type === "call" && !!message.callInfo;

  // người để "Gọi lại": luôn là đối phương trong cuộc trò chuyện này
  const otherParticipant = selectedConvo.participants.find(
    (p: Participant) => p._id.toString() !== message.senderId.toString()
  );

  const { startCall, canCall } = useStartCall(selectedConvo._id);

  const handleReplyClick = () => {
    setReplyingTo({
      _id: message._id,
      content: message.content,
      imgUrl: message.imgUrl,
      senderId: message.senderId,
      senderName: participant?.displayName,
    });
  };

  // 👇 MỚI THÊM: reaction của chính mình + tổng hợp reaction để hiển thị badge
  const myReaction = message.reactions?.find(
    (r) => r.userId === currentUser?._id
  )?.emoji;

  const reactionSummary = message.reactions?.length
    ? Object.entries(
        message.reactions.reduce<Record<string, number>>((acc, r) => {
          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : [];

  const totalReactions = message.reactions?.length ?? 0;

  const handleSelectReaction = (emoji: string) => {
    toggleReaction(message._id, emoji);
  };

  if (isCallMessage) {
    const info = message.callInfo!;
    const isOwn = !!message.isOwn;
    const { title, subtitle } = getCallLabel(message, isOwn);

    const isMissedOrCancelled = info.status === "missed" || info.status === "cancelled";
    const isRejected = info.status === "rejected";
    const isIncomingLine = !isOwn; // hướng của icon điện thoại nhỏ (đến/đi)

    // icon dòng thời lượng - chỉ icon đổi màu theo trạng thái, chữ giữ màu mặc định
    const LineIcon = isMissedOrCancelled || isRejected
      ? PhoneMissed
      : isIncomingLine
      ? PhoneIncoming
      : PhoneOutgoing;

    const lineColorClass =
      isMissedOrCancelled || isRejected ? "text-red-500" : "text-emerald-500";

    return (
      <>
        {isShowTime && (
          <span className="flex justify-center text-xs text-muted-foreground px-1">
            {formatMessageTime(new Date(message.createdAt))}
          </span>
        )}

        <div
          className={cn(
            "flex gap-2 message-bounce mt-1",
            message.isOwn ? "justify-end" : "justify-start"
          )}
        >
          {!message.isOwn && (
            <div className="w-8">
              {isGroupBreak && (
                <UserAvatar
                  type="chat"
                  name={participant?.displayName ?? "Moji"}
                  avatarUrl={participant?.avatarUrl ?? undefined}
                />
              )}
            </div>
          )}

          <Card className="w-44 space-y-2 p-3 bg-background border">
            <div className="text-foreground">
              <span className="text-sm font-medium leading-tight">{title}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <LineIcon className={cn("size-3.5 shrink-0", lineColorClass)} />
              <span className="text-xs leading-tight text-muted-foreground">{subtitle}</span>
            </div>

            {otherParticipant && (
              <>
                <div className="h-px bg-border" />
                <button
                  disabled={!canCall}
                  onClick={() =>
                    startCall(
                      {
                        _id: otherParticipant._id,
                        displayName: otherParticipant.displayName,
                        avatarUrl: otherParticipant.avatarUrl,
                      },
                      info.callType
                    )
                  }
                  className="w-full text-center text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Gọi lại
                </button>
              </>
            )}
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {/* time */}
      {isShowTime && (
        <span className="flex justify-center text-xs text-muted-foreground px-1">
          {formatMessageTime(new Date(message.createdAt))}
        </span>
      )}

      <div
        className={cn(
          "group flex gap-2 message-bounce mt-1 items-center",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
        {/* avatar */}
        {!message.isOwn && (
          <div className="w-8 self-end">
            {isGroupBreak && (
              <UserAvatar
                type="chat"
                name={participant?.displayName ?? "Moji"}
                avatarUrl={participant?.avatarUrl ?? undefined}
              />
            )}
          </div>
        )}

        {/* nút trả lời - chỉ hiện khi hover, nằm bên trái bubble nếu là tin của mình */}
        {message.isOwn && (
          <button
            type="button"
            onClick={handleReplyClick}
            className="opacity-0 group-hover:opacity-100 transition-smooth rounded-full p-1.5 hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Trả lời"
          >
            <Reply className="size-3.5" />
          </button>
        )}

        {/* tin nhắn */}
        <div
          className={cn(
            "relative max-w-xs lg:max-w-md space-y-1 flex flex-col",
            message.isOwn ? "items-end" : "items-start"
          )}
        >
          {/* 👇 MỚI THÊM: thanh chọn emoji, hiện khi hover vào cả dòng tin nhắn */}
          <ReactionPicker
            isOwn={!!message.isOwn}
            myReaction={myReaction}
            onSelect={handleSelectReaction}
          />

          {message.replyTo && (
            <div
              className={cn(
                "max-w-full rounded-lg border-l-2 border-primary/60 bg-muted/50 px-2 py-1",
                message.isOwn ? "self-end" : "self-start"
              )}
            >
              <p className="text-xs font-medium text-primary truncate">
                {message.replyTo.senderName ?? "Tin nhắn"}
              </p>
              <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                {message.replyTo.imgUrl && !message.replyTo.content
                  ? "Đã gửi một ảnh"
                  : message.replyTo.content}
              </p>
            </div>
          )}

          {message.imgUrl ? (
            <Card
              className={cn(
                "p-1 overflow-hidden",
                message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received"
              )}
            >
              <img
                src={message.imgUrl}
                alt="Ảnh đã gửi"
                className="rounded-md max-w-full max-h-80 object-cover cursor-pointer"
                onClick={() => window.open(message.imgUrl ?? undefined, "_blank")}
              />
              {message.content && (
                <p className="text-sm leading-relaxed break-words px-2 pt-2 pb-1">
                  {message.content}
                </p>
              )}
            </Card>
          ) : (
            <Card
              className={cn(
                "p-3",
                message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received"
              )}
            >
              <p className="text-sm leading-relaxed break-words">{message.content}</p>
            </Card>
          )}

          {/* 👇 MỚI THÊM: badge tổng hợp reaction, đè lên góc dưới bubble giống Facebook */}
          {totalReactions > 0 && (
            <div
              className={cn(
                "-mt-2.5 flex items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm z-[1]",
                message.isOwn ? "self-end mr-2" : "self-start ml-2"
              )}
            >
              {reactionSummary.slice(0, 3).map(([emoji]) => (
                <span key={emoji} className="leading-none">
                  {emoji}
                </span>
              ))}
              {totalReactions > 1 && (
                <span className="text-muted-foreground leading-none ml-0.5">
                  {totalReactions}
                </span>
              )}
            </div>
          )}

          {/* seen/ delivered */}
          {message.isOwn && message._id === selectedConvo.lastMessage?._id && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-1.5 py-0.5 h-4 border-0",
                lastMessageStatus === "seen"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {lastMessageStatus}
            </Badge>
          )}
        </div>

        {/* nút trả lời - bên phải bubble nếu là tin của đối phương */}
        {!message.isOwn && (
          <button
            type="button"
            onClick={handleReplyClick}
            className="opacity-0 group-hover:opacity-100 transition-smooth rounded-full p-1.5 hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Trả lời"
          >
            <Reply className="size-3.5" />
          </button>
        )}
      </div>
    </>
  );
};

export default MessageItem;