import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "../ui/input";
import AddFriendModal from "./AddFriendModal";
import NewGroupChatModal from "./NewGroupChatModal";
import SearchResultsDropdown from "./SearchResultsDropdown";

interface SidebarSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

const SidebarSearchBar = ({ value, onChange }: SidebarSearchBarProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onChange("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onChange]);

  return (
    <div className="flex items-center gap-2">
      <div
        ref={wrapperRef}
        className="relative flex-1"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tìm kiếm"
          className="pl-9 h-9 rounded-full bg-muted border-none focus-visible:ring-1 focus-visible:ring-primary/50"
        />
        <SearchResultsDropdown
          search={value}
          onSelect={() => onChange("")}
        />
      </div>

      <AddFriendModal />
      <NewGroupChatModal />
    </div>
  );
};

export default SidebarSearchBar;
