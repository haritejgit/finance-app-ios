type NestedAccount = {
  nestedUid: string;
  label?: string;
  nestedEmail?: string;
};

type NestedActivity = {
  nestedUid: string;
  nestedEmail?: string;
  amount?: number;
  [key: string]: unknown;
};

export type GroupedNestedActivity = {
  label: string;
  email: string;
  payments: NestedActivity[];
};

/** Group activity in one pass, with account lookups indexed by nested user ID. */
export function groupNestedActivity(
  activity: NestedActivity[],
  accounts: NestedAccount[]
): GroupedNestedActivity[] {
  const accountsByUid = new Map<string, NestedAccount>();
  for (const account of accounts) {
    if (!accountsByUid.has(account.nestedUid)) accountsByUid.set(account.nestedUid, account);
  }

  const grouped = new Map<string, GroupedNestedActivity>();
  for (const item of activity) {
    const account = accountsByUid.get(item.nestedUid);
    let group = grouped.get(item.nestedUid);
    if (!group) {
      group = {
        label: account?.label || item.nestedEmail || account?.nestedEmail || "Nested Account",
        email: account?.nestedEmail || "",
        payments: [],
      };
      grouped.set(item.nestedUid, group);
    }
    group.payments.push(item);
  }
  return Array.from(grouped.values());
}
