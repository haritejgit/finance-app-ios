import { Platform } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Customer, Loan } from "./types";
import {
  buildStatementData,
  formatAlignedStatementBody,
  formatAmountWithSign,
  formatIndianNumber,
  StatementData,
  StatementLanguage,
  StatementLineType,
  translateStatementLabel,
} from "./statement-format";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type LedgerHtmlRow =
  | { kind: "line"; label: string; amount: string; type?: StatementLineType }
  | { kind: "divider" }
  | { kind: "message"; text: string };

function buildLedgerRows(statementData: StatementData, language: StatementLanguage): LedgerHtmlRow[] {
  const rows: LedgerHtmlRow[] = [];
  const hasRows =
    statementData.investments.length +
      statementData.collections.length +
      statementData.payments.length +
      statementData.expenses.length >
    0;

  rows.push({ kind: "line", label: "BF", amount: formatIndianNumber(statementData.bf), type: "balance" });

  if (!hasRows) {
    rows.push({ kind: "message", text: language === "te" ? "ఈ కాలంలో లావాదేవీలు లేవు" : "No transactions in this period" });
    rows.push({ kind: "divider" });
    rows.push({ kind: "line", label: translateStatementLabel("Total", language), amount: formatIndianNumber(statementData.total), type: "total" });
    return rows;
  }

  statementData.investments.forEach((item) => {
    rows.push({
      kind: "line",
      label: translateStatementLabel(item.name, language),
      amount: formatAmountWithSign(item.amount, item.type),
      type: item.type,
    });
  });
  if (statementData.investments.length > 0) {
    rows.push({ kind: "divider" });
    rows.push({ kind: "line", label: "", amount: formatIndianNumber(statementData.subtotal1), type: "subtotal" });
  }

  statementData.collections.forEach((item) => {
    rows.push({
      kind: "line",
      label: translateStatementLabel(item.name, language),
      amount: formatAmountWithSign(item.amount, item.type),
      type: item.type,
    });
  });
  statementData.payments.forEach((item) => {
    rows.push({
      kind: "line",
      label: translateStatementLabel(item.name, language),
      amount: formatAmountWithSign(item.amount, item.type),
      type: item.type,
    });
  });
  if (statementData.collections.length > 0 || statementData.payments.length > 0) {
    rows.push({ kind: "divider" });
    rows.push({ kind: "line", label: "", amount: formatIndianNumber(statementData.subtotal2), type: "subtotal" });
  }

  statementData.expenses.forEach((item) => {
    rows.push({
      kind: "line",
      label: translateStatementLabel(item.name, language),
      amount: formatAmountWithSign(item.amount, item.type),
      type: item.type,
    });
  });
  if (statementData.expenses.length > 0) {
    rows.push({ kind: "divider" });
  }
  rows.push({ kind: "line", label: translateStatementLabel("Total", language), amount: formatIndianNumber(statementData.total), type: "total" });

  return rows;
}

