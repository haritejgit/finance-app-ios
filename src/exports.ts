import { Platform } from "react-native";
import { Customer, Loan } from "./types";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadTextFile(filename: string, contents: string, mimeType = "application/json") {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

export function openPrintableDocument(title: string, bodyHtml: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const win = window.open("", "_blank", "width=960,height=720");
  if (!win) return false;
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; padding: 32px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; }
          .sheet { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 28px; box-shadow: 0 18px 50px rgba(15,23,42,.12); }
          h1 { margin: 0 0 6px; font-size: 28px; }
          h2 { margin: 24px 0 10px; font-size: 16px; color: #2563eb; }
          .muted { color: #64748b; font-size: 13px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0; }
          .metric { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #f8fafc; }
          .metric strong { display: block; font-size: 18px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; border-bottom: 1px solid #e2e8f0; padding: 10px 8px; font-size: 13px; }
          th { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
          @media print {
            body { background: #fff; padding: 0; }
            .sheet { border: 0; box-shadow: none; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">${bodyHtml}</main>
        <script>setTimeout(function(){ window.print(); }, 250);</script>
      </body>
    </html>
  `);
  win.document.close();
  return true;
}

export function openCustomerLedgerPrint(customer: Customer, loan: Loan | null, payments: any[]) {
  const rows = payments
    .map((payment) => `
      <tr>
        <td>${escapeHtml(new Date(payment.paymentDate).toLocaleDateString())}</td>
        <td>${escapeHtml(payment.paymentType)}</td>
        <td>${escapeHtml(payment.paymentMode)}</td>
        <td>Rs.${escapeHtml(Number(payment.amountPaid || 0).toLocaleString("en-IN"))}</td>
      </tr>
    `)
    .join("");

  return openPrintableDocument(
    `${customer.name} ledger`,
    `
      <h1>${escapeHtml(customer.name)}</h1>
      <p class="muted">Customer ledger generated on ${escapeHtml(new Date().toLocaleString())}</p>
      <div class="grid">
        <div class="metric"><span>Book No</span><strong>${escapeHtml(customer.numericalId)}</strong></div>
        <div class="metric"><span>Phone</span><strong>${escapeHtml(customer.phone)}</strong></div>
        <div class="metric"><span>Principal</span><strong>Rs.${escapeHtml(Number(loan?.principalAmount || 0).toLocaleString("en-IN"))}</strong></div>
        <div class="metric"><span>Outstanding</span><strong>Rs.${escapeHtml(Number(loan?.balanceAmount || 0).toLocaleString("en-IN"))}</strong></div>
      </div>
      <h2>Transaction History</h2>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Amount</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">No transactions found.</td></tr>`}</tbody>
      </table>
    `
  );
}
