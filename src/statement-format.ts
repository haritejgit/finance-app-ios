export type StatementLanguage = "en" | "te";
export type StatementLineType = "investment" | "collection" | "payment" | "expense" | "balance" | "subtotal" | "total";

export type StatementItem = {
  name: string;
  amount: number;
  type: StatementLineType;
};

export type StatementData = {
  startDate: string;
  endDate: string;
  village: string;
  email?: string;
  bf: number;
  investments: StatementItem[];
  collections: StatementItem[];
  payments: StatementItem[];
  expenses: StatementItem[];
  subtotal1: number;
  subtotal2: number;
  total: number;
};

export const teluguTranslations: Record<string, string> = {
  BF: "BF",
  Total: "మొత్తం",
  Collections: "కలక్షన్లు",
  Collection: "కలక్షన్",
  Payments: "పేమెంట్లు",
  Payment: "పేమెంట్",
  Investments: "పెట్టుబడి",
  Investment: "పెట్టుబడి",
  "Adharsh Salary": "ఆదర్శ్ జీతం",
  "Hari Salary": "హరి జీతం",
  Food: "భోజనం ఖర్చు",
  Petrol: "పెట్రోలు",
  "Adharsh Travel": "ఆదర్శ్ దారి ఖర్చులు",
  "Satish Travel": "సతీష్ దారి ఖర్చులు",
  Salary: "జీతం",
  Expense: "ఖర్చు",
  Expenses: "ఖర్చులు",
  Travel: "దారి ఖర్చులు",
};

export const nameTransliterations: Record<string, string> = {
  Hari: "హరి",
  Adharsh: "ఆదర్శ్",
  Satish: "సతీష్",
  Sathish: "సతీష్",
  Sateesh: "సతీష్",
  Ganapathi: "గణపతి",
  Anna: "అన్న",
};

export function stripExpenseSuffix(label: string): string {
  return String(label ?? "").replace(/\s*\(Exp[^)]*\)?/gi, "").trim();
}

export function formatIndianNumber(amount: number): string {
  return Math.round(Number(amount) || 0).toLocaleString("en-IN");
}

export function formatAmountWithSign(amount: number, transactionType: StatementLineType): string {
  const formatted = formatIndianNumber(Math.abs(Number(amount) || 0));
  if (transactionType === "investment" || transactionType === "collection") return `+${formatted}`;
  if (transactionType === "payment" || transactionType === "expense") return `-${formatted}`;
  return formatted;
}

function lookupTelugu(map: Record<string, string>, value: string): string | undefined {
  if (map[value]) return map[value];
  const lowerValue = value.toLocaleLowerCase("en-IN");
  const key = Object.keys(map).find((item) => item.toLocaleLowerCase("en-IN") === lowerValue);
  return key ? map[key] : undefined;
}

function translateTeluguToken(token: string): string {
  return lookupTelugu(teluguTranslations, token) ?? lookupTelugu(nameTransliterations, token) ?? token;
}

function translateCompositeTeluguLabel(label: string): string {
  const direct = lookupTelugu(teluguTranslations, label) ?? lookupTelugu(nameTransliterations, label);
  if (direct) return direct;
  return label.split(/\s+/).map(translateTeluguToken).join(" ");
}

export function translateStatementLabel(label: string, language: StatementLanguage): string {
  const cleaned = stripExpenseSuffix(label);
  if (language !== "te" || !cleaned) return cleaned;

  const parenMatch = cleaned.match(/^(.+?)\(([^)]+)\)$/);
  if (parenMatch) {
    const base = stripExpenseSuffix(parenMatch[1]).trim();
    const person = parenMatch[2].trim();
    const translatedBase = translateCompositeTeluguLabel(base);
    const translatedPerson = lookupTelugu(nameTransliterations, person) ?? person;
    return `${translatedBase}(${translatedPerson})`;
  }

  return translateCompositeTeluguLabel(cleaned);
}

