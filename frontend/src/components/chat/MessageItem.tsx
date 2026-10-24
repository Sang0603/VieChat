import { useRef, useState } from "react";
import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import {
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Receipt,
  Reply,
  ThumbsUp,
} from "lucide-react";
import { useStartCall } from "@/hooks/useStartCall";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useExpenseStore } from "@/stores/useExpenseStore"; // 🆕 MỚI THÊM

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

// 🆕 MỚI THÊM: định dạng tiền kiểu Việt Nam, ví dụ 19080000 -> "19.080.000đ"
const formatVnd = (amount: number) => `${amount.toLocaleString("vi-VN")}đ`;

// 🆕 MỚI THÊM: giờ gửi dạng 06:33 (hiện dưới mỗi tin nhắn trong chat nhóm)
const formatClock = (date: string) =>
  new Date(date).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// 🆕 MỚI THÊM: escape ký tự đặc biệt trong tên để đưa vào RegExp an toàn
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  // 🆕 MỚI THÊM: bấm thẻ khoản chi -> mở bảng Chi tiêu + chi tiết khoản đó
  const requestOpenExpense = useExpenseStore((s) => s.requestOpen);

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

  // 🆕 MỚI THÊM: có phải chat nhóm không
  const isGroup = selectedConvo.type === "group";

  // 🔧 FIX: optional chaining trên p._id và message.senderId — nếu user tương ứng
  // đã bị xóa khỏi DB, backend có thể trả participant thiếu _id; trước đây gọi
  // .toString() trực tiếp gây "Cannot read properties of undefined (reading 'toString')"
  const participant = selectedConvo.participants.find(
    (p: Participant) => p._id?.toString() === message.senderId?.toString()
  );

  const isCallMessage = message.type === "call" && !!message.callInfo;
  // 🆕 MỚI THÊM
  const isExpenseMessage = message.type === "expense" && !!message.expenseInfo;

  const otherParticipant = selectedConvo.participants.find(
    (p: Participant) => p._id?.toString() !== message.senderId?.toString()
  );

  const { startCall, canCall } = useStartCall(selectedConvo._id);

  const handleReplyClick = () => {
    setReplyingTo({
      _id: message._id,
      content: message.content,
      imgUrl: message.imgUrl,
      videoUrl: message.videoUrl, // 👈 MỚI THÊM
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

  // 🆕 MỚI THÊM: tô xanh các đoạn "@Tên thành viên" trong nội dung (chỉ chat nhóm).
  // Tên có dấu cách nên so khớp theo danh sách tên thành viên, ưu tiên tên dài trước.
  const renderContent = (text: string | null | undefined) => {
    if (!text || !isGroup) return text;

    const names = selectedConvo.participants
      .map((p: Participant) => p.displayName)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (names.length === 0) return text;

    const regex = new RegExp(`(@(?:${names.map(escapeRegExp).join("|")}))`, "g");

    return text.split(regex).map((part, i) =>
      i % 2 === 1 ? (
        <span
          key={i}
          className={cn(
            "font-medium",
            message.isOwn ? "underline underline-offset-2" : "text-blue-500"
          )}
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // 🆕 MỚI THÊM: 3 khối hiển thị trong bubble ở chat nhóm (tên người gửi,
  // khối trích dẫn, giờ gửi). `edge` là padding ngang thêm cho bubble ảnh/video.
  // 🔧 SỬA: Card của shadcn mặc định có gap-6 nên các khối bị tách xa nhau ->
  // ở chat nhóm thêm gap-0 vào Card (xem biến groupCardClass bên dưới).
  const senderNameEl = (edge = "") =>
    isGroup && !message.isOwn ? (
      <p
        className={cn(
          "mb-1.5 truncate text-sm leading-none text-muted-foreground",
          edge
        )}
      >
        {participant?.displayName ?? "Thành viên"}
      </p>
    ) : null;

  const quoteEl = (edge = "") =>
    isGroup && message.replyTo ? (
      <div
        className={cn(
          "mb-2 rounded-md border-l-4 px-3 py-2",
          message.isOwn
            ? "border-white/70 bg-black/10"
            : "border-blue-500 bg-muted/60",
          edge
        )}
      >
        <p className="text-sm font-semibold leading-snug truncate">
          {message.replyTo.senderName ?? "Tin nhắn"}
        </p>
        <p className="mt-0.5 text-sm leading-snug opacity-70 truncate">
          {message.replyTo.videoUrl && !message.replyTo.content
            ? "Đã gửi một video"
            : message.replyTo.imgUrl && !message.replyTo.content
            ? "Đã gửi một ảnh"
            : message.replyTo.content}
        </p>
      </div>
    ) : null;

  const timeEl = (edge = "") =>
    isGroup ? (
      <p className={cn("mt-1.5 text-xs leading-none opacity-80", edge)}>
        {formatClock(message.createdAt)}
      </p>
    ) : null;

  // 🆕 MỚI THÊM: class riêng cho bubble ở chat nhóm (bỏ gap-6 mặc định của Card)
  const groupCardClass = isGroup ? "gap-0" : "";

  // 🆕 MỚI THÊM: thẻ thông báo khoản chi, nằm giữa khung chat như một thông báo hệ thống
  if (isExpenseMessage) {
    const info = message.expenseInfo!;
    const isOwn = !!message.isOwn || message.senderId === currentUser?._id;
    const who = isOwn ? "Bạn" : participant?.displayName ?? "Một thành viên";

    // 🆕 bấm vào thẻ -> mở bảng Chi tiêu và xem chi tiết đúng khoản chi này
    const handleOpenExpense = () => {
      requestOpenExpense(selectedConvo._id, info.expenseId);
    };

    return (
      <>
        {isShowTime && (
          <span className="flex justify-center text-xs text-muted-foreground px-1">
            {formatMessageTime(new Date(message.createdAt))}
          </span>
        )}

        <div className="flex justify-center message-bounce mt-1">
          <Card
            role="button"
            tabIndex={0}
            aria-label={`Xem chi tiết khoản chi ${info.title}`}
            onClick={handleOpenExpense}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpenExpense();
              }
            }}
            className="w-64 space-y-2 p-3 bg-background border cursor-pointer transition-all hover:bg-muted/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <Receipt className="size-4 text-emerald-500" />
              </div>
              <span className="text-xs leading-tight text-muted-foreground">
                <span className="font-medium text-foreground">{who}</span> đã thêm một khoản chi
              </span>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight break-words">{info.title}</p>
              <p className="text-base font-semibold text-emerald-600">
                {formatVnd(info.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                Chia cho {info.participantCount} người
              </p>
            </div>
          </Card>
        </div>
      </>
    );
  }

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
          "group flex gap-2 message-bounce items-center",
          // 🔧 SỬA: chat nhóm cách các tin nhắn xa hơn cho thoáng
          isGroup ? "mt-3" : "mt-1",
          message.isOwn ? "justify-end" : "justify-start"
        )}
        onMouseEnter={() => setIsMessageHovered(true)}
        onMouseLeave={() => {
          setIsMessageHovered(false);
          closePickerDelayed();
        }}
      >
        {!message.isOwn && (
          // 🔧 SỬA: chat nhóm dóng avatar lên ngang tên người gửi (self-start),
          // chat 1-1 vẫn dóng xuống đáy như cũ (self-end)
          <div className={cn("w-8", isGroup ? "self-start" : "self-end")}>
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

          {/* Chat 1-1: khối trích dẫn nằm ngoài bubble như cũ.
              Chat nhóm: khối trích dẫn nằm TRONG bubble (xem quoteEl). */}
          {!isGroup && message.replyTo && (
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
                {message.replyTo.videoUrl && !message.replyTo.content
                  ? "Đã gửi một video"
                  : message.replyTo.imgUrl && !message.replyTo.content
                  ? "Đã gửi một ảnh"
                  : message.replyTo.content}
              </p>
            </div>
          )}

          {message.imgUrl ? (
            <Card
              className={cn(
                "p-1 overflow-hidden",
                groupCardClass,
                message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received"
              )}
            >
              {senderNameEl("px-2 pt-1.5")}
              {quoteEl("mx-1")}
              <img
                src={message.imgUrl}
                alt="Ảnh đã gửi"
                className="rounded-md max-w-full max-h-80 object-cover cursor-pointer"
                onClick={() => window.open(message.imgUrl ?? undefined, "_blank")}
              />
              {message.content && (
                <p className="text-sm leading-relaxed break-words px-2 pt-2 pb-1">
                  {renderContent(message.content)}
                </p>
              )}
              {timeEl("px-2 pb-1")}
            </Card>
          ) : message.videoUrl ? (
            // 👇 MỚI THÊM: render tin nhắn video. preload="metadata" chỉ tải
            // thông tin thời lượng/kích thước, KHÔNG tải cả file ngay ->
            // Cloudinary hỗ trợ streaming qua HTTP range request sẵn nên
            // tua/phát mượt kể cả video dài.
            <Card
              className={cn(
                "p-1 overflow-hidden",
                groupCardClass,
                message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received"
              )}
            >
              {senderNameEl("px-2 pt-1.5")}
              {quoteEl("mx-1")}
              <video
                controls
                poster={message.thumbnailUrl ?? undefined}
                preload="metadata"
                className="rounded-md max-w-full max-h-80"
              >
                <source src={message.videoUrl} />
                Trình duyệt của bạn không hỗ trợ phát video.
              </video>
              {message.content && (
                <p className="text-sm leading-relaxed break-words px-2 pt-2 pb-1">
                  {renderContent(message.content)}
                </p>
              )}
              {timeEl("px-2 pb-1")}
            </Card>
          ) : (
            <Card
              className={cn(
                // 🔧 SỬA: chat nhóm dùng padding px-4 py-3 + gap-0 cho gọn như mẫu
                isGroup ? "gap-0 px-4 py-3" : "p-3",
                message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received"
              )}
            >
              {senderNameEl()}
              {quoteEl()}
              <p
                className={cn(
                  "leading-relaxed break-words",
                  isGroup ? "text-[15px]" : "text-sm"
                )}
              >
                {renderContent(message.content)}
              </p>
              {timeEl()}
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