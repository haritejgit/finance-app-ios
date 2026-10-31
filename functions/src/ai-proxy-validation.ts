export class AIRequestValidationError extends Error {}

export function takeAIRequestSlot(
  existing: { windowStart?: unknown; count?: unknown } | undefined,
  now: number,
  limit = 20,
  windowMs = 60_000
): { windowStart: number; count: number } | null {
  const start = typeof existing?.windowStart === "number" ? existing.windowStart : 0;
  const count = typeof existing?.count === "number" ? existing.count : 0;
  if (!Number.isFinite(start) || !Number.isFinite(count) || now - start >= windowMs || start > now) {
    return { windowStart: now, count: 1 };
  }
  if (count >= limit) return null;
  return { windowStart: start, count: count + 1 };
}

export function requireUserId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new AIRequestValidationError("authentication");
  return value;
}

export function validateBoundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new AIRequestValidationError("text");
  }
  return value.trim();
}

export function validateChatMessages(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new AIRequestValidationError("messages");
  }
  return value.map((message) => {
    if (!message || !["user", "assistant"].includes(message.role)) throw new AIRequestValidationError("role");
    return { role: message.role, content: validateBoundedText(message.content, 4000) };
  });
}

function finiteFields(value: unknown, allowed: string[]): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(allowed.flatMap((key) =>
    typeof record[key] === "number" && Number.isFinite(record[key]) ? [[key, record[key] as number]] : []
  ));
}

export function sanitizeAIContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const context = value as Record<string, unknown>;
  const totals = finiteFields(context.totals, [
    "totalCollection", "totalDistributed", "pendingAmount", "monthlyRevenue", "customerCount", "activeLoanCount",
    "distributedThisMonth", "distributedToday", "collectionToday", "dueMarksThisMonth", "totalInvestments",
    "totalExpenses", "monthlyInvestments", "monthlyExpenses", "previousMonthlyExpenses", "netCashPosition",
    "balancingFund", "cashWalletBalance", "phonePeWalletBalance", "totalWalletFunds", "repaidThisMonth",
    "activeLentOut", "outstandingDues",
  ]);
  const recentTransactions = Array.isArray(context.recentTransactions)
    ? context.recentTransactions.slice(0, 5).map((item) => ({
      ...finiteFields(item, ["amountPaid", "paymentDate"]),
      ...stringFields(item, ["paymentMode", "paymentType"]),
    }))
    : [];
  const dueAlerts = Array.isArray(context.dueAlerts)
    ? context.dueAlerts.slice(0, 5).map((item) => finiteFields(item, [
      "balanceAmount", "weeklyAmount", "dueAmount", "dueCount", "lastDueDate",
    ]))
    : [];
  return { totals, recentTransactions, dueAlerts };
}

function stringFields(value: unknown, allowed: string[]): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(allowed.flatMap((key) =>
    typeof record[key] === "string" ? [[key, record[key].slice(0, 24)]] : []
  ));
}