function renderLedgerHtml(statementData: StatementData, language: StatementLanguage): string {
  return `
    <div class="ledger-table" role="table" aria-label="Account statement">
      ${buildLedgerRows(statementData, language)
        .map((row) => {
          if (row.kind === "divider") {
            return `
              <div class="ledger-row ledger-divider" role="row">
                <div class="ledger-label"></div>
                <div class="ledger-eq"></div>
                <div class="ledger-amount">---------</div>
              </div>
            `;
          }
          if (row.kind === "message") {
            return `<div class="ledger-message">${escapeHtml(row.text)}</div>`;
          }
          return `
            <div class="ledger-row ${row.type === "total" ? "ledger-total" : ""}" role="row">
              <div class="ledger-label">${escapeHtml(row.label)}</div>
              <div class="ledger-eq">=</div>
              <div class="ledger-amount">${escapeHtml(row.amount)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
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

export const teluguTranslations: Record<string, string> = {
  "food": "భోజనం",
  "travel": "దారి ఖర్చులు",
  "adharsh": "ఆదర్ష్",
  "hari": "హరి",
  "petrol": "పెట్రోల్",
  "investment": "పెట్టుబడి",
  "collection": "వసూళ్లు",
  "collections": "వసూళ్లు",
  "payment": "పంచిన డబ్బులు",
  "payments": "పంచిన డబ్బులు",
  "expense": "ఖర్చులు",
  "expenses": "ఖర్చులు",
  "loan": "పంచిన డబ్బులు",
  "loans": "పంచిన డబ్బులు",
  "office": "ఆఫీస్",
  "rent": "అద్దె",
  "salary": "జీతం",
  "salaries": "జీతాలు",
  "tea": "టీ",
  "snacks": "స్నాక్స్",
};

export function phonemeTransliterate(word: string): string {
  let w = word.toLowerCase();
  const rules = [
    { pat: "ksha", rep: "క్ష" },
    { pat: "ksh", rep: "క్ష్" },
    { pat: "shra", rep: "శ్ర" },
    { pat: "shr", rep: "శ్ర" },
    { pat: "thra", rep: "త్ర" },
    { pat: "thr", rep: "త్ర్" },
    { pat: "dhra", rep: "ద్ర" },
    { pat: "dhr", rep: "దర్" },
    { pat: "chra", rep: "చ్ర" },
    { pat: "khy", rep: "ఖ్య" },
    { pat: "kha", rep: "ఖ" },
    { pat: "khi", rep: "ఖి" },
    { pat: "khu", rep: "ఖు" },
    { pat: "kh", rep: "ఖ్" },
    { pat: "gha", rep: "ఘ" },
    { pat: "ghi", rep: "ఘి" },
    { pat: "ghu", rep: "ఘు" },
    { pat: "gh", rep: "ఘ్" },
    { pat: "cha", rep: "చ" },
    { pat: "chi", rep: "చి" },
    { pat: "chu", rep: "చు" },
    { pat: "che", rep: "చె" },
    { pat: "cho", rep: "చొ" },
    { pat: "ch", rep: "చ్" },
    { pat: "tha", rep: "త" },
    { pat: "thi", rep: "తి" },
    { pat: "thu", rep: "తు" },
    { pat: "the", rep: "తె" },
    { pat: "tho", rep: "తొ" },
    { pat: "th", rep: "త్" },
    { pat: "dha", rep: "ద" },
    { pat: "dhi", rep: "ది" },
    { pat: "dhu", rep: "దు" },
    { pat: "dhe", rep: "దె" },
    { pat: "dho", rep: "దొ" },
    { pat: "dh", rep: "ద్" },
    { pat: "pha", rep: "ఫ" },
    { pat: "phi", rep: "ఫి" },
    { pat: "phu", rep: "ఫు" },
    { pat: "ph", rep: "ఫ్" },
    { pat: "bha", rep: "భ" },
    { pat: "bhi", rep: "భి" },
    { pat: "bhu", rep: "భు" },
    { pat: "bh", rep: "బ్" },
    { pat: "sha", rep: "శ" },
    { pat: "shi", rep: "శి" },
    { pat: "shu", rep: "శు" },
    { pat: "she", rep: "శె" },
    { pat: "sho", rep: "శొ" },
    { pat: "sh", rep: "ష్" },
    { pat: "ddha", rep: "ద్ధ" },
    { pat: "ddh", rep: "ద్ధ్" },
    { pat: "dda", rep: "డ్డ" },
    { pat: "ddi", rep: "డ్డి" },
    { pat: "ddu", rep: "డ్డు" },
    { pat: "dd", rep: "డ్డ్" },
    { pat: "tta", rep: "ట్ట" },
    { pat: "tti", rep: "ట్టి" },
    { pat: "ttu", rep: "ట్టు" },
    { pat: "tt", rep: "ట్ట్" },
    { pat: "ppa", rep: "ప్ప" },
    { pat: "pp", rep: "ప్ప్" },
    { pat: "bba", rep: "బ్బ" },
    { pat: "bb", rep: "బ్బ్" },
    { pat: "kka", rep: "క్క" },
    { pat: "kk", rep: "క్క్" },
    { pat: "gga", rep: "గ్గ" },
    { pat: "gg", rep: "గ్గ్" },
    { pat: "mma", rep: "మ్మ" },
    { pat: "mmi", rep: "మ్మి" },
    { pat: "mmu", rep: "మ్ము" },
    { pat: "mm", rep: "మ్మ్" },
    { pat: "nna", rep: "న్న" },
    { pat: "nni", rep: "న్ని" },
    { pat: "nnu", rep: "న్ను" },
    { pat: "nn", rep: "న్న్" },
    { pat: "lla", rep: "ల్ల" },
    { pat: "lli", rep: "ల్లి" },
    { pat: "llu", rep: "ల్లు" },
    { pat: "ll", rep: "ల్ల్" },
    { pat: "rra", rep: "ర్ర" },
    { pat: "rri", rep: "ర్రి" },
    { pat: "rru", rep: "ర్రు" },
    { pat: "rr", rep: "ర్ర" },
    { pat: "ka", rep: "క" }, { pat: "kaa", rep: "కా" }, { pat: "ki", rep: "కి" }, { pat: "kee", rep: "కీ" }, { pat: "ku", rep: "కు" }, { pat: "koo", rep: "కూ" }, { pat: "ke", rep: "కె" }, { pat: "kae", rep: "కే" }, { pat: "ko", rep: "కొ" }, { pat: "koa", rep: "కో" }, { pat: "kai", rep: "కై" }, { pat: "kau", rep: "కౌ" }, { pat: "k", rep: "క్" },
    { pat: "ga", rep: "గ" }, { pat: "gaa", rep: "గా" }, { pat: "gi", rep: "గి" }, { pat: "gee", rep: "గీ" }, { pat: "gu", rep: "గు" }, { pat: "goo", rep: "గూ" }, { pat: "ge", rep: "గె" }, { pat: "gae", rep: "గే" }, { pat: "go", rep: "గొ" }, { pat: "goa", rep: "గో" }, { pat: "gai", rep: "గై" }, { pat: "gau", rep: "గౌ" }, { pat: "g", rep: "గ్" },
    { pat: "ja", rep: "జ" }, { pat: "jaa", rep: "జా" }, { pat: "ji", rep: "జి" }, { pat: "jee", rep: "జీ" }, { pat: "ju", rep: "జు" }, { pat: "joo", rep: "జూ" }, { pat: "je", rep: "జె" }, { pat: "jae", rep: "జే" }, { pat: "jo", rep: "జొ" }, { pat: "joa", rep: "జో" }, { pat: "jai", rep: "జై" }, { pat: "j", rep: "జ్" },
    { pat: "ta", rep: "ట" }, { pat: "taa", rep: "టా" }, { pat: "ti", rep: "టి" }, { pat: "tee", rep: "టీ" }, { pat: "tu", rep: "టు" }, { pat: "too", rep: "టూ" }, { pat: "te", rep: "టె" }, { pat: "tae", rep: "టే" }, { pat: "to", rep: "టొ" }, { pat: "toa", rep: "టో" }, { pat: "t", rep: "ట్" },
    { pat: "da", rep: "డ" }, { pat: "daa", rep: "డా" }, { pat: "di", rep: "డి" }, { pat: "dee", rep: "డీ" }, { pat: "du", rep: "డు" }, { pat: "doo", rep: "డూ" }, { pat: "de", rep: "డె" }, { pat: "dae", rep: "డే" }, { pat: "do", rep: "డొ" }, { pat: "doa", rep: "డో" }, { pat: "d", rep: "డ్" },
    { pat: "na", rep: "న" }, { pat: "naa", rep: "నా" }, { pat: "ni", rep: "ని" }, { pat: "nee", rep: "నీ" }, { pat: "nu", rep: "ను" }, { pat: "noo", rep: "నూ" }, { pat: "ne", rep: "నె" }, { pat: "nae", rep: "నే" }, { pat: "no", rep: "నొ" }, { pat: "noa", rep: "నో" }, { pat: "nai", rep: "నై" }, { pat: "n", rep: "న్" },
    { pat: "pa", rep: "ప" }, { pat: "paa", rep: "పా" }, { pat: "pi", rep: "పి" }, { pat: "pee", rep: "పీ" }, { pat: "pu", rep: "పు" }, { pat: "poo", rep: "పూ" }, { pat: "pe", rep: "పె" }, { pat: "pae", rep: "పే" }, { pat: "po", rep: "పొ" }, { pat: "poa", rep: "పో" }, { pat: "pai", rep: "పై" }, { pat: "p", rep: "ప్" },
    { pat: "ba", rep: "బ" }, { pat: "baa", rep: "బా" }, { pat: "bi", rep: "బి" }, { pat: "bee", rep: "బీ" }, { pat: "bu", rep: "బు" }, { pat: "boo", rep: "బూ" }, { pat: "be", rep: "బె" }, { pat: "bae", rep: "బే" }, { pat: "bo", rep: "బొ" }, { pat: "boa", rep: "బో" }, { pat: "b", rep: "బ్" },
    { pat: "ma", rep: "మ" }, { pat: "maa", rep: "మా" }, { pat: "mi", rep: "మి" }, { pat: "mee", rep: "మీ" }, { pat: "mu", rep: "ము" }, { pat: "moo", rep: "మూ" }, { pat: "me", rep: "మె" }, { pat: "mae", rep: "మే" }, { pat: "mo", rep: "మొ" }, { pat: "moa", rep: "మో" }, { pat: "mai", rep: "మై" }, { pat: "m", rep: "మ్" },
    { pat: "ya", rep: "య" }, { pat: "yaa", rep: "యా" }, { pat: "yi", rep: "యి" }, { pat: "yee", rep: "యీ" }, { pat: "yu", rep: "యు" }, { pat: "yoo", rep: "యూ" }, { pat: "ye", rep: "యె" }, { pat: "yae", rep: "యే" }, { pat: "yo", rep: "యొ" }, { pat: "yoa", rep: "యో" }, { pat: "y", rep: "య్" },
    { pat: "ra", rep: "ర" }, { pat: "raa", rep: "రా" }, { pat: "ri", rep: "రి" }, { pat: "ree", rep: "రీ" }, { pat: "ru", rep: "రు" }, { pat: "roo", rep: "రూ" }, { pat: "re", rep: "రె" }, { pat: "rae", rep: "రే" }, { pat: "ro", rep: "రొ" }, { pat: "roa", rep: "రో" }, { pat: "rai", rep: "రై" }, { pat: "r", rep: "ర్" },
    { pat: "la", rep: "ల" }, { pat: "laa", rep: "లా" }, { pat: "li", rep: "లి" }, { pat: "lee", rep: "లీ" }, { pat: "lu", rep: "లు" }, { pat: "loo", rep: "లూ" }, { pat: "le", rep: "లె" }, { pat: "lae", rep: "లే" }, { pat: "lo", rep: "లొ" }, { pat: "loa", rep: "లో" }, { pat: "lai", rep: "లై" }, { pat: "l", rep: "ల్" },
    { pat: "va", rep: "వ" }, { pat: "vaa", rep: "వా" }, { pat: "vi", rep: "వి" }, { pat: "vu", rep: "వు" }, { pat: "voo", rep: "వూ" }, { pat: "ve", rep: "వె" }, { pat: "vae", rep: "వే" }, { pat: "vo", rep: "వొ" }, { pat: "voa", rep: "వో" }, { pat: "vai", rep: "వై" }, { pat: "v", rep: "ヴ" },
    { pat: "wa", rep: "వ" }, { pat: "waa", rep: "వా" }, { pat: "wi", rep: "వి" }, { pat: "wee", rep: "వీ" }, { pat: "wu", rep: "వు" }, { pat: "woe", rep: "వే" }, { pat: "wo", rep: "వొ" }, { pat: "w", rep: "వ్" },
    { pat: "sa", rep: "స" }, { pat: "saa", rep: "సా" }, { pat: "si", rep: "సి" }, { pat: "see", rep: "సీ" }, { pat: "su", rep: "సు" }, { pat: "soo", rep: "సూ" }, { pat: "se", rep: "సె" }, { pat: "sae", rep: "సే" }, { pat: "so", rep: "సొ" }, { pat: "soa", rep: "సో" }, { pat: "sai", rep: "సై" }, { pat: "s", rep: "స్" },
    { pat: "ha", rep: "హ" }, { pat: "haa", rep: "హ" }, { pat: "hi", rep: "హి" }, { pat: "hee", rep: "హీ" }, { pat: "hu", rep: "హు" }, { pat: "hoo", rep: "హూ" }, { pat: "he", rep: "హె" }, { pat: "hae", rep: "హే" }, { pat: "ho", rep: "హొ" }, { pat: "hoa", rep: "హో" }, { pat: "h", rep: "హ్" },
    { pat: "aa", rep: "ఆ" },
    { pat: "ee", rep: "ఈ" },
    { pat: "oo", rep: "ఊ" },
    { pat: "ae", rep: "ఏ" },
    { pat: "ai", rep: "ఐ" },
    { pat: "ou", rep: "ఔ" },
    { pat: "au", rep: "ఔ" },
    { pat: "a", rep: "అ" },
    { pat: "i", rep: "ఇ" },
    { pat: "u", rep: "ఉ" },
    { pat: "e", rep: "ఎ" },
    { pat: "o", rep: "ఒ" }
  ];
  let index = 0;
  let res = "";
  while (index < w.length) {
    let matched = false;
    for (const rule of rules) {
      if (w.startsWith(rule.pat, index)) {
        res += rule.rep;
        index += rule.pat.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const char = w[index];
      if (/[a-z]/.test(char)) {
        // Skip
      } else {
        res += char;
      }
      index++;
    }
  }
  return res;
}

export function transliterateEnglishToTelugu(text: string): string {
  if (!text) return "";
  if (/[\u0c00-\u0c7f]/.test(text)) return text;
  
  const overrides: Record<string, string> = {
    "shraddha": "శ్రద్ధ",
    "murri": "ముర్రి",
    "haritej": "హరితేజ్",
    "karthik": "కార్తీక్",
    "ramesh": "రమేష్",
    "suresh": "సురేష్",
    "chinna": "చిన్న",
    "murthy": "మూర్తి",
    "reddy": "రెడ్డి",
    "rao": "రావు",
    "naidu": "నాయుడు",
    "kumar": "కుమార్",
    "laxmi": "లక్ష్మి",
    "lakshmi": "లక్ష్మి",
    "devi": "దేవి",
    "srinivas": "శ్రీనివాస్",
    "venkat": "వెంకట్",
    "satish": "సతీష్",
    "prasad": "ప్రసాద్",
    "krishna": "కృష్ణ",
    "raju": "రాజు",
    "anil": "అనిల్",
    "mohan": "మోహన్",
    "gopal": "గోపాల్",
    "shankar": "శంకర్",
    "siva": "శివ",
    "shiva": "శివ",
    "seetha": "సీత",
    "sita": "సీత",
    "ram": "రామ్",
    "rama": "రామ",
    "swamy": "స్వామి",
    "sekhar": "శేఖర్",
    "shekhar": "శేఖర్",
    "babu": "బాబు",
    "latha": "లత",
    "rani": "రాణి",
  };

  const words = text.split(/(\s+)/);
  const translatedWords = words.map(word => {
    const trimmed = word.trim();
    if (!trimmed) return word;
    const lower = trimmed.toLowerCase();
    if (overrides[lower]) return overrides[lower];
    if (teluguTranslations[lower]) return teluguTranslations[lower];
    return phonemeTransliterate(trimmed);
  });

  return translatedWords.join("");
}

export function translateTelugu(text: string): string {
  if (!text) return "";
  const cleaned = text.trim();
  const lower = cleaned.toLowerCase();
  if (teluguTranslations[lower]) {
    return teluguTranslations[lower];
  }
  return transliterateEnglishToTelugu(cleaned);
}

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
  const isTe = language === "te";
  const title = isTe ? "కార్తికేయ ఫైనాన్స్" : "Karthikeya Finance";
  const subTitle = isTe ? "ఆర్థిక ఖాతా నివేదిక" : "Account Statement";
  
  const formatVal = (v: number) => Math.round(v).toLocaleString("en-IN");
  const isAllVillages = villageName === "All Villages" || villageName === "అన్ని గ్రామాలు";

// Monospace formatter configuration
const width = 45;
const divider = "-".repeat(width);
const doubleDivider = "=".repeat(width);

// Helper to truncate long labels and add ellipsis
const truncateLabel = (label: string, maxLen: number): string => {
  if (maxLen <= 0) return "";
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "…";
};

// Formats a line ensuring the label, symbol and value occupy exactly `width` characters
const formatLine = (label: string, value: string, symbol: string = "="): string => {
  const valPart = `${symbol} ${value}`;
  // Calculate max label length leaving at least one space before valPart
  const maxLabelLen = width - valPart.length - 1;
  const finalLabel = label.length > maxLabelLen ? truncateLabel(label, maxLabelLen) : label;
  const padLength = width - finalLabel.length - valPart.length;
  const padding = padLength > 0 ? " ".repeat(padLength) : "";
  return `${finalLabel}${padding}${valPart}`;
};

let ledgerText = "";

  if (isAllVillages) {
    const lblBf = isTe ? "BF (ప్రారంభ నిల్వ)" : "BF";
    const lblInvs = isTe ? "పెట్టుబడి" : "Investments";
    const lblColls = isTe ? "వసూళ్లు" : "Collections";
    const lblLoans = isTe ? "పంచిన డబ్బులు" : "Payments";
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
    if (totals.sumInvs > 0) {
      ledgerText += `${lineInvs}\n`;
      ledgerText += `${divider}\n`;
      ledgerText += `${lineFirstSum}\n`;
    }
    ledgerText += `${lineColls}\n`;
    ledgerText += `${lineLoans}\n`;
    ledgerText += `${divider}\n`;
    ledgerText += `${totals.sumInvs > 0 ? lineSecondSum : formatLine("", formatVal(bf + totals.sumColls - totals.sumLoans))}\n`;

    const exps = transactions.filter((t) => t.type === "EXPENSE");
    if (exps.length > 0) {
      const expenseMap = new Map<string, { desc: string; amount: number }>();
      exps.forEach((exp) => {
        const label = (exp.desc || "Other").trim() || "Other";
        const key = label.toLowerCase();
        const existing = expenseMap.get(key);
        expenseMap.set(key, {
          desc: existing?.desc ?? label,
          amount: (existing?.amount ?? 0) + (Number(exp.amount) || 0),
        });
      });
      const groupedExps = Array.from(expenseMap.values()).sort((a, b) => b.amount - a.amount);

      groupedExps.forEach((exp) => {
        const lblExp = isTe ? translateTelugu(exp.desc) : exp.desc;
        ledgerText += `${formatLine(lblExp, formatVal(exp.amount))}\n`;
      });
      ledgerText += `${divider}\n`;
    }
    ledgerText += `${formatLine(lblTotal, formatVal(totals.netTotal))}\n`;
    ledgerText += `${doubleDivider}`;
  } else {
    const lblColls = isTe ? "వసూళ్లు" : "Village Collections";
    const lblLoans = isTe ? "పంచిన డబ్బులు" : "Village Loans";
    const lblNet = isTe ? "నికర నగదు ప్రవాహం" : "Net Cashflow";

    ledgerText += `${formatLine(lblColls, formatVal(totals.sumColls))}\n`;
    ledgerText += `${formatLine(lblLoans, formatVal(totals.sumLoans))}\n`;
    ledgerText += `${divider}\n`;
    ledgerText += `${formatLine(lblNet, formatVal(totals.sumColls - totals.sumLoans))}\n`;
    ledgerText += `${doubleDivider}`;
  }

  const win = window.open("", "_blank", "width=600,height=780,scrollbars=yes,resizable=yes");
  if (!win) {
    console.error("Failed to open window for export - popup blocker might be active");
    alert("Please allow popups for this site to enable export functionality");
    return { success: false, platform: "web" };
  }

  try {
    console.log("Export format:", format);
    console.log("Ledger text length:", ledgerText.length);
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
  } catch (error) {
    console.error("Error during export:", error);
    if (win) win.close();
    return { success: false, platform: "web" };
  }
}

export function generatePlainTextStatement(
  periodStartStr: string,
  periodEndStr: string,
  bf: number,
  transactions: ExportTransaction[],
  totals: ExportTotals,
  language: "en" | "te",
  villageName: string
): string {
  const statementData = buildStatementData({
    startDate: periodStartStr,
    endDate: periodEndStr,
    bf,
    transactions,
    totals,
    village: villageName,
  });
  return [
    "Karthikeya Finance",
    "ACCOUNT STATEMENT",
    "",
    `Period: ${periodStartStr} - ${periodEndStr}`,
    `Village: ${villageName || "All Villages"}`,
    "",
    formatAlignedStatementBody(statementData, language),
  ].join("\n");

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

// Helper to truncate long labels and add ellipsis
const truncateLabel = (label: string, maxLen: number): string => {
  if (maxLen <= 0) return "";
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "…";
};

// Formats a line ensuring the label, symbol and value occupy exactly `width` characters
const formatLine = (label: string, value: string, symbol: string = "="): string => {
  const valPart = `${symbol} ${value}`;
  const maxLabelLen = width - valPart.length - 1;
  const finalLabel = label.length > maxLabelLen ? truncateLabel(label, maxLabelLen) : label;
  const padLength = width - finalLabel.length - valPart.length;
  const padding = padLength > 0 ? " ".repeat(padLength) : "";
  return `${finalLabel}${padding}${valPart}`;
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
    const lblInvs = isTe ? "పెట్టుబడి" : "Investments";
    const lblColls = isTe ? "వసూళ్లు" : "Collections";
    const lblLoans = isTe ? "పంచిన డబ్బులు" : "Payments";
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
    if (totals.sumInvs > 0) {
      output += `${lineInvs}\n`;
      output += `${divider}\n`;
      output += `${lineFirstSum}\n`;
    }
    output += `${lineColls}\n`;
    output += `${lineLoans}\n`;
    output += `${divider}\n`;
    output += `${totals.sumInvs > 0 ? lineSecondSum : formatLine("", formatVal(bf + totals.sumColls - totals.sumLoans))}\n`;

    const exps = transactions.filter((t) => t.type === "EXPENSE");
    if (exps.length > 0) {
      const expenseMap = new Map<string, { desc: string; amount: number }>();
      exps.forEach((exp) => {
        const label = (exp.desc || "Other").trim() || "Other";
        const key = label.toLowerCase();
        const existing = expenseMap.get(key);
        expenseMap.set(key, {
          desc: existing?.desc ?? label,
          amount: (existing?.amount ?? 0) + (Number(exp.amount) || 0),
        });
      });
      const groupedExps = Array.from(expenseMap.values()).sort((a, b) => b.amount - a.amount);

      groupedExps.forEach((exp) => {
        const lblExp = isTe ? translateTelugu(exp.desc) : exp.desc;
        output += `${formatLine(lblExp, formatVal(exp.amount))}\n`;
      });
      output += `${divider}\n`;
    }
    output += `${formatLine(lblTotal, formatVal(totals.netTotal))}\n`;
    output += `${doubleDivider}`;
  } else {
    const lblColls = isTe ? "వసూళ్లు" : "Village Collections";
    const lblLoans = isTe ? "పంచిన డబ్బులు" : "Village Loans";
    const lblNet = isTe ? "నికర నగదు ప్రవాహం" : "Net Cashflow";

    output += `${formatLine(lblColls, formatVal(totals.sumColls))}\n`;
    output += `${formatLine(lblLoans, formatVal(totals.sumLoans))}\n`;
    output += `${divider}\n`;
    output += `${formatLine(lblNet, formatVal(totals.sumColls - totals.sumLoans))}\n`;
    output += `${doubleDivider}`;
  }
  
  return output;
}

