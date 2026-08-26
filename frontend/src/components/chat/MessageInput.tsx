import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send, X, Loader2, Reply } from "lucide-react";
import { Input } from "../ui/input";
import EmojiPicker from "./EmojiPicker";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { chatService } from "@/services/chatService";
import { toast } from "sonner";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB, khớp với giới hạn backend
const TYPING_STOP_DELAY = 2000; // ms - sau 2s ngừng gõ thì coi như đã ngừng "đang nhập"

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const { sendDirectMessage, sendGroupMessage, replyingTo, clearReplyingTo } =
    useChatStore();
  const { startTyping, stopTyping } = useSocketStore();
  const [value, setValue] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 👇 MỚI THÊM: theo dõi trạng thái "đang gõ" cục bộ ở client, tránh
  // spam emit typing:start liên tục mỗi lần gõ 1 ký tự
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 👇 MỚI THÊM: khi chuyển sang conversation khác hoặc component unmount,
  // đảm bảo báo "ngừng gõ" cho conversation cũ để không bị kẹt trạng thái
  // "Đang nhập..." bên phía người kia
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) {
        stopTyping(selectedConvo._id);
        isTypingRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvo._id]);

  if (!user) return;

  // 👇 MỚI THÊM: gọi mỗi khi nội dung input thay đổi
  const handleTypingSignal = () => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startTyping(selectedConvo._id);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      stopTyping(selectedConvo._id);
    }, TYPING_STOP_DELAY);
  };

  // 👇 MỚI THÊM: dừng ngay lập tức khi gửi tin (không cần đợi hết 2s)
  const stopTypingImmediately = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping(selectedConvo._id);
    }
  };

  const handlePickImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại cùng 1 file lần sau

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ có thể gửi file ảnh");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Ảnh không được vượt quá 5MB");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const sendMessage = async () => {
    const trimmed = value.trim();
    if (!trimmed && !imageFile) return;
    if (sending) return;

    const currValue = trimmed;
    const currFile = imageFile;
    const currPreview = imagePreview;
    const currReplyTo = replyingTo;

    setValue("");
    clearImage();
    clearReplyingTo();
    stopTypingImmediately(); // 👈 MỚI THÊM
    setSending(true);

    try {
      let imgUrl: string | undefined;

      if (currFile) {
        imgUrl = await chatService.uploadMessageImage(currFile);
      }

      if (selectedConvo.type === "direct") {
        const participants = selectedConvo.participants;
        const otherUser = participants.filter((p) => p._id !== user._id)[0];
        await sendDirectMessage(
          otherUser._id,
          currValue,
          imgUrl,
          currReplyTo?._id
        );
      } else {
        await sendGroupMessage(
          selectedConvo._id,
          currValue,
          imgUrl,
          currReplyTo?._id
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("Lỗi xảy ra khi gửi tin nhắn. Bạn hãy thử lại!");
      // khôi phục lại nội dung để người dùng không mất tin nhắn khi lỗi
      setValue(currValue);
      if (currFile) {
        setImageFile(currFile);
        setImagePreview(currPreview);
      }
      if (currReplyTo) {
        useChatStore.getState().setReplyingTo(currReplyTo);
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // 👇 MỚI THÊM: gộp việc setValue + báo hiệu đang gõ vào 1 chỗ
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    handleTypingSignal();
  };

  return (
    <div className="flex flex-col gap-2 p-3 min-h-[56px] bg-background">
      {replyingTo && (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-3 py-2">
          <Reply className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">
              Đang trả lời{" "}
              {replyingTo.senderId === user._id
                ? "chính mình"
                : selectedConvo.participants.find(
                    (p) => p._id === replyingTo.senderId
                  )?.displayName ?? replyingTo.senderName ?? "tin nhắn"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {replyingTo.imgUrl && !replyingTo.content
                ? "Đã gửi một ảnh"
                : replyingTo.content}
            </p>
          </div>
          <button
            type="button"
            onClick={clearReplyingTo}
            className="shrink-0 rounded-full p-1 hover:bg-destructive/10 transition-smooth"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {imagePreview && (
        <div className="relative w-fit">
          <img
            src={imagePreview}
            alt="Xem trước ảnh"
            className="h-20 w-20 object-cover rounded-lg border border-border/50"
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -top-2 -right-2 bg-background border border-border/50 rounded-full p-0.5 hover:bg-destructive/10 transition-smooth"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={handlePickImage}
          disabled={sending}
          className="hover:bg-primary/10 transition-smooth"
        >
          <ImagePlus className="size-4" />
        </Button>

        <div className="flex-1 relative">
          <Input
            onKeyPress={handleKeyPress}
            value={value}
            onChange={handleChange}
            placeholder="Soạn tin nhắn..."
            disabled={sending}
            className="pr-20 h-9 bg-white border-border/50 focus:border-primary/50 transition-smooth resize-none"
          ></Input>
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 hover:bg-primary/10 transition-smooth"
            >
              <div>
                <EmojiPicker
                  onChange={(emoji: string) => setValue(`${value}${emoji}`)}
                />
              </div>
            </Button>
          </div>
        </div>

        <Button
          onClick={sendMessage}
          className="bg-gradient-chat hover:shadow-glow transition-smooth hover:scale-105"
          disabled={(!value.trim() && !imageFile) || sending}
        >
          {sending ? (
            <Loader2 className="size-4 text-white animate-spin" />
          ) : (
            <Send className="size-4 text-white" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default MessageInput;