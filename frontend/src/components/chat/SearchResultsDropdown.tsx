import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import UserAvatar from "./UserAvatar";
import GroupChatAvatar from "./GroupChatAvatar";
import type { Participant } from "@/types/chat";

interface SearchResultItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isGroup: boolean;
  participants: Participant[];
  lastMessage: string;
}

interface SearchResultsDropdownProps {
  search: string;
  onSelect: () => void;
}

const SearchResultsDropdown = ({ search, onSelect }: SearchResultsDropdownProps) => {
  const { user } = useAuthStore();
  const { conversations, setActiveConversation, messages, fetchMessages } =
    useChatStore();

  if (!search.trim() || !user || !conversations) return null;

  const query = search.trim().toLowerCase();

  const results: SearchResultItem[] = conversations
    .flatMap((convo) => {
      if (convo.type === "direct") {
        const otherUser = convo.participants.find((p) => p._id !== user._id);
        if (!otherUser) return [];

        return [{
          id: convo._id,
          name: otherUser.displayName ?? "",
          avatarUrl: otherUser.avatarUrl,
          isGroup: false,
          participants: convo.participants,
          lastMessage: convo.lastMessage?.content ?? "",
        }];
      }

      return [{
        id: convo._id,
        name: convo.group?.name ?? "",
        avatarUrl: undefined,
        isGroup: true,
        participants: convo.participants,
        lastMessage: convo.lastMessage?.content ?? "",
      }];
    })
    .filter((item) => item.name.toLowerCase().includes(query));

  const handleSelect = async (id: string) => {
    setActiveConversation(id);
    if (!messages[id]) {
      await fetchMessages();
    }
    onSelect();
  };

  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-soft">
      {results.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground text-center">
          Không tìm thấy kết quả nào
        </p>
      ) : (
        results.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item.id)}
            className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent transition-smooth"
          >
            {item.isGroup ? (
              <GroupChatAvatar
                participants={item.participants}
                type="chat"
              />
            ) : (
              <UserAvatar
                type="sidebar"
                name={item.name}
                avatarUrl={item.avatarUrl ?? undefined}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              {item.lastMessage && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.lastMessage}
                </p>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
};

export default SearchResultsDropdown;
