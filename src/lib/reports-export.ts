export type ReportFormat = "csv" | "excel" | "pdf" | "gsheets";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportRowsAsCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "");
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(",")
    ),
  ].join("\n");

  downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export async function exportRowsAsExcel(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}.xlsx`
  );
}

export async function exportRowsAsPDF(rows: Record<string, unknown>[], filename: string, title: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const body = rows.map((r) => headers.map((h) => String(r[h] ?? "")));

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Exported on ${new Date().toLocaleString("en-ZA")}`, 14, 20);

  autoTable(doc, {
    startY: 24,
    head: [headers],
    body,
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}

export async function exportRowsToGoogleSheets(rows: Record<string, unknown>[], filenameBase: string) {
  await exportRowsAsCSV(rows, `${filenameBase}-google-sheets`);
  window.open("https://sheets.google.com/create", "_blank", "noopener,noreferrer");
}
