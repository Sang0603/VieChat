import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send, X, Loader2, Reply, ShieldBan, Image, Video } from "lucide-react";
import { Input } from "../ui/input";
import EmojiPicker from "./EmojiPicker";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { chatService } from "@/services/chatService";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB, khớp với giới hạn backend
const MAX_VIDEO_SIZE = 300 * 1024 * 1024; // 300MB, khớp với giới hạn backend
const TYPING_STOP_DELAY = 2000; // ms - sau 2s ngừng gõ thì coi như đã ngừng "đang nhập"

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const { sendDirectMessage, sendGroupMessage, replyingTo, clearReplyingTo } =
    useChatStore();
  const { startTyping, stopTyping } = useSocketStore();
  const blockedFriendIds = useFriendStore((s) => s.blockedFriendIds);
  const blockedMeIds = useFriendStore((s) => s.blockedMeIds);
  const checkBlockStatus = useFriendStore((s) => s.checkBlockStatus);
  const [value, setValue] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // 👇 MỚI THÊM: 2 input riêng biệt (ẩn), mỗi cái accept đúng 1 loại,
  // để hệ điều hành hiện picker rõ ràng đúng loại - không gộp mập mờ nữa
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const otherUser =
    selectedConvo.type === "direct"
      ? selectedConvo.participants.find((p) => p._id !== user?._id)
      : undefined;

  useEffect(() => {
    if (otherUser) {
      checkBlockStatus(otherUser._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUser?._id]);

  if (!user) return;

  const isBlockedByMe = Boolean(otherUser && blockedFriendIds.includes(otherUser._id));
  const isBlockedByOther = Boolean(otherUser && blockedMeIds.includes(otherUser._id));
  const isBlocked = isBlockedByMe || isBlockedByOther;

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

  const stopTypingImmediately = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping(selectedConvo._id);
    }
  };

  // 👇 MỚI THÊM: mở đúng input tương ứng theo lựa chọn trong dropdown
  const handlePickImage = () => {
    imageInputRef.current?.click();
  };

  const handlePickVideo = () => {
    videoInputRef.current?.click();
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    clearVideo(); // chỉ cho gửi 1 loại đính kèm mỗi lần
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // 👇 MỚI THÊM: xử lý riêng cho video
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Chỉ có thể gửi file video");
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      toast.error("Video không được vượt quá 300MB");
      return;
    }

    clearImage(); // chỉ cho gửi 1 loại đính kèm mỗi lần
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const clearVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
  };

  const sendMessage = async () => {
    if (isBlocked) return;

    const trimmed = value.trim();
    if (!trimmed && !imageFile && !videoFile) return;
    if (sending) return;

    const currValue = trimmed;
    const currFile = imageFile;
    const currPreview = imagePreview;
    const currVideoFile = videoFile;
    const currVideoPreview = videoPreview;
    const currReplyTo = replyingTo;

    setValue("");
    clearImage();
    clearVideo();
    clearReplyingTo();
    stopTypingImmediately();
    setSending(true);

    try {
      let imgUrl: string | undefined;
      let videoInfo:
        | { videoUrl: string; thumbnailUrl?: string | null; duration?: number | null }
        | undefined;

      if (currFile) {
        imgUrl = await chatService.uploadMessageImage(currFile);
      }

      if (currVideoFile) {
        setUploadProgress(0);
        videoInfo = await chatService.uploadMessageVideo(currVideoFile, (pct) =>
          setUploadProgress(pct)
        );
        setUploadProgress(null);
      }

      if (selectedConvo.type === "direct") {
        const participants = selectedConvo.participants;
        const other = participants.filter((p) => p._id !== user._id)[0];
        await sendDirectMessage(
          other._id,
          currValue,
          imgUrl,
          currReplyTo?._id,
          videoInfo
        );
      } else {
        await sendGroupMessage(
          selectedConvo._id,
          currValue,
          imgUrl,
          currReplyTo?._id,
          videoInfo
        );
      }
    } catch (error: any) {
      console.error(error);
      setUploadProgress(null);

      if (error?.response?.status === 403 && error?.response?.data?.blocked) {
        if (otherUser) checkBlockStatus(otherUser._id);
        toast.error(
          error.response.data.message ?? "Không thể gửi tin nhắn cho người này"
        );
        return;
      }

      if (error?.response?.status === 403 && error?.response?.data?.strangerBlocked) {
        toast.error(
          error.response.data.message ?? "Người này không nhận tin nhắn từ người lạ"
        );
        return;
      }

      toast.error("Lỗi xảy ra khi gửi tin nhắn. Bạn hãy thử lại!");
      setValue(currValue);
      if (currFile) {
        setImageFile(currFile);
        setImagePreview(currPreview);
      }
      if (currVideoFile) {
        setVideoFile(currVideoFile);
        setVideoPreview(currVideoPreview);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    handleTypingSignal();
  };

  if (isBlockedByMe) {
    return (
      <div className="flex items-center justify-center gap-2 p-3 min-h-[56px] bg-muted/40 border-t border-border/50 text-sm text-muted-foreground">
        <ShieldBan className="size-4" />
        Bạn đã chặn người này. Bỏ chặn trong phần Cài đặt để nhắn tin trở lại.
      </div>
    );
  }

  if (isBlockedByOther) {
    return (
      <div className="flex items-center justify-center gap-2 p-3 min-h-[56px] bg-muted/40 border-t border-border/50 text-sm text-muted-foreground">
        <ShieldBan className="size-4" />
        Bạn đã bị người này chặn. Không thể gửi tin nhắn.
      </div>
    );
  }

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
              {replyingTo.videoUrl && !replyingTo.content
                ? "Đã gửi một video"
                : replyingTo.imgUrl && !replyingTo.content
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

      {videoPreview && (
        <div className="relative w-fit">
          <video
            src={videoPreview}
            className="h-20 w-32 object-cover rounded-lg border border-border/50"
            muted
          />
          <button
            type="button"
            onClick={clearVideo}
            disabled={uploadProgress !== null}
            className="absolute -top-2 -right-2 bg-background border border-border/50 rounded-full p-0.5 hover:bg-destructive/10 transition-smooth disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
          {uploadProgress !== null && (
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30 rounded-b-lg overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* 👇 MỚI THÊM: 2 input ẩn riêng biệt, mỗi cái accept đúng 1 loại */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFileChange}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoFileChange}
        />

        {/* 👇 MỚI THÊM: 1 nút duy nhất, bấm vào hiện dropdown "Ảnh" / "Video" */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={sending}
              className="hover:bg-primary/10 transition-smooth"
            >
              <ImagePlus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onClick={handlePickImage} className="gap-2">
              <Image className="size-4" />
              Ảnh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePickVideo} className="gap-2">
              <Video className="size-4" />
              Video
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 relative">
          <Input
            onKeyPress={handleKeyPress}
            value={value}
            onChange={handleChange}
            placeholder={
              uploadProgress !== null
                ? `Đang tải video lên... ${uploadProgress}%`
                : "Soạn tin nhắn..."
            }
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
          disabled={(!value.trim() && !imageFile && !videoFile) || sending}
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