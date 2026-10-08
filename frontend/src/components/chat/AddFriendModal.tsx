import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { UserPlus } from "lucide-react";
import type { User } from "@/types/user";
import { useFriendStore } from "@/stores/useFriendStore";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import SearchForm from "@/components/AddFriendModal/SearchForm";
import SendFriendRequestForm from "@/components/AddFriendModal/SendFriendRequestForm";

export interface IFormValues {
  username: string;
  message: string;
}

const AddFriendModal = () => {
  const [isFound, setIsFound] = useState<boolean | null>(null);
  const [searchUser, setSearchUser] = useState<User>();
  const [searchedUsername, setSearchedUsername] = useState("");
  // 👇 MỚI THÊM: danh sách kết quả khi có nhiều người trùng/khớp tên
  const [results, setResults] = useState<User[]>([]);
  const { loading, searchUsersByName, addFriend } = useFriendStore();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<IFormValues>({
    defaultValues: { username: "", message: "" },
  });

  const usernameValue = watch("username");

  const handleSearch = handleSubmit(async (data) => {
    const name = data.username.trim();
    if (!name) return;

    setIsFound(null);
    setResults([]);
    setSearchUser(undefined);
    setSearchedUsername(name);

    try {
      const users = await searchUsersByName(name);

      if (users.length === 0) {
        setIsFound(false);
      } else if (users.length === 1) {
        // chỉ có 1 người -> sang luôn bước gửi lời mời
        setSearchUser(users[0]);
        setIsFound(true);
      } else {
        // nhiều người -> hiện danh sách để chọn đúng người
        setResults(users);
      }
    } catch (error) {
      console.error(error);
      setIsFound(false);
    }
  });

  // 👇 MỚI THÊM: chọn 1 người trong danh sách kết quả
  const handleSelect = (user: User) => {
    setSearchUser(user);
    setIsFound(true);
  };

  const handleSend = handleSubmit(async (data) => {
    if (!searchUser) return;

    try {
      const message = await addFriend(searchUser._id, data.message.trim());
      toast.success(message);
      handleCancel();
    } catch (error: any) {
      // 🔧 FIX: trước đây addFriend không throw khi lỗi, nên luôn rơi vào
      // nhánh try -> luôn toast.success dù backend trả lỗi (vd "Hai người
      // đã là bạn bè"). Giờ addFriend throw khi lỗi -> bắt đúng ở đây.
      console.error("Lỗi xảy ra khi gửi request từ form", error);
      toast.error(error?.message ?? "Lỗi xảy ra khi gửi lời mời kết bạn");
    }
  });

  const handleCancel = () => {
    reset();
    setSearchedUsername("");
    setIsFound(null);
    setResults([]);
    setSearchUser(undefined);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex justify-center items-center size-9 shrink-0 rounded-full border border-border hover:bg-accent transition cursor-pointer">
          <UserPlus className="size-4" />
          <span className="sr-only">Kết bạn</span>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] border-none">
        <DialogHeader>
          <DialogTitle>Kết Bạn</DialogTitle>
        </DialogHeader>

        {!isFound && (
          <>
            <SearchForm
              register={register}
              errors={errors}
              usernameValue={usernameValue}
              loading={loading}
              isFound={isFound}
              searchedUsername={searchedUsername}
              results={results}
              onSelect={handleSelect}
              onSubmit={handleSearch}
              onCancel={handleCancel}
            />
          </>
        )}

        {isFound && (
          <>
            <SendFriendRequestForm
              register={register}
              loading={loading}
              // 🔧 SỬA: hiện đúng tên hiển thị thật của người tìm được
              searchedUsername={searchUser?.displayName ?? searchedUsername}
              onSubmit={handleSend}
              onBack={() => setIsFound(null)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendModal;