import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IFormValues } from "../chat/AddFriendModal";
import type { User } from "@/types/user";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { DialogFooter } from "../ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import { Search } from "lucide-react";

interface SearchFormProps {
  register: UseFormRegister<IFormValues>;
  errors: FieldErrors<IFormValues>;
  loading: boolean;
  usernameValue: string;
  isFound: boolean | null;
  searchedUsername: string;
  // 👇 MỚI THÊM: danh sách kết quả khi có nhiều người khớp + hàm chọn 1 người
  results: User[];
  onSelect: (user: User) => void;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

const SearchForm = ({
  register,
  errors,
  usernameValue,
  loading,
  isFound,
  searchedUsername,
  results,
  onSelect,
  onSubmit,
  onCancel,
}: SearchFormProps) => {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label
          htmlFor="username"
          className="text-sm font-semibold"
        >
          Tìm bằng tên hiển thị
        </Label>

        <Input
          id="username"
          placeholder="Gõ tên hiển thị vào đây..."
          className="glass border-border/50 focus:border-primary/50 transition-smooth"
          {...register("username", {
            required: "Tên hiển thị không được bỏ trống",
          })}
        ></Input>
        {errors.username && (
          <p className="error-message">{errors.username.message}</p>
        )}

        {isFound === false && (
          <span className="error-message">
            Không tìm thấy{" "}
            <span className="font-semibold">{searchedUsername}</span>
          </span>
        )}

        {/* 👇 MỚI THÊM: nhiều người khớp -> chọn đúng người muốn kết bạn */}
        {results.length > 1 && (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-1">
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              Chọn đúng người bạn muốn kết bạn:
            </p>
            {results.map((u) => (
              <button
                key={u._id}
                type="button"
                onClick={() => onSelect(u)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-smooth hover:bg-accent"
              >
                <Avatar className="size-9">
                  <AvatarImage
                    src={u.avatarUrl ?? undefined}
                    alt={u.displayName}
                  />
                  <AvatarFallback>
                    {u.displayName?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {u.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            className="flex-1 glass hover:text-destructive"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </DialogClose>

        <Button
          type="submit"
          disabled={loading || !usernameValue?.trim()}
          className="flex-1 bg-gradient-chat text-white hover:opacity-90 transition-smooth"
        >
          {loading ? (
            <span>Đang tìm ...</span>
          ) : (
            <>
              <Search className="size-4 mr-2" /> Tìm
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default SearchForm;