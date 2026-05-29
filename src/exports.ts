import { Platform } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
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
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Noto+Sans+Telugu:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 40px 20px;
            font-family: 'Plus Jakarta Sans', 'Noto Sans Telugu', system-ui, -apple-system, sans-serif;
            color: #1e293b;
            background: #f8fafc;
            display: flex;
            justify-content: center;
          }
          .sheet {
            width: 100%;
            max-width: 860px;
            background: #ffffff;
            border-top: 6px solid #0f172a;
            border-left: 1px solid #e2e8f0;
            border-right: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            box-sizing: border-box;
          }
          h1 {
            margin: 0 0 6px;
            font-size: 26px;
            font-weight: 700;
            color: #0f172a;
          }
          h2 {
            margin: 28px 0 12px;
            font-size: 16px;
            font-weight: 700;
            color: #0d9488;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .muted {
            color: #64748b;
            font-size: 13px;
            margin: 4px 0 0 0;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 24px 0;
          }
          .metric {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px 16px;
            background: #f8fafc;
          }
          .metric span {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .metric strong {
            display: block;
            font-size: 17px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 6px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            margin-bottom: 24px;
          }
          th, td {
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
            padding: 12px 16px;
            font-size: 13px;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 2px solid #e2e8f0;
          }
          td {
            color: #334155;
          }
          tr:nth-child(even) td {
            background: #fafafa;
          }
          @media print {
            body { background: #ffffff; padding: 0; }
            .sheet { border: 0; box-shadow: none; border-radius: 0; padding: 0; }
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

export type ExportTransaction = {
  date: number;
  type: "INVESTMENT" | "COLLECTION" | "LOAN" | "EXPENSE";
  desc: string;
  amount: number;
};

export type ExportTotals = {
  sumInvs: number;
  sumColls: number;
  sumLoans: number;
  sumExps: number;
  netTotal: number;
};

export async function openAccountStatementPrint(
  periodStartStr: string,
  periodEndStr: string,
  bf: number,
  transactions: ExportTransaction[],
  totals: ExportTotals,
  language: "en" | "te",
  villageName: string,
  format: "pdf" | "jpg",
  userEmail?: string
): Promise<{ success: boolean; platform: string; copied?: boolean }> {
  if (Platform.OS !== "web") {
    // Mobile fallback: copy to clipboard
    const plainText = generatePlainTextStatement(periodStartStr, periodEndStr, bf, transactions, totals, language, villageName);
    await Clipboard.setString(plainText);
    return { success: true, platform: "mobile", copied: true };
  }

  const isTe = language === "te";
  const title = isTe ? "కార్తికేయ ఫైనాన్స్" : "Karthikeya Finance";
  const subTitle = isTe ? "ఆర్థిక ఖాతా నివేదిక" : "Account Statement";
  
  const formatVal = (v: number) => Math.round(v).toLocaleString("en-IN");
  const isAllVillages = villageName === "All Villages" || villageName === "అన్ని గ్రామాలు";

  // Monospace formatter configuration
  const width = 45;
  const divider = "-".repeat(width);
  const doubleDivider = "=".repeat(width);

  const formatLine = (label: string, value: string, symbol: string = "="): string => {
    const valPart = `${symbol} ${value}`;
    const padLength = width - label.length - valPart.length;
    if (padLength > 0) {
      return `${label}${" ".repeat(padLength)}${valPart}`;
    }
    return `${label} ${valPart}`;
  };

  let ledgerText = "";

  if (isAllVillages) {
    const lblBf = isTe ? "BF (ప్రారంభ నిల్వ)" : "BF";
    const lblInvs = isTe ? "పెట్టుబడులు" : "Investments";
    const lblColls = isTe ? "వసూళ్లు" : "Collections";
    const lblLoans = isTe ? "చెల్లింపులు (రుణాలు)" : "Payments";
    const lblTotal = isTe ? "మొత్తం (Total)" : "Total";

    const lineBf = formatLine(lblBf, formatVal(bf));
    const lineInvs = formatLine(lblInvs, formatVal(totals.sumInvs));
    const firstSum = bf + totals.sumInvs;
    const lineFirstSum = formatLine("", formatVal(firstSum));

    const lineColls = formatLine(lblColls, formatVal(totals.sumColls));
    const lineLoans = formatLine(lblLoans, formatVal(totals.sumLoans));
    const secondSum = firstSum + totals.sumColls - totals.sumLoans;
    const lineSecondSum = formatLine("", formatVal(secondSum));

    ledgerText += `${lineBf}\n`;
    ledgerText += `${lineInvs}\n`;
    ledgerText += `${divider}\n`;
    ledgerText += `${lineFirstSum}\n`;
    ledgerText += `${lineColls}\n`;
    ledgerText += `${lineLoans}\n`;
    ledgerText += `${divider}\n`;
    ledgerText += `${lineSecondSum}\n`;

    const exps = transactions.filter((t) => t.type === "EXPENSE");
    if (exps.length > 0) {
      exps.forEach((exp) => {
        const lblExp = `${exp.desc} (${isTe ? "ఖర్చులు" : "Expenses"})`;
        ledgerText += `${formatLine(lblExp, formatVal(exp.amount))}\n`;
      });
      ledgerText += `${divider}\n`;
    }
    ledgerText += `${formatLine(lblTotal, formatVal(totals.netTotal))}\n`;
    ledgerText += `${doubleDivider}`;
  } else {
    const lblColls = isTe ? "గ్రామ వసూళ్లు" : "Village Collections";
    const lblLoans = isTe ? "గ్రామ రుణాలు" : "Village Loans";
    const lblNet = isTe ? "నికర నగదు ప్రవాహం" : "Net Cashflow";

    ledgerText += `${formatLine(lblColls, formatVal(totals.sumColls))}\n`;
    ledgerText += `${formatLine(lblLoans, formatVal(totals.sumLoans))}\n`;
    ledgerText += `${divider}\n`;
    ledgerText += `${formatLine(lblNet, formatVal(totals.sumColls - totals.sumLoans))}\n`;
    ledgerText += `${doubleDivider}`;
  }

  const win = window.open("", "_blank", "width=600,height=780");
  if (!win) return { success: false, platform: "web" };

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(subTitle)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 30px 15px;
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #statement-card {
            background: #ffffff;
            width: 100%;
            max-width: 480px;
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            padding: 35px 30px;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2);
            box-sizing: border-box;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px dashed #cbd5e1;
            padding-bottom: 15px;
          }
          .header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
          }
          .header h3 {
            margin: 5px 0 10px 0;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
          }
          .header p {
            margin: 3px 0;
            font-size: 12px;
            color: #64748b;
          }
          .ledger-content {
            font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
            font-size: 13.5px;
            line-height: 1.6;
            color: #1e293b;
            margin: 0 0 20px 0;
            white-space: pre-wrap;
            word-break: break-all;
          }
          .footer {
            margin-top: 25px;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #94a3b8;
          }
          .status-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.85);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            font-family: system-ui, sans-serif;
            text-align: center;
            padding: 20px;
          }
          .spinner {
            border: 4px solid rgba(255,255,255,0.1);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border-left-color: #06b6d4;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @media print {
            body {
              background: #ffffff !important;
              padding: 0;
            }
            #statement-card {
              border: 0;
              box-shadow: none;
              padding: 0;
              max-width: 100%;
            }
            .status-overlay {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        ${format === "jpg" ? `
          <div class="status-overlay" id="status-overlay">
            <div class="spinner" id="status-spinner"></div>
            <div id="status-msg">
              <strong>${isTe ? "చిత్ర నివేదికను రూపొందిస్తున్నాము..." : "Generating JPG Statement..."}</strong><br>
              <span style="font-size: 12px; color: #94a3b8; margin-top: 6px;">
                ${isTe ? "దయచేసి కొన్ని క్షణాలు వేచి ఉండండి." : "Rendering statement using high-resolution Canvas."}
              </span>
            </div>
          </div>
        ` : ""}

        <div id="statement-card">
          <div class="header">
            <h2>${escapeHtml(title)}</h2>
            <h3>${escapeHtml(subTitle)}</h3>
            <p>${isTe ? "సమయం" : "Period"}: ${escapeHtml(periodStartStr)} - ${escapeHtml(periodEndStr)}</p>
            <p>${isTe ? "గ్రామం" : "Village"}: ${escapeHtml(villageName)}</p>
            ${userEmail ? `<p>Email: ${escapeHtml(userEmail)}</p>` : ""}
          </div>

          <pre class="ledger-content">${escapeHtml(ledgerText)}</pre>

          <div class="footer">
            <span>${isTe ? "ఫైనాన్స్ డ్యాష్‌బోర్డ్" : "Finance Dashboard"}</span>
            <span>${escapeHtml(new Date().toLocaleString())}</span>
          </div>
        </div>

        <script>
          setTimeout(function() {
            if ("${format}" === 'jpg') {
              var script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
              script.onload = function() {
                var element = document.getElementById('statement-card');
                html2canvas(element, {
                  scale: 2,
                  useCORS: true,
                  allowTaint: true,
                  backgroundColor: '#ffffff'
                }).then(function(canvas) {
                  var link = document.createElement('a');
                  link.download = 'finance_statement_${periodStartStr.replace(/\//g, "")}_${periodEndStr.replace(/\//g, "")}.jpg';
                  link.href = canvas.toDataURL('image/jpeg', 0.95);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  
                  var statusMsg = document.getElementById('status-msg');
                  statusMsg.innerHTML = '<span style="font-size: 40px; color: #0d9488;">✓</span><br><strong>Export Complete!</strong><br><span style="font-size: 13px; color: #94a3b8; margin-top: 8px;">You can now close this tab.</span>';
                  var spinner = document.getElementById('status-spinner');
                  if (spinner) spinner.style.display = 'none';
                }).catch(function(err) {
                  console.error(err);
                  alert('Failed to generate image: ' + err.message);
                });
              };
              script.onerror = function() {
                alert('Failed to load html2canvas library. Please check your internet connection.');
              };
              document.head.appendChild(script);
            } else {
              window.print();
            }
          }, 500);
        </script>
      </body>
    </html>
  `);
  win.document.close();
  return { success: true, platform: "web" };
}

function generatePlainTextStatement(
  periodStartStr: string,
  periodEndStr: string,
  bf: number,
  transactions: ExportTransaction[],
  totals: ExportTotals,
  language: "en" | "te",
  villageName: string
): string {
  const formatVal = (v: number) => Math.round(v).toLocaleString("en-IN");
  const isTe = language === "te";
  
  const title = isTe ? "కార్తికేయ ఫైనాన్స్" : "KARTHIKEYA FINANCE";
  const subTitle = isTe ? "ఖాతా నివేదిక" : "ACCOUNT STATEMENT";
  const periodLbl = isTe ? "సమయం" : "Period";
  const villageLbl = isTe ? "గ్రామం" : "Village";
  const generatedLbl = isTe ? "సృష్టించబడిన తేదీ" : "Generated";
  
  const width = 45;
  const divider = "-".repeat(width);
  const doubleDivider = "=".repeat(width);

  const formatLine = (label: string, value: string, symbol: string = "="): string => {
    const valPart = `${symbol} ${value}`;
    const padLength = width - label.length - valPart.length;
    if (padLength > 0) {
      return `${label}${" ".repeat(padLength)}${valPart}`;
    }
    return `${label} ${valPart}`;
  };

  let output = `=============================================\n`;
  output += `            ${title}\n`;
  output += `            ${subTitle}\n`;
  output += `=============================================\n`;
  output += `${periodLbl}: ${periodStartStr} to ${periodEndStr}\n`;
  output += `${villageLbl}: ${villageName}\n`;
  output += `${generatedLbl}: ${new Date().toLocaleString()}\n\n`;

  const isAllVillages = villageName === "All Villages" || villageName === "అన్ని గ్రామాలు";

  if (isAllVillages) {
    const lblBf = isTe ? "BF (ప్రారంభ నిల్వ)" : "BF";
    const lblInvs = isTe ? "పెట్టుబడులు" : "Investments";
    const lblColls = isTe ? "వసూళ్లు" : "Collections";
    const lblLoans = isTe ? "చెల్లింపులు (రుణాలు)" : "Payments";
    const lblTotal = isTe ? "మొత్తం (Total)" : "Total";

    const lineBf = formatLine(lblBf, formatVal(bf));
    const lineInvs = formatLine(lblInvs, formatVal(totals.sumInvs));
    const firstSum = bf + totals.sumInvs;
    const lineFirstSum = formatLine("", formatVal(firstSum));

    const lineColls = formatLine(lblColls, formatVal(totals.sumColls));
    const lineLoans = formatLine(lblLoans, formatVal(totals.sumLoans));
    const secondSum = firstSum + totals.sumColls - totals.sumLoans;
    const lineSecondSum = formatLine("", formatVal(secondSum));

    output += `${lineBf}\n`;
    output += `${lineInvs}\n`;
    output += `${divider}\n`;
    output += `${lineFirstSum}\n`;
    output += `${lineColls}\n`;
    output += `${lineLoans}\n`;
    output += `${divider}\n`;
    output += `${lineSecondSum}\n`;

    const exps = transactions.filter((t) => t.type === "EXPENSE");
    if (exps.length > 0) {
      exps.forEach((exp) => {
        const lblExp = `${exp.desc} (${isTe ? "ఖర్చులు" : "Expenses"})`;
        output += `${formatLine(lblExp, formatVal(exp.amount))}\n`;
      });
      output += `${divider}\n`;
    }
    output += `${formatLine(lblTotal, formatVal(totals.netTotal))}\n`;
    output += `${doubleDivider}`;
  } else {
    const lblColls = isTe ? "గ్రామ వసూళ్లు" : "Village Collections";
    const lblLoans = isTe ? "గ్రామ రుణాలు" : "Village Loans";
    const lblNet = isTe ? "నికర నగదు ప్రవాహం" : "Net Cashflow";

    output += `${formatLine(lblColls, formatVal(totals.sumColls))}\n`;
    output += `${formatLine(lblLoans, formatVal(totals.sumLoans))}\n`;
    output += `${divider}\n`;
    output += `${formatLine(lblNet, formatVal(totals.sumColls - totals.sumLoans))}\n`;
    output += `${doubleDivider}`;
  }
  
  return output;
}

