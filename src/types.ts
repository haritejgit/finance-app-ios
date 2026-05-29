export type Shift = "Morning" | "Evening";
export type LoanStatus = "ACTIVE" | "CLOSED" | "RENEWED";
export type PaymentType = "REGULAR" | "DUE" | "RENEWAL_CLOSURE";
export type PaymentMode = "CASH" | "PHONE";

export type Village = {
  id: string;
  name: string;
  dayOfWeek: string;
  shift: Shift;
  userId: string;
};

export type Customer = {
  id: string;
  numericalId: number;
  name: string;
  phone: string;
  aadhar: string;
  locationDesc: string;
  latitude?: number;
  longitude?: number;
  aadharSubmitted?: boolean;
  passportPhotoSubmitted?: boolean;
  coName?: string;
  coId?: number;
  villageId: string;
  userId: string;
  isActive: boolean;
  createdAt: number;
};

export type Loan = {
  id: string;
  customerId: string;
  principalAmount: number;
  interestAmount: number;
  totalPayable: number;
  balanceAmount: number;
  coId?: number;
  villageId: string;
  userId: string;
  isActive: boolean;
  createdAt: number;
};

export type Loan = {
  id: string;
  customerId: string;
  principalAmount: number;
  interestAmount: number;
  totalPayable: number;
  balanceAmount: number;
  userId: string;
  startDate: number;
  status: LoanStatus;
};

export type Payment = {
  id: string;
  loanId: string;
  customerId?: string;
  amountPaid: number;
  paymentDate: number;
  weekNumber: number;
  paymentType: PaymentType;
  paymentMode: PaymentMode;
  notes?: string;
  userId: string;
};

export type AccountNote = {
  id: string;
  customerId: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
};

export type BlockedAadhaar = {
  id: string;
  aadhaarNumber?: string;
  aadhaar: string;
  blockedAt?: unknown;
  reason: string;
  blocked_at?: unknown;
  blockedBy?: string;
  blocked_by: string;
};

export type CustomerRiskInsight = {
  customerId: string;
  customerName: string;
  riskScore: number;
  missedPayments: number;
  daysOverdue: number;
  loanAmount: number;
};

export type InsightData = {
  activeLoans: number;
  distributedThisMonth: number;
  recoveredThisMonth: number;
  expectedThisWeek: number;
  actualThisWeek: number;
  dailyCollectionStreak: boolean[];
  customerRisks: CustomerRiskInsight[];
};

