import { useEffect, useState } from "react";
import {
  Bed,
  Car,
  Download,
  Plus,
  Receipt,
  ShoppingBag,
  Ticket,
  Trash2,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/useAuthStore";
import { EMPTY_EXPENSES, useExpenseStore } from "@/stores/useExpenseStore";
import { formatVnd } from "@/lib/money";
import { exportExpensesToExcel } from "@/lib/exportExpenses"; // 🆕 MỚI THÊM
import type { Conversation } from "@/types/chat";
import { getCategoryLabel, getExpensePayments, getPaymentPurpose } from "@/types/expense";
import type { ExpenseCategory, Settlement, Transfer } from "@/types/expense";
import AddExpenseDialog from "./AddExpenseDialog";
import ExpenseDetailDialog from "./ExpenseDetailDialog";
import TransferDialog from "./TransferDialog";

interface Props {
  chat: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// biểu tượng cho từng loại chi tiêu
const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  food: Utensils,
  transport: Car,
  lodging: Bed,
  shopping: ShoppingBag,
  fun: Ticket,
  other: Receipt,
};

const LoadingRows = () => (
  <div className="space-y-3">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-12 w-full" />
    ))}
  </div>
);

const ExpenseSheet = ({ chat, open, onOpenChange }: Props) => {
  const me = useAuthStore((s) => s.user);
  const data = useExpenseStore((s) => s.byConversation[chat._id]) ?? EMPTY_EXPENSES;
  const fetchAll = useExpenseStore((s) => s.fetchAll);
  const removeExpense = useExpenseStore((s) => s.removeExpense);
  const confirmSettlement = useExpenseStore((s) => s.confirmSettlement);
  const rejectSettlement = useExpenseStore((s) => s.rejectSettlement);
  // yêu cầu mở từ thẻ khoản chi trong khung chat
  const pendingOpen = useExpenseStore((s) => s.pendingOpen);
  const clearPendingOpen = useExpenseStore((s) => s.clearPendingOpen);

  const [addOpen, setAddOpen] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  // khoản chi đang xem chi tiết (lưu id để dữ liệu luôn mới khi danh sách được tải lại)
  const [detailId, setDetailId] = useState<string | null>(null);
  // 🆕 MỚI THÊM: đang xuất file Excel
  const [exporting, setExporting] = useState(false);

  // mở bảng Chi tiêu thì tải dữ liệu mới nhất
  useEffect(() => {
    if (open) void fetchAll(chat._id);
  }, [open, chat._id, fetchAll]);

  // bấm thẻ khoản chi trong khung chat -> mở bảng Chi tiêu
  // và mở luôn chi tiết đúng khoản chi đó
  useEffect(() => {
    if (!pendingOpen || pendingOpen.conversationId !== chat._id) return;
    setDetailId(pendingOpen.expenseId);
    onOpenChange(true);
    clearPendingOpen();
  }, [pendingOpen, chat._id, onOpenChange, clearPendingOpen]);

  const myId = me?._id;

  const nameOf = (id: string) =>
    id === myId
      ? "Bạn"
      : (chat.participants.find((p) => p._id === id)?.displayName ?? "Thành viên cũ");

  const sum = (list: Transfer[]) => list.reduce((total, t) => total + t.amount, 0);
  const owe = sum(data.transfers.filter((t) => t.from === myId));
  const receive = sum(data.transfers.filter((t) => t.to === myId));
  const totalSpent = data.expenses.reduce((total, e) => total + e.amount, 0);

  const detailExpense = data.expenses.find((e) => e._id === detailId) ?? null;

  // nợ chia theo từng khoản chi: mỗi khoản có danh sách "ai chuyển cho ai" riêng
  const debtsByExpense = data.expenses.map((e) => ({
    expense: e,
    transfers: data.transfers.filter((t) => t.expenseId === e._id),
  }));
  const indebted = debtsByExpense.filter((g) => g.transfers.length > 0);
  const settled = debtsByExpense.filter((g) => g.transfers.length === 0);

  // chỉ hiện "đã báo chuyển" khi khớp đúng khoản chi + đúng cặp người;
  // nếu nợ đã đổi (vd xóa khoản chi) thì bản ghi chờ xác nhận không hiện ra.
  const pendingFor = (t: Transfer): Settlement | undefined =>
    data.pendingSettlements.find(
      (s) => s.from === t.from && s.to === t.to && s.expenseId === t.expenseId
    );

  const handleDelete = (expenseId: string, title: string) => {
    if (!window.confirm(`Xóa khoản chi "${title}"?`)) return;
    void removeExpense(chat._id, expenseId);
  };

  // 🆕 MỚI THÊM: xuất toàn bộ chi tiêu của nhóm ra file Excel
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportExpensesToExcel({
        chat,
        expenses: data.expenses,
        transfers: data.transfers,
      });
      toast.success("Đã xuất file Excel");
    } catch (error) {
      console.error("Lỗi xảy ra khi xuất Excel", error);
      toast.error("Không xuất được file Excel. Hãy thử lại!");
    } finally {
      setExporting(false);
    }
  };

  const renderAction = (t: Transfer) => {
    const pending = pendingFor(t);

    if (t.from === myId) {
      return pending ? (
        <span className="text-xs text-muted-foreground">
          Chờ {nameOf(t.to)} xác nhận
        </span>
      ) : (
        <Button size="sm" onClick={() => setTransfer(t)}>
          Chuyển khoản
        </Button>
      );
    }

    if (t.to === myId) {
      return pending ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void confirmSettlement(chat._id, pending._id)}>
            Đã nhận
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void rejectSettlement(chat._id, pending._id)}
          >
            Chưa nhận được
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Chờ {nameOf(t.from)} chuyển</span>
      );
    }

    return (
      <span className="text-xs text-muted-foreground">
        {pending ? "Chờ xác nhận" : "Chưa chuyển"}
      </span>
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Chi tiêu · {chat.group?.name ?? "Nhóm"}</SheetTitle>
            <SheetDescription>
              Ghi khoản chi chung, VieChat tự chia và tính ai nợ ai.
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="expenses" className="px-4 pb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expenses">Khoản chi</TabsTrigger>
              <TabsTrigger value="balances">Ai nợ ai</TabsTrigger>
            </TabsList>

            <TabsContent value="expenses" className="mt-4 space-y-4">
              {!data.loaded ? (
                <LoadingRows />
              ) : data.expenses.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Chưa có khoản chi nào. Thêm khoản đầu tiên để chia tiền cho cả nhóm.
                </p>
              ) : (
                <div>
                  {data.expenses.map((e) => {
                    const payments = getExpensePayments(e);

                    // các nội dung chi khác nhau trong khoản này (mỗi người có thể chi cho việc khác nhau)
                    const purposes = [...new Set(payments.map(getPaymentPurpose))];
                    const purposeText =
                      purposes.length > 0 ? purposes.join(", ") : getCategoryLabel(e.category);

                    // 1 loại thì dùng biểu tượng loại đó, nhiều loại thì dùng biểu tượng chung
                    const categories = [
                      ...new Set(payments.map((p) => p.category ?? "other")),
                    ] as ExpenseCategory[];
                    const Icon =
                      CATEGORY_ICONS[categories.length === 1 ? categories[0] : "other"];

                    const paidLabel =
                      payments.length > 1
                        ? `${payments.length} người cùng chi`
                        : `${nameOf(payments[0]?.userId ?? "")} trả`;

                    return (
                      <div
                        key={e._id}
                        className="flex items-center gap-2 border-t border-border/50 py-3 first:border-t-0"
                      >
                        {/* bấm vào để xem chi tiết: ai chi bao nhiêu, chi cho việc gì */}
                        <button
                          type="button"
                          aria-label={`Xem chi tiết khoản chi ${e.title}`}
                          onClick={() => setDetailId(e._id)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{e.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {purposeText} · {paidLabel} · chia {e.participants.length} người
                            </p>
                            {payments.length > 1 && (
                              <p className="truncate text-xs text-muted-foreground">
                                {payments
                                  .map(
                                    (p) =>
                                      `${nameOf(p.userId)} ${formatVnd(p.amount)} (${getPaymentPurpose(p)})`
                                  )
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-sm font-medium">
                            {formatVnd(e.amount)}
                          </span>
                        </button>
                        {e.createdBy === myId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Xóa khoản chi"
                            onClick={() => handleDelete(e._id, e.title)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  <p className="border-t border-border/50 pt-3 text-right text-xs text-muted-foreground">
                    Tổng: {formatVnd(totalSpent)}
                  </p>
                </div>
              )}

              {/* 🆕 MỚI THÊM: thêm nút Xuất Excel cạnh nút Thêm khoản chi */}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 size-4" />
                  Thêm khoản chi
                </Button>
                <Button
                  variant="outline"
                  disabled={!data.loaded || data.expenses.length === 0 || exporting}
                  onClick={() => void handleExport()}
                >
                  <Download className="mr-2 size-4" />
                  {exporting ? "Đang xuất..." : "Xuất Excel"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="balances" className="mt-4 space-y-4">
              {!data.loaded ? (
                <LoadingRows />
              ) : (
                <>
                  <div className="rounded-lg bg-muted/50 p-3">
                    {owe > 0 ? (
                      <>
                        <p className="text-xs text-muted-foreground">Bạn cần chuyển</p>
                        <p className="text-2xl font-semibold">{formatVnd(owe)}</p>
                      </>
                    ) : receive > 0 ? (
                      <>
                        <p className="text-xs text-muted-foreground">Bạn sẽ nhận lại</p>
                        <p className="text-2xl font-semibold">{formatVnd(receive)}</p>
                      </>
                    ) : (
                      <p className="text-sm">Bạn không nợ ai cả</p>
                    )}
                  </div>

                  {indebted.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Cả nhóm đã thanh toán xong.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* mỗi khoản chi một khung riêng: tiền Hạ Long riêng, tiền phòng riêng */}
                      {indebted.map(({ expense, transfers }) => (
                        <div
                          key={expense._id}
                          className="rounded-lg border border-border/50 px-3"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-border/50 py-2">
                            <p className="min-w-0 truncate text-sm font-semibold">
                              {expense.title}
                            </p>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              Tổng {formatVnd(expense.amount)}
                            </span>
                          </div>
                          {transfers.map((t) => (
                            <div
                              key={`${t.expenseId}-${t.from}-${t.to}`}
                              className="space-y-2 border-t border-border/50 py-3 first:border-t-0"
                            >
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate">
                                  {nameOf(t.from)} chuyển cho {nameOf(t.to)}
                                </span>
                                <span className="shrink-0 font-medium">
                                  {formatVnd(t.amount)}
                                </span>
                              </div>
                              <div className="flex justify-end">{renderAction(t)}</div>
                            </div>
                          ))}
                        </div>
                      ))}

                      {settled.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Đã thanh toán xong: {settled.map((g) => g.expense.title).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AddExpenseDialog chat={chat} open={addOpen} onOpenChange={setAddOpen} />
      <ExpenseDetailDialog
        chat={chat}
        expense={detailExpense}
        onClose={() => setDetailId(null)}
      />
      <TransferDialog chat={chat} transfer={transfer} onClose={() => setTransfer(null)} />
    </>
  );
};

export default ExpenseSheet;