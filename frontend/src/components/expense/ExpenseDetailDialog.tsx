import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/useAuthStore";
import { formatVnd } from "@/lib/money";
import type { Conversation } from "@/types/chat";
import { getExpensePayments, getPaymentPurpose } from "@/types/expense";
import type { Expense } from "@/types/expense";

interface Props {
  chat: Conversation;
  expense: Expense | null; // null = đóng hộp thoại
  onClose: () => void;
}

// Một dòng: ảnh + tên người, nội dung phụ (nếu có) và số tiền bên phải
const PersonRow = ({
  chat,
  userId,
  note,
  amount,
}: {
  chat: Conversation;
  userId: string;
  note?: string;
  amount: number;
}) => {
  const me = useAuthStore((s) => s.user);
  const member = chat.participants.find((p) => p._id === userId);
  const name = userId === me?._id ? "Bạn" : (member?.displayName ?? "Thành viên cũ");

  return (
    <div className="flex items-start gap-3 py-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={member?.avatarUrl ?? undefined} alt={name} />
        <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {note && <p className="break-words text-sm text-muted-foreground">{note}</p>}
      </div>
      <span className="shrink-0 text-sm font-medium">{formatVnd(amount)}</span>
    </div>
  );
};

// Chi tiết 1 khoản chi: mọi thành viên trong nhóm đều xem được
const ExpenseDetailDialog = ({ chat, expense, onClose }: Props) => {
  const me = useAuthStore((s) => s.user);

  const nameOf = (id: string) =>
    id === me?._id
      ? "Bạn"
      : (chat.participants.find((p) => p._id === id)?.displayName ?? "Thành viên cũ");

  const payments = expense ? getExpensePayments(expense) : [];

  return (
    <Dialog
      open={expense !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {expense && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words">{expense.title}</DialogTitle>
              <DialogDescription>
                {nameOf(expense.createdBy)} thêm lúc{" "}
                {new Date(expense.createdAt).toLocaleString("vi-VN")}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Tổng số tiền</p>
              <p className="text-2xl font-semibold">{formatVnd(expense.amount)}</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold">Ai đã chi, chi cho việc gì</p>
              <div className="divide-y divide-border/50">
                {payments.map((p) => (
                  <PersonRow
                    key={p.userId}
                    chat={chat}
                    userId={p.userId}
                    note={getPaymentPurpose(p)}
                    amount={p.amount}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold">
                Chia cho {expense.participants.length} người
              </p>
              <div className="divide-y divide-border/50">
                {expense.participants.map((p) => (
                  <PersonRow key={p.userId} chat={chat} userId={p.userId} amount={p.share} />
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseDetailDialog;