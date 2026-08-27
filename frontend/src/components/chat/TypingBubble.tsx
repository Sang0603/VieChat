import { cn } from "@/lib/utils";
import UserAvatar from "./UserAvatar";

interface TypingBubbleProps {
  name?: string;
  avatarUrl?: string | null;
  showAvatar?: boolean;
}

const TypingBubble = ({ name, avatarUrl, showAvatar = true }: TypingBubbleProps) => {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      {showAvatar && (
        <div className="w-5 h-5 shrink-0">
          <UserAvatar type="chat" name={name ?? "VieChat"} avatarUrl={avatarUrl ?? undefined} />
        </div>
      )}
      <div
        className={cn(
          "chat-bubble-received flex items-center gap-1 rounded-full px-2.5 py-1.5"
        )}
      >
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
};

export default TypingBubble;