export function formatStatementLine(label: string, amount: number, type: StatementLineType, language: StatementLanguage): string {
  return `${translateStatementLabel(label, language)} = ${formatAmountWithSign(amount, type)}`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

export function formatAlignedStatementLine(
  label: string,
  amountText: string,
  options: { labelWidth?: number; amountWidth?: number } = {}
): string {
  const labelWidth = options.labelWidth ?? 22;
  const amountWidth = options.amountWidth ?? 12;
  const safeLabel = truncateText(label, labelWidth).padEnd(labelWidth);
  return `${safeLabel} = ${amountText.padStart(amountWidth)}`;
}

export function formatAlignedStatementBody(periodData: StatementData, language: StatementLanguage = "en"): string {
  const labelWidth = language === "te" ? 26 : 22;
  const amountWidth = 12;
  const divider = `${" ".repeat(labelWidth + 3)}${"-".repeat(9)}`;
  const lines: string[] = [];
  const line = (label: string, amountText: string) =>
    formatAlignedStatementLine(label, amountText, { labelWidth, amountWidth });
  const hasRows =
    periodData.investments.length + periodData.collections.length + periodData.payments.length + periodData.expenses.length > 0;

  lines.push(line("BF", formatIndianNumber(periodData.bf)));

  if (!hasRows) {
    lines.push(language === "te" ? "ఈ కాలంలో లావాదేవీలు లేవు" : "No transactions in this period");
    lines.push(divider);
    lines.push(line(translateStatementLabel("Total", language), formatIndianNumber(periodData.total)));
    return lines.join("\n");
  }

  periodData.investments.forEach((item) => {
    lines.push(line(translateStatementLabel(item.name, language), formatAmountWithSign(item.amount, item.type)));
  });
  if (periodData.investments.length > 0) {
    lines.push(divider);
    lines.push(line("", formatIndianNumber(periodData.subtotal1)));
  }

  periodData.collections.forEach((item) => {
    lines.push(line(translateStatementLabel(item.name, language), formatAmountWithSign(item.amount, item.type)));
  });
  periodData.payments.forEach((item) => {
    lines.push(line(translateStatementLabel(item.name, language), formatAmountWithSign(item.amount, item.type)));
  });
  if (periodData.collections.length > 0 || periodData.payments.length > 0) {
    lines.push(divider);
    lines.push(line("", formatIndianNumber(periodData.subtotal2)));
  }

  periodData.expenses.forEach((item) => {
    lines.push(line(translateStatementLabel(item.name, language), formatAmountWithSign(item.amount, item.type)));
  });
  if (periodData.expenses.length > 0) {
    lines.push(divider);
  }
  lines.push(line(translateStatementLabel("Total", language), formatIndianNumber(periodData.total)));

  return lines.join("\n");
}

export function buildStatementData(params: {
  startDate: string;
  endDate: string;
  village: string;
  email?: string;
  bf: number;
  transactions: Array<{ type: "INVESTMENT" | "COLLECTION" | "LOAN" | "EXPENSE"; desc: string; amount: number }>;
  totals: { sumInvs: number; sumColls: number; sumLoans: number; netTotal: number };
}): StatementData {
  const investmentMap = new Map<string, StatementItem>();
  params.transactions
    .filter((item) => item.type === "INVESTMENT")
    .forEach((item) => {
      const name = stripExpenseSuffix(item.desc || "Investment") || "Investment";
      const key = name.toLocaleLowerCase("en-IN");
      const existing = investmentMap.get(key);
      investmentMap.set(key, {
        name: existing?.name ?? name,
        amount: (existing?.amount ?? 0) + (Number(item.amount) || 0),
        type: "investment",
      });
    });
  const expenseMap = new Map<string, StatementItem>();
  params.transactions
    .filter((item) => item.type === "EXPENSE")
    .forEach((item) => {
      const name = stripExpenseSuffix(item.desc || "Expense") || "Expense";
      const key = name.toLocaleLowerCase("en-IN");
      const existing = expenseMap.get(key);
      expenseMap.set(key, {
        name: existing?.name ?? name,
        amount: (existing?.amount ?? 0) + (Number(item.amount) || 0),
        type: "expense",
      });
    });

  return {
    startDate: params.startDate,
    endDate: params.endDate,
    village: params.village || "All Villages",
    email: params.email,
    bf: params.bf,
    investments: Array.from(investmentMap.values()).sort((a, b) => b.amount - a.amount),
    collections: params.totals.sumColls > 0 ? [{ name: "Collections", amount: params.totals.sumColls, type: "collection" }] : [],
    payments: params.totals.sumLoans > 0 ? [{ name: "Payments", amount: params.totals.sumLoans, type: "payment" }] : [],
    expenses: Array.from(expenseMap.values()).sort((a, b) => b.amount - a.amount),
    subtotal1: params.bf + params.totals.sumInvs,
    subtotal2: params.bf + params.totals.sumInvs + params.totals.sumColls - params.totals.sumLoans,
    total: params.totals.netTotal,
  };
}

export function formatStatementForWhatsApp(periodData: StatementData, language: StatementLanguage = "en"): string {
  const lines: string[] = [];
  const rule = "─────────────────────";
  const hasRows =
    periodData.investments.length + periodData.collections.length + periodData.payments.length + periodData.expenses.length > 0;

  lines.push("*Karthikeya Finance*");
  lines.push("*ACCOUNT STATEMENT*");
  lines.push("");
  lines.push(`Period: ${periodData.startDate} - ${periodData.endDate}`);
  lines.push(`Village: ${periodData.village || "All Villages"}`);
  if (periodData.email) lines.push(`Email: ${periodData.email}`);
  lines.push(rule);
  lines.push(`BF = ${formatIndianNumber(periodData.bf)}`);

  if (!hasRows) {
    lines.push(language === "te" ? "ఈ కాలంలో లావాదేవీలు లేవు" : "No transactions in this period");
  } else {
    periodData.investments.forEach((item) => lines.push(formatStatementLine(item.name, item.amount, item.type, language)));
    if (periodData.investments.length > 0) {
      lines.push(`   = ${formatIndianNumber(periodData.subtotal1)}`);
      lines.push("");
    }
    periodData.collections.forEach((item) => lines.push(formatStatementLine(item.name, item.amount, item.type, language)));
    periodData.payments.forEach((item) => lines.push(formatStatementLine(item.name, item.amount, item.type, language)));
    if (periodData.collections.length > 0 || periodData.payments.length > 0) {
      lines.push(`   = ${formatIndianNumber(periodData.subtotal2)}`);
      lines.push("");
    }
    periodData.expenses.forEach((item) => lines.push(formatStatementLine(item.name, item.amount, item.type, language)));
  }

  lines.push(rule);
  lines.push(`*${translateStatementLabel("Total", language)} = ${formatIndianNumber(periodData.total)}*`);
  return lines.join("\n");
}

export function shareViaWhatsApp(text: string): boolean {
  if (typeof window === "undefined") return false;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  return true;
}

export function formatWhatsAppLink(rawNumber?: string | null): string | null {
  if (!rawNumber) return null;
  let digits = rawNumber.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.startsWith("91") && digits.length === 12) {
    // Already normalized for India.
  } else if (digits.length < 12) {
    return null;
  }
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}
