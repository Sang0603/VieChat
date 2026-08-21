import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { useStartCall } from "@/hooks/useStartCall";

interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
  lastMessageStatus: "delivered" | "seen";
}

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

const MessageItem = ({
  message,
  index,
  messages,
  selectedConvo,
  lastMessageStatus,
}: MessageItemProps) => {
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
          "flex gap-2 message-bounce mt-1",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
        {/* avatar */}
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

        {/* tin nhắn */}
        <div
          className={cn(
            "max-w-xs lg:max-w-md space-y-1 flex flex-col",
            message.isOwn ? "items-end" : "items-start"
          )}
        >
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
                onClick={() => window.open(message.imgUrl, "_blank")}
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
      </div>
    </>
  );
};

export default MessageItem;