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
  const title = isTe ? "ఆర్థిక ఖాతా నివేదిక" : "Account Statement";
  const subTitle = isTe ? "బ్యాలెన్సింగ్ ఫండ్, పెట్టుబడులు & ఖర్చులు" : "Balancing Fund, Investments & Expenses";
  
  const transHeaders = {
    date: isTe ? "తేదీ" : "Date",
    type: isTe ? "రకం" : "Type",
    desc: isTe ? "వివరణ" : "Description",
    amount: isTe ? "మొత్తం" : "Amount"
  };

  const transLabels = {
    INVESTMENT: isTe ? "పెట్టుబడి" : "Investment",
    COLLECTION: isTe ? "వసూలు" : "Collection",
    LOAN: isTe ? "రుణం" : "Loan",
    EXPENSE: isTe ? "ఖర్చు" : "Expense"
  };

  const formatVal = (v: number) => Math.round(v).toLocaleString("en-IN");

  // Filter out investments & expenses if a specific village is chosen
  const isAllVillages = villageName === "All Villages" || villageName === "అన్ని గ్రామాలు";

  // Generate table rows
  const tableRowsHtml = transactions.map((t) => {
    const typeLabel = transLabels[t.type] || t.type;
    const badgeClass = `badge-${t.type.toLowerCase()}`;
    const amountPrefix = (t.type === "COLLECTION" || t.type === "INVESTMENT") ? "+" : "-";
    const dateFormatted = new Date(t.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

    return `
      <tr>
        <td>${escapeHtml(dateFormatted)}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(typeLabel)}</span></td>
        <td>${escapeHtml(t.desc)}</td>
        <td class="text-right" style="font-weight: 700; color: ${amountPrefix === "+" ? "#0d9488" : "#e11d48"};">
          ${amountPrefix} Rs.${formatVal(t.amount)}
        </td>
      </tr>
    `;
  }).join("");

  // Build summary grid
  let summaryGridHtml = "";
  if (isAllVillages) {
    summaryGridHtml = `
      <div class="summary-card">
        <div class="summary-label">${isTe ? "ప్రారంభ నిల్వ (BF)" : "Opening BF"}</div>
        <div class="summary-value">Rs.${formatVal(bf)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${isTe ? "పెట్టుబడులు" : "Investments"}</div>
        <div class="summary-value positive">+ Rs.${formatVal(totals.sumInvs)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${isTe ? "వసూళ్లు" : "Collections"}</div>
        <div class="summary-value positive">+ Rs.${formatVal(totals.sumColls)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${isTe ? "రుణాలు" : "Loans (Paid)"}</div>
        <div class="summary-value negative">- Rs.${formatVal(totals.sumLoans)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${isTe ? "ఖర్చులు" : "Expenses"}</div>
        <div class="summary-value negative">- Rs.${formatVal(totals.sumExps)}</div>
      </div>
      <div class="summary-card" style="background: #e2fbf7; border-color: #2ec4b6;">
        <div class="summary-label" style="color: #0f6c61;">${isTe ? "ముగింపు నిల్వ" : "Closing Balance"}</div>
        <div class="summary-value" style="color: #0f6c61; font-size: 18px;">Rs.${formatVal(totals.netTotal)}</div>
      </div>
    `;
  } else {
    summaryGridHtml = `
      <div class="summary-card">
        <div class="summary-label">${isTe ? "గ్రామ వసూళ్లు" : "Village Collections"}</div>
        <div class="summary-value positive">Rs.${formatVal(totals.sumColls)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">${isTe ? "గ్రామ రుణాలు" : "Village Loans"}</div>
        <div class="summary-value negative">Rs.${formatVal(totals.sumLoans)}</div>
      </div>
      <div class="summary-card" style="background: #e2fbf7; border-color: #2ec4b6;">
        <div class="summary-label" style="color: #0f6c61;">${isTe ? "నికర వసూలు" : "Net Cashflow"}</div>
        <div class="summary-value" style="color: #0f6c61; font-size: 18px;">Rs.${formatVal(totals.sumColls - totals.sumLoans)}</div>
      </div>
    `;
  }

  const win = window.open("", "_blank", "width=960,height=720");
  if (!win) return { success: false, platform: "web" };

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
            background-color: #f8fafc;
            display: flex;
            justify-content: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #statement-card {
            background: #ffffff;
            width: 100%;
            max-width: 840px;
            border-top: 6px solid #0f172a;
            border-left: 1px solid #e2e8f0;
            border-right: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            position: relative;
            box-sizing: border-box;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px dashed #e2e8f0;
            padding-bottom: 28px;
            margin-bottom: 30px;
          }
          .logo-section {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .logo-icon {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            background: linear-gradient(135deg, #0f172a, #1e3a8a);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 800;
            font-size: 24px;
            font-family: 'Plus Jakarta Sans', sans-serif;
            border: 2px solid #e2e8f0;
          }
          .company-title {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
            letter-spacing: -0.02em;
          }
          .company-sub {
            font-size: 13px;
            color: #64748b;
            margin: 4px 0 0 0;
            font-weight: 500;
          }
          .meta-section {
            text-align: right;
            border-left: 2px solid #e2e8f0;
            padding-left: 24px;
          }
          .meta-title {
            font-size: 18px;
            font-weight: 800;
            color: #0d9488;
            margin: 0 0 8px 0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .meta-item {
            font-size: 12px;
            color: #64748b;
            margin: 4px 0 0 0;
            font-weight: 500;
          }
          .meta-value {
            font-weight: 700;
            color: #1e293b;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 12px;
            margin-bottom: 35px;
          }
          .summary-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px 16px;
          }
          .summary-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .summary-value {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 6px;
          }
          .summary-value.positive {
            color: #0d9488;
          }
          .summary-value.negative {
            color: #e11d48;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 35px;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            text-align: left;
            padding: 14px 16px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
          }
          td {
            border-bottom: 1px solid #e2e8f0;
            padding: 14px 16px;
            font-size: 13px;
            color: #334155;
          }
          tr:nth-child(even) td {
            background: #f8fafc;
          }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 700;
            border-radius: 6px;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .badge-investment { background: #e0f2fe; color: #0369a1; }
          .badge-collection { background: #ecfdf5; color: #047857; }
          .badge-loan { background: #fef2f2; color: #b91c1c; }
          .badge-expense { background: #fff7ed; color: #c2410c; }
          .text-right {
            text-align: right;
          }
          .signature-section {
            margin-top: 40px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            gap: 40px;
            page-break-inside: avoid;
          }
          .signature-box {
            flex: 1;
            border: 1px dashed #cbd5e1;
            border-radius: 12px;
            padding: 24px 20px;
            text-align: center;
            background: #fafafa;
          }
          .sig-line {
            border-top: 1px solid #94a3b8;
            margin: 40px auto 10px auto;
            width: 80%;
          }
          .sig-title {
            font-size: 11px;
            font-weight: 700;
            color: #334155;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .sig-date {
            font-size: 11px;
            color: #64748b;
            margin-top: 8px;
          }
          .footer {
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #94a3b8;
            font-weight: 500;
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
            border-left-color: #2ec4b6;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @media print {
            body {
              background: #ffffff;
              padding: 0;
            }
            #statement-card {
              border: 0;
              box-shadow: none;
              padding: 0;
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
          <div class="header-container">
            <div class="logo-section">
              <div class="logo-icon">F</div>
              <div>
                <h1 class="company-title">${escapeHtml(title)}</h1>
                <p class="company-sub">${escapeHtml(subTitle)}</p>
              </div>
            </div>
            <div class="meta-section">
              <h2 class="meta-title">${isTe ? "వ్యక్తిగత నివేదిక" : "STATEMENT"}</h2>
              <p class="meta-item">${isTe ? "సమయం" : "Period"}: <span class="meta-value">${escapeHtml(periodStartStr)} - ${escapeHtml(periodEndStr)}</span></p>
              <p class="meta-item">${isTe ? "గ్రామం" : "Village"}: <span class="meta-value">${escapeHtml(villageName)}</span></p>
              ${userEmail ? `<p class="meta-item">Email: <span class="meta-value">${escapeHtml(userEmail)}</span></p>` : ""}
            </div>
          </div>

          <div class="summary-grid">
            ${summaryGridHtml}
          </div>

          <table>
            <thead>
              <tr>
                <th>${escapeHtml(transHeaders.date)}</th>
                <th>${escapeHtml(transHeaders.type)}</th>
                <th>${escapeHtml(transHeaders.desc)}</th>
                <th class="text-right">${escapeHtml(transHeaders.amount)}</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml || `<tr><td colspan="4" style="text-align: center; color: #94a3b8;">${isTe ? "లావాదేవీలు ఏవీ లేవు" : "No transactions found in this period."}</td></tr>`}
            </tbody>
          </table>

          <div class="signature-section">
            <div class="signature-box">
              <div class="sig-line"></div>
              <div class="sig-title">${isTe ? "ఫీల్డ్ ప్రతినిధి సంతకం" : "Field Representative Signature"}</div>
              <div class="sig-date">${isTe ? "తేదీ" : "Date"}: ____________________</div>
            </div>
            <div class="signature-box">
              <div class="sig-line"></div>
              <div class="sig-title">${isTe ? "అధికారిక మేనేజర్ సంతకం" : "Authorized Manager Sign-off"}</div>
              <div class="sig-date">${isTe ? "తేదీ" : "Date"}: ____________________</div>
            </div>
          </div>

          <div class="footer">
            <span>${isTe ? "ఫైనాన్స్ డ్యాష్‌బోర్డ్ ద్వారా సృష్టించబడింది" : "Generated by Finance App Dashboard"}</span>
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
  
  const title = isTe ? "ఖాతా నివేదిక (Account Statement)" : "ACCOUNT STATEMENT";
  const periodLbl = isTe ? "నివేదిక సమయం" : "Period";
  const villageLbl = isTe ? "గ్రామం" : "Village";
  const generatedLbl = isTe ? "సృష్టించబడిన తేదీ" : "Generated";
  
  let output = `============================================\n`;
  output += `            ${title}\n`;
  output += `============================================\n`;
  output += `${periodLbl}: ${periodStartStr} to ${periodEndStr}\n`;
  output += `${villageLbl}: ${villageName}\n`;
  output += `${generatedLbl}: ${new Date().toLocaleString()}\n\n`;

  const isAllVillages = villageName === "All Villages" || villageName === "అన్ని గ్రామాలు";

  if (isAllVillages) {
    output += `BF               =  ${formatVal(bf).padStart(9)}\n`;
    output += `Investments      =  ${formatVal(totals.sumInvs).padStart(9)}\n`;
    output += `                 ---------\n`;
    output += `                 =  ${formatVal(bf + totals.sumInvs).padStart(9)}\n`;
  }
  
  output += `Collections      =  ${formatVal(totals.sumColls).padStart(9)}\n`;
  output += `Payments (Loans) =  ${formatVal(totals.sumLoans).padStart(9)}\n`;
  
  if (isAllVillages) {
    output += `                 ---------\n`;
    output += `                 =  ${formatVal(bf + totals.sumInvs + totals.sumColls - totals.sumLoans).padStart(9)}\n`;
    
    const exps = transactions.filter(t => t.type === "EXPENSE");
    if (exps.length > 0) {
      exps.forEach((exp) => {
        const desc = `${exp.desc} (Expense)`.slice(0, 16).padEnd(16);
        output += `${desc} =  ${formatVal(exp.amount).padStart(9)}\n`;
      });
      output += `                 ---------\n`;
    }
    
    output += `Total            =  ${formatVal(totals.netTotal).padStart(9)}\n`;
  } else {
    output += `                 ---------\n`;
    output += `Net Cashflow     =  ${formatVal(totals.sumColls - totals.sumLoans).padStart(9)}\n`;
  }
  
  output += `============================================`;
  return output;
}

