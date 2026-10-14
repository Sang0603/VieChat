import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/useAuthStore";
import { useExpenseStore } from "@/stores/useExpenseStore";
import { bankService, type BankInfo } from "@/services/bankService";
import { expenseService } from "@/services/expenseService";
import { buildVietQrUrl, formatVnd } from "@/lib/money";
import type { Conversation } from "@/types/chat";
import type { Transfer } from "@/types/expense";

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Đã sao chép");
  } catch {
    toast.error("Không sao chép được");
  }
};

// Nội dung hộp thoại; chỉ được tạo khi mở nên mỗi lần mở sẽ tải thông tin mới.
const TransferBody = ({
  chat,
  transfer,
  onClose,
}: {
  chat: Conversation;
  transfer: Transfer;
  onClose: () => void;
}) => {
  const me = useAuthStore((s) => s.user);
  const reportPaid = useExpenseStore((s) => s.reportPaid);
  // tên khoản chi đang trả nợ (để người chuyển biết đang trả cho khoản nào)
  const expenseTitle = useExpenseStore(
    (s) => s.byConversation[chat._id]?.expenses.find((e) => e._id === transfer.expenseId)?.title
  );

  const toName =
    chat.participants.find((p) => p._id === transfer.to)?.displayName ?? "Thành viên cũ";

  const [info, setInfo] = useState<BankInfo | null>(null);
  const [bankName, setBankName] = useState("");
  const [loading, setLoading] = useState(true);
  const [qrFailed, setQrFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      expenseService.getPaymentInfo(chat._id, transfer.to),
      bankService.getBanks().catch(() => []),
    ])
      .then(([paymentInfo, banks]) => {
        if (cancelled) return;
        setInfo(paymentInfo);
        setBankName(banks.find((b) => b.bin === paymentInfo?.bankId)?.shortName ?? "");
      })
      .catch(() => {
        if (!cancelled) toast.error("Không tải được thông tin chuyển khoản");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chat._id, transfer.to]);

  const handlePaid = async () => {
    setSaving(true);
    const ok = await reportPaid(chat._id, transfer.to, transfer.amount, transfer.expenseId);
    setSaving(false);

    if (ok) {
      toast.success(`Đã báo cho ${toName}. Chờ ${toName} xác nhận.`);
      onClose();
    }
  };

  const qrUrl = info
    ? buildVietQrUrl({
        bankId: info.bankId,
        accountNo: info.accountNo,
        accountName: info.accountName,
        amount: transfer.amount,
        note: `VieChat ${me?.displayName ?? ""} tra ${toName}`,
      })
    : "";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Chuyển cho {toName}</DialogTitle>
        <DialogDescription>
          {expenseTitle ? `Trả nợ khoản chi "${expenseTitle}". ` : ""}
          Quét mã bằng app ngân hàng, số tiền và người nhận đã được điền sẵn.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-3">
        <p className="text-2xl font-semibold">{formatVnd(transfer.amount)}</p>

        {loading ? (
          <Skeleton className="size-56 rounded-lg" />
        ) : info ? (
          <>
            {qrFailed ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Không tải được mã QR. Bạn có thể chuyển khoản theo số tài khoản bên dưới.
              </p>
            ) : (
              <img
                src={qrUrl}
                alt="Mã QR chuyển khoản"
                className="size-56 rounded-lg bg-white"
                onError={() => setQrFailed(true)}
              />
            )}

            <div className="flex w-full items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {bankName || info.bankId} · {info.accountNo}
                </p>
                <p className="truncate text-xs text-muted-foreground">{info.accountName}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Sao chép số tài khoản"
                onClick={() => void copyText(info.accountNo)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <p className="w-full rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {toName} chưa thêm tài khoản nhận tiền. Bạn có thể chuyển bằng cách khác rồi bấm
            &quot;Tôi đã chuyển&quot;.
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground">
          VieChat không giữ tiền và không xử lý thanh toán. Hãy kiểm tra giao dịch trong app
          ngân hàng.
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Đóng
        </Button>
        <Button type="button" onClick={handlePaid} disabled={saving || loading}>
          {saving ? "Đang gửi..." : "Tôi đã chuyển"}
        </Button>
      </DialogFooter>
    </>
  );
};

interface Props {
  chat: Conversation;
  transfer: Transfer | null; // null = đóng hộp thoại
  onClose: () => void;
}

const TransferDialog = ({ chat, transfer, onClose }: Props) => (
  <Dialog
    open={transfer !== null}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <DialogContent className="sm:max-w-sm">
      {transfer && <TransferBody chat={chat} transfer={transfer} onClose={onClose} />}
    </DialogContent>
  </Dialog>
);

export default TransferDialog;