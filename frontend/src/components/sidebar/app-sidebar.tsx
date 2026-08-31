import { useState } from "react";
import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import SidebarSearchBar from "../chat/SidebarSearchBar";
import GroupChatList from "../chat/GroupChatList";
import DirectMessageList from "../chat/DirectMessageList";
import { useAuthStore } from "@/stores/useAuthStore";
import ConversationSkeleton from "../skeleton/ConversationSkeleton";
import { useChatStore } from "@/stores/useChatStore";
import { ShieldCheck } from "lucide-react"; // 👈 mới thêm
import { Link } from "react-router"; // 👈 mới thêm

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuthStore();
  const { convoLoading } = useChatStore();
  const [search, setSearch] = useState("");

  return (
    <Sidebar
      variant="inset"
      {...props}
    >
      {/* Content */}
      <SidebarContent className="beautiful-scrollbar">
        {/* Tìm kiếm + Kết bạn + Tạo nhóm */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarSearchBar
              value={search}
              onChange={setSearch}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 👇 MỚI THÊM: chỉ hiện khi user.role === "admin" */}
        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/admin">
                      <ShieldCheck />
                      <span>Quản trị</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Group Chat */}
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel className="uppercase">nhóm chat</SidebarGroupLabel>
          </div>

          <SidebarGroupContent>
            {convoLoading ? <ConversationSkeleton /> : <GroupChatList />}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Dirrect Message */}
        <SidebarGroup>
          <SidebarGroupLabel className="uppercase">bạn bè</SidebarGroupLabel>

          <SidebarGroupContent>
            {convoLoading ? <ConversationSkeleton /> : <DirectMessageList />}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
