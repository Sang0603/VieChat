import { useRef, useState } from "react";
import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Reply, ThumbsUp } from "lucide-react";
import { useStartCall } from "@/hooks/useStartCall";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";

interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
  lastMessageStatus: "delivered" | "seen";
}

const REACTION_EMOJIS = ["👍", "❤️", "😆", "😮", "😢", "😡"];
const DEFAULT_REACTION = "👍";

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

  return {
    title: isOwn ? "Cuộc gọi bị từ chối" : "Bạn đã từ chối",
    subtitle: callTypeLabel,
  };
}

// Nút like nhỏ luôn đứng cố định 1 vị trí (absolute), thanh emoji cũng absolute,
// chỉ đổi opacity/scale khi bung ra -> không đẩy nút like dịch chuyển.
// Hướng bung của thanh emoji đổi theo isOwn để không bị tràn/cắt icon ở mép khung.
const ReactionTrigger = ({
  isOwn,
  myReaction,
  visible,
  showPicker,
  onQuickReact,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  isOwn: boolean;
  myReaction?: string;
  visible: boolean; // nút like nhỏ hiện khi hover message
  showPicker: boolean; // thanh emoji hiện khi hover chính nút
  onQuickReact: () => void;
  onSelect: (emoji: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) => {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "absolute -bottom-3 z-20",
        // tin nhắn của mình neo theo cạnh phải bubble, tin nhắn người khác neo theo cạnh trái
        isOwn ? "right-1" : "left-1",
        "transition-opacity",
        visible || showPicker ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {/* nút like nhỏ - đứng cố định, không bị thanh emoji đẩy đi */}
      <button
        type="button"
        onClick={onQuickReact}
        className={cn(
          "flex items-center justify-center size-6 rounded-full border bg-background shadow-sm",
          "hover:scale-110 transition-transform"
        )}
        aria-label="Thả cảm xúc"
      >
        {myReaction ? (
          <span className="text-sm leading-none">{myReaction}</span>
        ) : (
          <ThumbsUp className="size-3.5 text-muted-foreground" />
        )}
      </button>

      {/* thanh emoji - luôn absolute, bung lên phía TRÊN nút.
          Tin nhắn của mình: bung sang trái (right-0).
          Tin nhắn người khác: bung sang phải (left-0) để tránh tràn/cắt mất icon. */}
      <div
        className={cn(
          "absolute bottom-full mb-2 flex items-center gap-0.5 rounded-full bg-background border shadow-md px-2 py-1",
          "transition-smooth",
          isOwn ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left",
          showPicker
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-90 pointer-events-none"
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
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const currentUser = useAuthStore((s) => s.user);

  const [isMessageHovered, setIsMessageHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const hidePickerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPicker = () => {
    if (hidePickerTimeout.current) clearTimeout(hidePickerTimeout.current);
    setShowPicker(true);
  };

  const closePickerDelayed = () => {
    hidePickerTimeout.current = setTimeout(() => {
      setShowPicker(false);
    }, 250);
  };

  const prev = index + 1 < messages.length ? messages[index + 1] : undefined;

  const isShowTime =
    index === 0 ||
    new Date(message.createdAt).getTime() -
      new Date(prev?.createdAt || 0).getTime() >
      300000;

  const isGroupBreak = isShowTime || message.senderId !== prev?.senderId;

  const participant = selectedConvo.participants.find(
    (p: Participant) => p._id.toString() === message.senderId.toString()
  );

  const isCallMessage = message.type === "call" && !!message.callInfo;

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
    setShowPicker(false);
  };

  const handleQuickReact = () => {
    toggleReaction(message._id, myReaction ?? DEFAULT_REACTION);
  };

  if (isCallMessage) {
    const info = message.callInfo!;
    const isOwn = !!message.isOwn;
    const { title, subtitle } = getCallLabel(message, isOwn);

    const isMissedOrCancelled = info.status === "missed" || info.status === "cancelled";
    const isRejected = info.status === "rejected";
    const isIncomingLine = !isOwn;

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
        onMouseEnter={() => setIsMessageHovered(true)}
        onMouseLeave={() => {
          setIsMessageHovered(false);
          closePickerDelayed();
        }}
      >
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

        {message.isOwn && (
          <button
            type="button"
            onClick={handleReplyClick}
            // Trên mobile không có hover -> luôn hiện sẵn (opacity-100).
            // Từ sm trở lên (có chuột) mới ẩn và chỉ hiện khi hover message.
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-smooth rounded-full p-1.5 hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Trả lời"
          >
            <Reply className="size-3.5" />
          </button>
        )}

        <div
          className={cn(
            "relative max-w-xs lg:max-w-md space-y-1 flex flex-col",
            message.isOwn ? "items-end" : "items-start"
          )}
        >
          <ReactionTrigger
            isOwn={!!message.isOwn}
            myReaction={myReaction}
            visible={isMessageHovered}
            showPicker={showPicker}
            onQuickReact={handleQuickReact}
            onSelect={handleSelectReaction}
            onMouseEnter={openPicker}
            onMouseLeave={closePickerDelayed}
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

          {message.blocked && message.isOwn && (
            <p className="text-xs text-muted-foreground italic self-end mr-1">
              {otherParticipant?.displayName ?? "Người này"} đã chặn tin nhắn.
            </p>
          )}

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

        {!message.isOwn && (
          <button
            type="button"
            onClick={handleReplyClick}
            // Trên mobile không có hover -> luôn hiện sẵn (opacity-100).
            // Từ sm trở lên (có chuột) mới ẩn và chỉ hiện khi hover message.
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-smooth rounded-full p-1.5 hover:bg-muted text-muted-foreground shrink-0"
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