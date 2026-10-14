import { useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/useAuthStore";
import { useExpenseStore } from "@/stores/useExpenseStore";
import { formatAmountInput, formatVnd, parseAmount, splitEqually } from "@/lib/money";
import { EXPENSE_CATEGORIES, getCategoryFromText } from "@/types/expense";
import type { Conversation } from "@/types/chat";
import type { ExpensePayment } from "@/types/expense";

const MAX_AMOUNT = 1_000_000_000; // cùng mức với backend
const MAX_PURPOSE_LENGTH = 50; // cùng mức với backend

interface MoneyInputProps {
  // chỉ chứa chữ số (có thể tạm lẫn ký tự lạ khi bộ gõ đang soạn chữ)
  value: string;
  onValueChange: (digits: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

const toDigits = (text: string) => text.replace(/\D/g, "").slice(0, 10);

// Ô nhập tiền hiện dấu chấm ngăn cách NGAY KHI GÕ.
//
// Vì sao làm kiểu này: khi bật bộ gõ tiếng Việt (Unikey, Telex của Windows...), chữ đang gõ nằm
// trong trạng thái "đang soạn" (có gạch chân). Nếu ghi đè nội dung ô lúc đó (vd thêm dấu chấm),
// bộ gõ dán lại chữ cũ và số bị nhân đôi (40000 -> 44.400.000).
// Nên ô nhập thật CHỈ chứa chữ số người dùng gõ và không bị sửa khi đang soạn; số có dấu chấm
// được vẽ đè lên bằng một lớp hiển thị riêng (chữ thật trong ô được làm trong suốt).
const MoneyInput = ({
  value,
  onValueChange,
  placeholder,
  className,
  ...props
}: MoneyInputProps) => {
  const composingRef = useRef(false);
  const display = formatAmountInput(value);

  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        {...props}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        className="h-full w-full text-right text-sm"
        // làm chữ trong suốt nhưng giữ nguyên con trỏ; chữ hiển thị là lớp bên dưới
        style={{ WebkitTextFillColor: "transparent" }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          onValueChange(toDigits(e.currentTarget.value));
        }}
        onBlur={() => {
          composingRef.current = false;
          const digits = toDigits(value);
          if (digits !== value) onValueChange(digits);
        }}
        onChange={(e) => {
          // Bộ gõ đang soạn: giữ nguyên chữ đang gõ, tuyệt đối không sửa nội dung ô
          if (composingRef.current || (e.nativeEvent as InputEvent).isComposing) {
            onValueChange(e.target.value);
            return;
          }
          onValueChange(toDigits(e.target.value));
        }}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm ${
          display ? "" : "text-muted-foreground"
        }`}
      >
        {display || placeholder}
      </span>
    </div>
  );
};

// Form nằm trong DialogContent nên được tạo mới mỗi lần mở hộp thoại,
// nhờ vậy dữ liệu cũ tự được xóa, không cần đặt lại thủ công.
//
// Cách làm: mỗi người nhập số tiền MÌNH đã chi và chi cho việc gì (gõ chữ tự do, không chi
// thì để trống), app cộng lại thành tổng, chia đều cho những người cùng chia, rồi phần
// "Ai nợ ai" mới tính ai chuyển cho ai.
const ExpenseForm = ({ chat, onDone }: { chat: Conversation; onDone: () => void }) => {
  const me = useAuthStore((s) => s.user);
  const addExpense = useExpenseStore((s) => s.addExpense);
  const members = chat.participants;

  const [title, setTitle] = useState("");
  const [paidText, setPaidText] = useState<Record<string, string>>({});
  // nội dung chi gõ tự do của từng người
  const [purposeText, setPurposeText] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((m) => [m._id, true]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paidOf = (id: string) => parseAmount(paidText[id] ?? "");
  const purposeFor = (id: string) => purposeText[id] ?? "";

  // ai đã chi bao nhiêu và chi cho việc gì (bỏ qua người để trống)
  const payments: ExpensePayment[] = members
    .map((m) => {
      const purpose = purposeFor(m._id).trim();
      return {
        userId: m._id,
        amount: paidOf(m._id),
        category: getCategoryFromText(purpose),
        purpose,
      };
    })
    .filter((p) => p.amount > 0);
  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  // ai cùng chia: chia đều tổng cho những người này
  const participantIds = members.filter((m) => selected[m._id]).map((m) => m._id);
  const shares =
    total >= 1 && participantIds.length > 0 ? splitEqually(total, participantIds) : [];
  const shareOf = (id: string) => shares.find((s) => s.userId === id)?.share ?? 0;

  const validate = (): string | null => {
    if (!title.trim()) return "Vui lòng nhập tên khoản chi";
    if (total < 1) return "Hãy nhập số tiền mỗi người đã chi";
    if (total > MAX_AMOUNT) return "Tổng số tiền tối đa 1.000.000.000đ";
    if (participantIds.length === 0) return "Chọn ít nhất một người cùng chia";
    if (shares.some((s) => s.share < 1)) return "Phần của mỗi người phải lớn hơn 0";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = validate();
    setError(message);
    if (message) return;

    setSaving(true);
    const ok = await addExpense(chat._id, {
      title: title.trim(),
      payments,
      splitType: "equal",
      participants: shares,
    });
    setSaving(false);

    if (ok) {
      toast.success("Đã thêm khoản chi");
      onDone();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="expenseTitle">Tên khoản chi</Label>
        <Input
          id="expenseTitle"
          maxLength={100}
          placeholder="Ví dụ: Chuyến Hạ Long"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Mỗi người đã chi bao nhiêu?</Label>
          <p className="text-xs text-muted-foreground">
            Ai không chi thì để trống. Nhập tiền xong, gõ khoản đó chi cho việc gì (hoặc bấm gợi
            ý). Tắt công tắc nếu người đó không cùng chia khoản này.
          </p>
        </div>

        {members.map((m) => {
          const paid = paidOf(m._id);
          const net = paid - shareOf(m._id);
          const showNet = total > 0 && participantIds.length > 0;
          const currentPurpose = purposeFor(m._id).trim().toLowerCase();

          return (
            <div key={m._id} className="space-y-2">
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarImage src={m.avatarUrl ?? undefined} alt={m.displayName} />
                  <AvatarFallback>{m.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {m._id === me?._id ? "Bạn" : m.displayName}
                  </p>
                  {showNet && (
                    <p className="truncate text-xs text-muted-foreground">
                      {net > 0
                        ? `Nhận lại ${formatVnd(net)}`
                        : net < 0
                          ? `Cần trả thêm ${formatVnd(-net)}`
                          : "Vừa đủ"}
                    </p>
                  )}
                </div>
                <MoneyInput
                  aria-label={`Số tiền ${m.displayName} đã chi`}
                  placeholder="0"
                  className="h-8 w-32"
                  value={paidText[m._id] ?? ""}
                  onValueChange={(digits) =>
                    setPaidText((prev) => ({ ...prev, [m._id]: digits }))
                  }
                />
                <Switch
                  aria-label={`${m.displayName} cùng chia`}
                  checked={Boolean(selected[m._id])}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => ({ ...prev, [m._id]: checked }))
                  }
                />
              </div>

              {/* nhập tiền xong thì hiện luôn phần chi cho việc gì của người này */}
              {paid > 0 && (
                <div className="space-y-1.5 pl-11">
                  <Input
                    aria-label={`${m.displayName} chi cho việc gì`}
                    className="h-8 text-sm"
                    maxLength={MAX_PURPOSE_LENGTH}
                    placeholder="Chi cho việc gì? (vd: Ăn tối nhà hàng A)"
                    value={purposeFor(m._id)}
                    onChange={(e) =>
                      setPurposeText((prev) => ({ ...prev, [m._id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Gợi ý:</span>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={currentPurpose === c.label.toLowerCase()}
                        onClick={() =>
                          setPurposeText((prev) => ({ ...prev, [m._id]: c.label }))
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          currentPurpose === c.label.toLowerCase()
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/30 hover:bg-muted"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {total > 0 && participantIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Tổng chi {formatVnd(total)} · mỗi người chịu khoảng{" "}
            {formatVnd(Math.round(total / participantIds.length))}
          </p>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Hủy
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu khoản chi"}
        </Button>
      </DialogFooter>
    </form>
  );
};

interface Props {
  chat: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddExpenseDialog = ({ chat, open, onOpenChange }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {/* aria-describedby={undefined}: hộp thoại không có dòng mô tả nên báo cho Radix biết */}
    <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>Thêm khoản chi</DialogTitle>
      </DialogHeader>
      <ExpenseForm chat={chat} onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

export default AddExpenseDialog;