import type { Row, Worksheet } from "exceljs";
import type { Conversation } from "@/types/chat";
import type { Expense, Transfer } from "@/types/expense";
import { getExpensePayments, getPaymentPurpose } from "@/types/expense";

const FONT_NAME = "Times New Roman";
const FONT_SIZE = 14;
const MONEY = '#,##0"đ";-#,##0"đ";-';

const NAVY = "FF1F4E78"; // nền tiêu đề bảng
const LIGHT_BLUE = "FFDDEBF7"; // nền dòng Tổng
const BORDER = "FFA6A6A6"; // viền thân bảng (một màu duy nhất)

interface ExportParams {
  chat: Conversation;
  expenses: Expense[];
  transfers: Transfer[];
}

// bỏ ký tự không hợp lệ trong tên file
const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "").trim() || "nhom";

// 19080000 -> "19.080.000đ" (dùng trong câu chữ)
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export async function exportExpensesToExcel({ chat, expenses, transfers }: ExportParams) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const nameOf = (id: string) =>
    chat.participants.find((p) => p._id === id)?.displayName ?? "Thành viên cũ";
  const titleOf = (expenseId: string) =>
    expenses.find((e) => e._id === expenseId)?.title ?? "";

  // ---------- Kiểu dáng dùng chung ----------
  // tiêu đề: nền navy, chữ trắng, có đường kẻ trắng ngăn giữa các cột
  const styleHeader = (row: Row) => {
    row.height = 42;
    const white = { style: "medium" as const, color: { argb: "FFFFFFFF" } };
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.border = { left: white, right: white };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
  };

  // thân bảng: nền trắng, viền một màu, chữ đen, căn giữa theo chiều dọc
  const styleBody = (ws: Worksheet, fromRow: number) => {
    const line = { style: "thin" as const, color: { argb: BORDER } };
    for (let r = fromRow; r <= ws.rowCount; r++) {
      ws.getRow(r).eachCell((cell) => {
        cell.border = { top: line, bottom: line, left: line, right: line };
        cell.alignment = { ...cell.alignment, vertical: "middle" };
      });
    }
  };

  const styleTotal = (row: Row) => {
    row.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
    });
  };

  // ---------- Dữ liệu tính sẵn ----------
  const payments = expenses.flatMap((e) =>
    getExpensePayments(e).map((p) => ({ expense: e, payment: p }))
  );

  const memberIds = [
    ...new Set([
      ...expenses.flatMap((e) => e.participants.map((p) => p.userId)),
      ...payments.map((x) => x.payment.userId),
    ]),
  ];

  const paidBy = (id: string) =>
    payments.filter((x) => x.payment.userId === id).reduce((s, x) => s + x.payment.amount, 0);
  const shareOf = (id: string) =>
    expenses.reduce(
      (s, e) => s + (e.participants.find((p) => p.userId === id)?.share ?? 0),
      0
    );
  const purposesOf = (id: string) =>
    [
      ...new Set(
        payments.filter((x) => x.payment.userId === id).map((x) => getPaymentPurpose(x.payment))
      ),
    ].join(", ");

  // gộp các khoản nợ theo từng cặp người (cộng dồn qua nhiều khoản chi)
  const sumByPerson = (list: Transfer[], key: "from" | "to") => {
    const map = new Map<string, number>();
    list.forEach((t) => map.set(t[key], (map.get(t[key]) ?? 0) + t.amount));
    return [...map.entries()];
  };

  // "Cần chuyển ... cho ai" / "Được nhận lại ... từ ai"
  const statusOf = (id: string, diff: number) => {
    if (diff === 0) return "Hòa";

    if (diff < 0) {
      const parts = sumByPerson(
        transfers.filter((t) => t.from === id),
        "to"
      ).map(([to, amount]) => `${vnd(amount)} cho ${nameOf(to)}`);
      const total = vnd(-diff);
      if (parts.length === 0) return `Cần chuyển ${total}`;
      return parts.length === 1
        ? `Cần chuyển ${parts[0]}`
        : `Cần chuyển ${total}: ${parts.join(" · ")}`;
    }

    const parts = sumByPerson(
      transfers.filter((t) => t.to === id),
      "from"
    ).map(([from, amount]) => `${vnd(amount)} từ ${nameOf(from)}`);
    const total = vnd(diff);
    if (parts.length === 0) return `Được nhận lại ${total}`;
    return parts.length === 1
      ? `Được nhận lại ${parts[0]}`
      : `Được nhận lại ${total}: ${parts.join(" · ")}`;
  };

  // ---------- Sheet 1: Tổng hợp ----------
  const sum = wb.addWorksheet("Tổng hợp");
  [30, 20, 22, 20, 62, 32].forEach((w, i) => (sum.getColumn(i + 1).width = w));

  const title = sum.addRow([`Chi tiêu · ${chat.group?.name ?? "Nhóm"}`]);
  title.font = { bold: true };
  const note = sum.addRow([`Xuất lúc ${new Date().toLocaleString("vi-VN")}`]);
  note.font = { italic: true };
  sum.addRow([]);

  const header = sum.addRow([
    "Người",
    "Đã chi (đ)",
    "Phần phải chịu (đ)",
    "Chênh lệch (đ)",
    "Tình trạng",
    "Nội dung chi (tham khảo)",
  ]);
  styleHeader(header); // hàng 4

  const firstRow = header.number + 1; // hàng 5
  memberIds.forEach((id, i) => {
    const r = firstRow + i;
    const paid = paidBy(id);
    const share = shareOf(id);
    const diff = paid - share;

    const row = sum.addRow([
      nameOf(id),
      paid,
      share,
      { formula: `B${r}-C${r}`, result: diff },
      statusOf(id, diff),
      purposesOf(id),
    ]);
    row.height = 45; // mọi dòng dữ liệu cao bằng nhau (Tình trạng có thể xuống 2 dòng)
    row.getCell(5).alignment = { wrapText: true };
    row.getCell(6).alignment = { wrapText: true };
  });

  const lastMember = firstRow + memberIds.length - 1;
  const totalPaid = memberIds.reduce((s, id) => s + paidBy(id), 0);
  const totalShare = memberIds.reduce((s, id) => s + shareOf(id), 0);
  const totalRow = sum.addRow([
    "Tổng",
    { formula: `SUM(B${firstRow}:B${lastMember})`, result: totalPaid },
    { formula: `SUM(C${firstRow}:C${lastMember})`, result: totalShare },
    { formula: `SUM(D${firstRow}:D${lastMember})`, result: totalPaid - totalShare },
    "",
    "",
  ]);
  totalRow.height = 30;

  styleBody(sum, firstRow);
  styleTotal(totalRow);
  for (let r = firstRow; r <= totalRow.number; r++) {
    [2, 3, 4].forEach((c) => (sum.getCell(r, c).numFmt = MONEY));
  }

  // ---------- Sheet 2: Khoản chi ----------
  const list = wb.addWorksheet("Khoản chi");
  list.columns = [
    { header: "STT", width: 8 },
    { header: "Khoản chi", width: 34 },
    { header: "Ngày thêm", width: 26 },
    { header: "Người thêm", width: 28 },
    { header: "Tổng tiền (đ)", width: 22 },
    { header: "Số người chia", width: 18 },
  ];
  styleHeader(list.getRow(1));
  expenses.forEach((e, i) => {
    list.addRow([
      i + 1,
      e.title,
      new Date(e.createdAt).toLocaleString("vi-VN"),
      nameOf(e.createdBy),
      e.amount,
      e.participants.length,
    ]);
  });
  const listLast = expenses.length + 1;
  const listTotal = list.addRow([
    "",
    "Tổng",
    "",
    "",
    { formula: `SUM(E2:E${listLast})`, result: expenses.reduce((s, e) => s + e.amount, 0) },
    "",
  ]);
  styleBody(list, 2);
  styleTotal(listTotal);
  for (let r = 2; r <= listLast + 1; r++) list.getCell(r, 5).numFmt = MONEY;

  // ---------- Sheet 3: Chi tiết (ai chi, chi cho việc gì) ----------
  const detail = wb.addWorksheet("Chi tiết");
  detail.columns = [
    { header: "Khoản chi", width: 34 },
    { header: "Người chi", width: 28 },
    { header: "Chi cho việc gì", width: 34 },
    { header: "Số tiền (đ)", width: 22 },
  ];
  styleHeader(detail.getRow(1));
  payments.forEach(({ expense, payment }) => {
    detail.addRow([
      expense.title,
      nameOf(payment.userId),
      getPaymentPurpose(payment),
      payment.amount,
    ]);
  });
  const detailLast = payments.length + 1;
  const detailTotal = detail.addRow([
    "Tổng",
    "",
    "",
    {
      formula: `SUM(D2:D${detailLast})`,
      result: payments.reduce((s, x) => s + x.payment.amount, 0),
    },
  ]);
  styleBody(detail, 2);
  styleTotal(detailTotal);
  for (let r = 2; r <= detailLast + 1; r++) detail.getCell(r, 4).numFmt = MONEY;

  // ---------- Sheet 4: Chuyển khoản (ai nợ ai, theo từng khoản chi) ----------
  const tr = wb.addWorksheet("Chuyển khoản");
  tr.columns = [
    { header: "Khoản chi", width: 34 },
    { header: "Từ", width: 28 },
    { header: "Đến", width: 28 },
    { header: "Số tiền (đ)", width: 22 },
  ];
  styleHeader(tr.getRow(1));
  if (transfers.length === 0) {
    tr.addRow(["Cả nhóm đã thanh toán xong", "", "", 0]);
  } else {
    transfers.forEach((t) => {
      tr.addRow([titleOf(t.expenseId), nameOf(t.from), nameOf(t.to), t.amount]);
    });
  }
  const trLast = Math.max(tr.rowCount, 2);
  const trTotal = tr.addRow([
    "Tổng",
    "",
    "",
    {
      formula: `SUM(D2:D${trLast})`,
      result: transfers.reduce((s, t) => s + t.amount, 0),
    },
  ]);
  styleBody(tr, 2);
  styleTotal(trTotal);
  for (let r = 2; r <= trLast + 1; r++) tr.getCell(r, 4).numFmt = MONEY;

  // ---------- Áp Times New Roman cỡ 14 cho TOÀN BỘ ô (giữ lại đậm/nghiêng/màu đã đặt) ----------
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { ...cell.font, name: FONT_NAME, size: FONT_SIZE };
      });
    });
  });

  // ---------- Tải file về máy ----------
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chi-tieu-${safeFileName(chat.group?.name ?? "nhom")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}