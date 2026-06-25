import { Expense, Investment, Loan, Payment, PaymentMode, UserProfile } from "./types";
import { getLoanDistributedAmount, isRealCollectionPayment, money, toMillis } from "./business-logic";

type WalletBreakdown = {
  opening: number;
  disbursed: number;
  collected: number;
  expenses: number;
  investments: number;
  current: number;
};

export type WalletBalances = {
  openingDate: number;
  cash: WalletBreakdown;
  phonePe: WalletBreakdown;
  totalAvailable: number;
};

function modeOrCash(value?: PaymentMode | string | null): PaymentMode {
  return value === "PHONE" ? "PHONE" : "CASH";
}

function inRange(value: unknown, openingDate: number): boolean {
  return toMillis(value) >= openingDate;
}

function buildBreakdown(opening: number, disbursed: number, collected: number, expenses: number, investments: number): WalletBreakdown {
  return {
    opening,
    disbursed,
    collected,
    expenses,
    investments,
    // Investments are capital injections INTO the wallet (money received), so they ADD to balance.
    // Formula: opening + collected + investments - disbursed - expenses
    current: opening + collected + investments - disbursed - expenses,
  };
}

export function calculateWalletBalances(
  profile: Pick<UserProfile, "cashOpeningBalance" | "phonePeOpeningBalance" | "walletOpeningDate">,
  loans: (Loan & Record<string, any>)[],
  payments: (Payment & Record<string, any>)[],
  expenses: Expense[],
  investments: Investment[]
): WalletBalances {
  // PRIVATE — never export
  const openingDate = toMillis(profile.walletOpeningDate) || 0;
  const cashOpening = money(profile.cashOpeningBalance);
  const phoneOpening = money(profile.phonePeOpeningBalance);

  const walletLoans = loans.filter((loan) => inRange(loan.startDate ?? loan.start_date, openingDate));
  const walletPayments = payments.filter((payment) => inRange(payment.paymentDate ?? payment.payment_date, openingDate));
  const walletExpenses = expenses.filter((expense) => inRange(expense.date, openingDate));
  const walletInvestments = investments.filter((investment) => inRange(investment.date, openingDate));

  const sumLoans = (mode: PaymentMode) =>
    walletLoans
      .filter((loan) => modeOrCash(loan.disbursement_mode ?? loan.disbursementMode) === mode)
      .reduce((sum, loan) => sum + getLoanDistributedAmount(loan), 0);

  const sumPayments = (mode: PaymentMode) =>
    walletPayments
      .filter(isRealCollectionPayment)
      .filter((payment) => modeOrCash(payment.type === "PHONE" ? "PHONE" : payment.paymentMode) === mode)
      .reduce((sum, payment) => sum + money(payment.amountPaid ?? payment.amount_paid), 0);

  const sumExpenses = (mode: PaymentMode) =>
    walletExpenses
      .filter((expense) => modeOrCash(expense.payment_mode) === mode)
      .reduce((sum, expense) => sum + money(expense.amount), 0);

  const sumInvestments = (mode: PaymentMode) =>
    walletInvestments
      .filter((investment) => modeOrCash(investment.payment_mode) === mode)
      .reduce((sum, investment) => sum + money(investment.amount), 0);

  const cash = buildBreakdown(cashOpening, sumLoans("CASH"), sumPayments("CASH"), sumExpenses("CASH"), sumInvestments("CASH"));
  const phonePe = buildBreakdown(phoneOpening, sumLoans("PHONE"), sumPayments("PHONE"), sumExpenses("PHONE"), sumInvestments("PHONE"));

  return {
    openingDate,
    cash,
    phonePe,
    totalAvailable: cash.current + phonePe.current,
  };
}
