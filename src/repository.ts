import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  startAfter,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, initializeAuth, inMemoryPersistence, signOut as secondarySignOut } from "firebase/auth";
import { firebaseConfig } from "./firebase-config";
import { BlockedAadhaar, Customer, Expense, Investment, Loan, Payment, PaymentMode, UserProfile, Village, VillageHistorySegment } from "./types";
import { endOfDay, getLoanDistributedAmount, getLoanPrincipalAmount, isRealCollectionPayment, loanWeekNumber, money, startOfDay, toMillis, weekStart } from "./business-logic";
import { filterCustomersWithVillage } from "./utils";

const coll = {
  villages: collection(db, "villages"),
  customers: collection(db, "customers"),
  loans: collection(db, "loans"),
  payments: collection(db, "payments"),
  blockedAadhaar: collection(db, "blockedAadhaar"),
  balancingFund: collection(db, "balancingFund"),
  investments: collection(db, "investments"),
  expenses: collection(db, "expenses"),
  users: collection(db, "users"),
  nestedExpenses: collection(db, "nestedExpenses"),

};

export type { Expense, Investment };

// Simple in-memory cache for better performance
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CUSTOMER_PAGE_CACHE_PREFIX = "customerPage:";
const PAGE_SIZE = 20;
let lastCustomerPageDoc: QueryDocumentSnapshot | null = null;

function getCacheKey(userId: string, type: string, id?: string) {
  return id ? `${userId}:${type}:${id}` : `${userId}:${type}`;
}

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

function clearCache() {
  cache.clear();
}

function invalidateCacheKeys(...keys: string[]) {
  keys.forEach((key) => cache.delete(key));
}

function invalidateUserDataCache(userId: string, villageId?: string) {
  for (const key of [...cache.keys()]) {
    if (!key.startsWith(`${userId}:`)) continue;
    if (!villageId || key.includes(`:customers:${villageId}`)) {
      cache.delete(key);
    }
  }
}

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function normalizeMode(value?: string | null): PaymentMode {
  return value === "PHONE" ? "PHONE" : "CASH";
}

function normalizeAadhar(aadhar?: string) {
  return (aadhar ?? "").replace(/\D/g, "").trim();
}

function cleanText(value?: string) {
  return (value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function cleanPhone(value?: string) {
  return (value ?? "").replace(/[^\d+]/g, "").trim();
}

function assertPositiveAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function assertNonNegativeAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
}

function sanitizeCustomerInput<T extends Partial<Customer>>(input: T): T {
  return {
    ...input,
    name: cleanText(input.name),
    phone: cleanPhone(input.phone),
    aadhar: normalizeAadhar(input.aadhar),
    locationDesc: cleanText(input.locationDesc),
    coName: cleanText(input.coName),
  } as T;
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getVillages(userId: string, useCache = true) {
  const cacheKey = getCacheKey(userId, "villages");
  if (useCache) {
    const cached = getCached<Village[]>(cacheKey);
    if (cached) return cached;
  }
  const q = query(coll.villages, where("userId", "==", userId));
  const snap = await getDocs(q);
  const villages = snap.docs.map((d) => d.data() as Village);
  setCache(cacheKey, villages);
  return villages;
}

export async function getVillageById(villageId: string) {
  const snap = await getDoc(doc(db, "villages", villageId));
  return snap.exists() ? (snap.data() as Village) : null;
}

export async function addVillage(userId: string, name: string, dayOfWeek: string, shift: string) {
  const villageName = cleanText(name);
  if (!villageName) throw new Error("Village name is required.");
  const now = startOfDay(Date.now());
  const village: Village = {
    id: id(),
    name: villageName,
    dayOfWeek,
    shift: shift as any,
    userId,
    routeHistory: [{ dayOfWeek, shift: shift as any, fromDate: now, toDate: null }],
  };
  await setDoc(doc(db, "villages", village.id), stripUndefined(village));
  clearCache();
}

export async function deleteVillage(villageId: string) {
  await deleteDoc(doc(db, "villages", villageId));
  clearCache();
}

export async function updateVillageDayShift(villageId: string, dayOfWeek: string, shift: string, effectiveDate = Date.now()) {
  const village = await getVillageById(villageId);
  const effectiveStart = startOfDay(toMillis(effectiveDate) || Date.now());
  const previousDayOfWeek = village?.dayOfWeek ?? dayOfWeek;
  const previousShift = village?.shift ?? (shift as any);
  const existingHistory = Array.isArray(village?.routeHistory) ? village.routeHistory : [];
  const routeHistory = existingHistory.length > 0
    ? existingHistory.map((segment, index) => {
        const isOpenSegment = segment.toDate === null || segment.toDate === undefined;
        if (!isOpenSegment || index !== existingHistory.length - 1) return segment;
        return { ...segment, toDate: effectiveStart };
      })
    : [{ dayOfWeek: previousDayOfWeek, shift: previousShift, fromDate: 0, toDate: effectiveStart }];

  const lastSegment = routeHistory[routeHistory.length - 1];
  const alreadySameOpenSegment =
    lastSegment &&
    lastSegment.dayOfWeek === dayOfWeek &&
    lastSegment.shift === shift &&
    lastSegment.toDate === null;

  if (!alreadySameOpenSegment) {
    routeHistory.push({ dayOfWeek, shift: shift as any, fromDate: effectiveStart, toDate: null });
  }

  await updateDoc(doc(db, "villages", villageId), {
    dayOfWeek,
    shift,
    routeHistory,
  });
  clearCache();
}

export async function updateVillageName(villageId: string, name: string) {
  const villageName = cleanText(name);
  if (!villageName) throw new Error("Village name is required.");
  await updateDoc(doc(db, "villages", villageId), {
    name: villageName,
  });
  clearCache();
}

export async function getCustomers(userId: string, villageId: string, useCache = true) {
  const cacheKey = getCacheKey(userId, "customers", villageId);
  if (useCache) {
    const cached = getCached<Customer[]>(cacheKey);
    if (cached) return cached;
  }
  // No longer normalize automatically on every fetch to preserve unique, non-shifting IDs.
  // await normalizeCustomerNumericalIdsForVillage(userId, villageId);
  const q = query(
    coll.customers,
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("isActive", "==", true)
  );
  const snap = await getDocs(q);
  const customers = snap.docs.map((d) => d.data() as Customer);
  setCache(cacheKey, customers);
  return customers;
}

export type CustomerPage = {
  customers: Customer[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
};

export async function getCustomersPage(
  userId: string,
  villageId: string,
  pageSize = 20,
  cursor?: QueryDocumentSnapshot | null
): Promise<CustomerPage> {
  const storageKey = `${CUSTOMER_PAGE_CACHE_PREFIX}${userId}:${villageId}:first`;
  const constraints = [
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("isActive", "==", true),
    orderBy("numericalId", "asc"),
  ];
  const pageQuery = cursor
    ? query(coll.customers, ...constraints, startAfter(cursor), limit(pageSize + 1))
    : query(coll.customers, ...constraints, limit(pageSize + 1));
  try {
    const snap = await getDocs(pageQuery);
    const docs = snap.docs.slice(0, pageSize);
    const customers = docs.map((d) => d.data() as Customer);
    if (!cursor) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(customers)).catch(() => undefined);
    }
    return {
      customers,
      cursor: docs[docs.length - 1] ?? null,
      hasMore: snap.docs.length > pageSize,
    };
  } catch (error) {
    if (!cursor) {
      const cached = await AsyncStorage.getItem(storageKey).catch(() => null);
      if (cached) {
        return { customers: JSON.parse(cached) as Customer[], cursor: null, hasMore: false };
      }
    }
    throw error;
  }
}

export async function fetchCustomersPage(villageId: string, reset = false) {
  if (reset) lastCustomerPageDoc = null;

  const baseConstraints = [
    where("villageId", "==", villageId),
    where("isActive", "==", true),
    orderBy("numericalId", "asc"),
  ];

  const pageQuery = lastCustomerPageDoc
    ? query(coll.customers, ...baseConstraints, startAfter(lastCustomerPageDoc), limit(PAGE_SIZE))
    : query(coll.customers, ...baseConstraints, limit(PAGE_SIZE));

  const snap = await getDocs(pageQuery);
  lastCustomerPageDoc = snap.docs[snap.docs.length - 1] ?? null;
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) }));
}

export type CustomerSearchResult = Customer & {
  villageName?: string;
  villageDayOfWeek?: string;
  villageShift?: string;
};

export async function getAllActiveCustomersWithVillages(userId: string): Promise<CustomerSearchResult[]> {
  const [customersSnap, villagesSnap] = await Promise.all([
    getDocs(query(coll.customers, where("userId", "==", userId), limit(1500))),
    getDocs(query(coll.villages, where("userId", "==", userId), limit(500))),
  ]);

  const villagesById = new Map(
    villagesSnap.docs.map((d) => {
      const village = d.data() as Village;
      return [village.id, village];
    })
  );

  return customersSnap.docs
    .map((d) => d.data() as Customer)
    // NOTE: UI-only filter. Customer documents in Firestore are NOT modified.
    .filter((customer) => filterCustomersWithVillage([customer]).length > 0)
    .filter((customer) => customer.isActive !== false)
    .map((customer) => {
      const village = villagesById.get(customer.villageId);
      return {
        ...customer,
        villageName: village?.name,
        villageDayOfWeek: village?.dayOfWeek,
        villageShift: village?.shift,
      };
    })
    .sort((a, b) => a.numericalId - b.numericalId);
}

export async function getNextNumericalId(userId: string, villageId: string) {
  const cacheKey = getCacheKey(userId, "customers", villageId);
  const cached = getCached<Customer[]>(cacheKey);
  const assignedIds = new Set<number>();

  const collectId = (customer: Customer) => {
    if ((customer.isActive !== false || customer.isBlocked === true) && Number.isInteger(customer.numericalId) && customer.numericalId > 0) {
      assignedIds.add(customer.numericalId);
    }
  };

  if (cached) {
    cached.forEach(collectId);
  } else {
    const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId), where("villageId", "==", villageId)));
    customersSnap.docs.forEach((d) => collectId(d.data() as Customer));
  }

  let maxId = 0;
  assignedIds.forEach((id) => {
    if (id > maxId) maxId = id;
  });
  return maxId + 1;
}

export async function isNumericalIdTaken(userId: string, villageId: string, numericalId: number): Promise<boolean> {
  const q = query(
    coll.customers,
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("numericalId", "==", numericalId)
  );
  const snap = await getDocs(q);
  return snap.docs.some((doc) => {
    const data = doc.data() as Customer;
    return data.isActive !== false || data.isBlocked === true;
  });
}

async function normalizeCustomerGroup(customers: { ref: DocumentReference; customer: Customer }[]) {
  const updates: { ref: DocumentReference; numericalId: number }[] = [];
  customers
    .sort((a, b) => {
      const idDelta = a.customer.numericalId - b.customer.numericalId;
      if (idDelta !== 0) return idDelta;
      const createdDelta = a.customer.createdAt - b.customer.createdAt;
      if (createdDelta !== 0) return createdDelta;
      return a.customer.name.localeCompare(b.customer.name);
    })
    .forEach(({ ref, customer }, index) => {
      const nextNumericalId = index + 1;
      if (customer.numericalId !== nextNumericalId) {
        updates.push({ ref, numericalId: nextNumericalId });
      }
    });

  for (let i = 0; i < updates.length; i += 450) {
    const batch = writeBatch(db);
    updates.slice(i, i + 450).forEach(({ ref, numericalId }) => {
      batch.update(ref, { numericalId });
    });
    await batch.commit();
  }

  if (updates.length > 0) {
    clearCache();
  }

  return updates.length;
}

export async function normalizeCustomerNumericalIdsForVillage(userId: string, villageId: string) {
  const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId), where("villageId", "==", villageId)));
  return normalizeCustomerGroup(
    customersSnap.docs
      .map((customerDoc) => ({ ref: customerDoc.ref, customer: customerDoc.data() as Customer }))
      .filter(({ customer }) => customer.isActive !== false)
  );
}

export async function normalizeCustomerNumericalIdsForAllShifts(userId: string) {
  const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId)));

  const customersByVillage = new Map<string, { ref: DocumentReference; customer: Customer }[]>();
  customersSnap.docs.forEach((customerDoc) => {
    const customer = customerDoc.data() as Customer;
    if (customer.isActive === false) return;

    const villageCustomers = customersByVillage.get(customer.villageId) ?? [];
    villageCustomers.push({ ref: customerDoc.ref, customer });
    customersByVillage.set(customer.villageId, villageCustomers);
  });

  let updatedCount = 0;
  for (const villageCustomers of customersByVillage.values()) {
    updatedCount += await normalizeCustomerGroup(villageCustomers);
  }

  return updatedCount;
}

async function getEligibleCustomerIds(userId: string) {
  const [customersSnap, villagesSnap] = await Promise.all([
    getDocs(query(coll.customers, where("userId", "==", userId), limit(1500))),
    getDocs(query(coll.villages, where("userId", "==", userId), limit(500))),
  ]);
  const villageIds = new Set(villagesSnap.docs.map((d) => (d.data() as Village).id));
  return new Set(
    filterCustomersWithVillage(customersSnap.docs.map((d) => d.data() as Customer))
      .filter((customer) => customer.isActive !== false && villageIds.has(customer.villageId))
      .map((customer) => customer.id)
  );
}

export async function addCustomerWithLoan(
  userId: string,
  villageId: string,
  dayOfWeek: string,
  shift: string,
  input: Omit<Customer, "id" | "userId" | "villageId" | "isActive" | "createdAt"> & { numericalId?: number },
  principalAmount: number,
  startDate: number,
  disbursementMode: PaymentMode = "CASH",
  villageName?: string
) {
  assertPositiveAmount(principalAmount, "Loan amount");
  const sanitizedInput = sanitizeCustomerInput(input);
  if (!sanitizedInput.name) throw new Error("Customer name is required.");
  if (!sanitizedInput.phone) throw new Error("Customer phone is required.");
  const numericalId = sanitizedInput.numericalId && sanitizedInput.numericalId > 0
    ? sanitizedInput.numericalId
    : await getNextNumericalId(userId, villageId);
  const cycleStartDay = new Date(toMillis(startDate || Date.now())).getDay();
  const startWeekStr = getISOWeekString(startDate || Date.now());
  const resolvedVillageName = villageName ?? (await getVillageById(villageId))?.name ?? "";
  const customer: Customer = {
    id: id(),
    numericalId,
    villageId,
    userId,
    isActive: true,
    createdAt: Date.now(),
    cycleStartDay,
    villageHistory: [
      {
        villageId,
        villageName: resolvedVillageName,
        fromWeek: startWeekStr,
        toWeek: null,
        numericalId,
      }
    ],
    ...sanitizedInput,
  };
  const interestAmount = principalAmount * 0.2;
  const totalPayable = principalAmount + interestAmount;
  const mode = normalizeMode(disbursementMode);
  const loan: Loan = {
    id: id(),
    customerId: customer.id,
    principalAmount,
    interestAmount,
    totalPayable,
    balanceAmount: totalPayable,
    userId,
    startDate,
    status: "ACTIVE",
    disbursement_mode: mode,
    disbursementMode: mode,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "customers", customer.id), stripUndefined(customer));
  batch.set(doc(db, "loans", loan.id), stripUndefined(loan));
  await batch.commit();
  invalidateUserDataCache(userId, villageId);
  return { customer, loan };
}

function getISOWeekStartString(timestamp: number, cycleStartDay: number): string {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  const currentDay = d.getDay(); // 0 (Sun) - 6 (Sat)
  let diff = currentDay - cycleStartDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
export function getISOWeekString(dateMs: number): string {
  const date = new Date(toMillis(dateMs));
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 24 * 60 * 60 * 1000));
  
  const yyyy = date.getFullYear();
  const ww = String(weekNum).padStart(2, '0');
  return `${yyyy}-${ww}`;
}

export async function moveCustomerToVillage(userId: string, customerId: string, targetVillageId: string) {
  const customer = await getCustomerById(customerId);
  if (!customer) return;

  const oldVillageId = customer.villageId;
  const oldNumericalId = customer.numericalId;

  const newNumericalId = await getNextNumericalId(userId, targetVillageId);

  const cycleStartDay = typeof (customer as any).cycleStartDay === "number"
    ? (customer as any).cycleStartDay
    : new Date(customer.createdAt || Date.now()).getDay();

  const movedOnWeek = getISOWeekStartString(Date.now(), cycleStartDay);
  const moveISOWeek = getISOWeekString(Date.now());

  const oldVillage = await getVillageById(oldVillageId);
  const targetVillage = await getVillageById(targetVillageId);
  const oldVillageName = oldVillage ? oldVillage.name : "";
  const targetVillageName = targetVillage ? targetVillage.name : "";

  let history: VillageHistorySegment[] = customer.villageHistory || [];
  if (history.length === 0) {
    const joinDate = customer.createdAt || Date.now();
    const joinWeekStr = getISOWeekString(joinDate);
    history = [
      {
        villageId: oldVillageId,
        villageName: oldVillageName,
        fromWeek: joinWeekStr,
        toWeek: null,
        numericalId: oldNumericalId,
      }
    ];
  }

  const updatedHistory = history.map((h) => {
    if (h.villageId === oldVillageId && h.toWeek === null) {
      return { ...h, toWeek: moveISOWeek };
    }
    return h;
  });

  updatedHistory.push({
    villageId: targetVillageId,
    villageName: targetVillageName,
    fromWeek: moveISOWeek,
    toWeek: null,
    numericalId: newNumericalId,
  });

  const batch = writeBatch(db);

  // Update moving customer's village and ID
  batch.update(doc(db, "customers", customerId), {
    villageId: targetVillageId,
    numericalId: newNumericalId,
    movedAt: Date.now(),
    previousVillageId: oldVillageId,
    previousNumericalId: oldNumericalId,
    movedFromVillage: oldVillageId,
    movedToVillage: targetVillageId,
    movedOnWeek: movedOnWeek,
    movedFromNumericalId: oldNumericalId,
    villageHistory: updatedHistory,
  });

  // Create a blocked/tombstone document in the old village to reserve the ID
  const blockedDocId = `blocked_${oldVillageId}_${oldNumericalId}`;
  batch.set(doc(db, "customers", blockedDocId), {
    id: blockedDocId,
    userId,
    villageId: oldVillageId,
    numericalId: oldNumericalId,
    isActive: false,
    isBlocked: true,
    name: "[Blocked ID]",
    createdAt: Date.now(),
    movedAt: Date.now(),
    previousVillageId: oldVillageId,
    previousNumericalId: oldNumericalId,
    movedFromVillage: oldVillageId,
    movedToVillage: targetVillageId,
    movedOnWeek: movedOnWeek,
    movedFromNumericalId: oldNumericalId,
    villageHistory: updatedHistory,
  });

  await batch.commit();
  clearCache();
}

export async function getCustomerById(customerId: string) {
  const snap = await getDoc(doc(db, "customers", customerId));
  return snap.exists() ? (snap.data() as Customer) : null;
}

export async function getActiveLoan(userId: string, customerId: string, forceRefresh = false) {
  const q = query(
    coll.loans,
    where("userId", "==", userId),
    where("customerId", "==", customerId)
  );
  let snap;
  if (forceRefresh) {
    try {
      snap = await getDocsFromServer(q);
    } catch (e) {
      snap = await getDocs(q);
    }
  } else {
    snap = await getDocs(q);
  }
  const loans = snap.docs.map((d) => d.data() as Loan);
  if (loans.length === 0) return undefined;
  
  const activeLoans = loans.filter((l) => l.status === "ACTIVE");
  if (activeLoans.length > 1) {
    activeLoans.sort((a, b) => b.startDate - a.startDate);
    const latestActive = activeLoans[0];
    const batch = writeBatch(db);
    for (let i = 1; i < activeLoans.length; i++) {
      const oldLoan = activeLoans[i];
      batch.update(doc(db, "loans", oldLoan.id), {
        status: "RENEWED",
        balanceAmount: 0
      });
      oldLoan.status = "RENEWED";
      oldLoan.balanceAmount = 0;
    }
    await batch.commit();
    return latestActive;
  }
  
  const active = loans.find((l) => l.status === "ACTIVE");
  if (active) return active;
  
  const closed = loans.filter((l) => l.status === "CLOSED");
  if (closed.length > 0) {
    return closed.sort((a, b) => b.startDate - a.startDate)[0];
  }
  return loans[0];
}

export async function getActiveLoansByCustomerIds(userId: string, customerIds: string[], targetDate?: number) {
  if (customerIds.length === 0) return {} as Record<string, Loan>;

  const chunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += 30) {
    chunks.push(customerIds.slice(i, i + 30));
  }

  const loansByCustomer: Record<string, Loan> = {};

  await Promise.all(
    chunks.map(async (chunk) => {
      const q = query(
        coll.loans,
        where("userId", "==", userId),
        where("customerId", "in", chunk)
      );
      const snap = await getDocs(q);
      
      const customerLoans: Record<string, Loan[]> = {};
      snap.docs.forEach((d) => {
        const loan = d.data() as Loan;
        if (!customerLoans[loan.customerId]) {
          customerLoans[loan.customerId] = [];
        }
        customerLoans[loan.customerId].push(loan);
      });

      const batch = writeBatch(db);
      let needsCommit = false;

      Object.entries(customerLoans).forEach(([custId, loans]) => {
        const activeLoans = loans.filter((l) => l.status === "ACTIVE");
        if (activeLoans.length > 1) {
          activeLoans.sort((a, b) => b.startDate - a.startDate);
          const latestActive = activeLoans[0];
          for (let i = 1; i < activeLoans.length; i++) {
            const oldLoan = activeLoans[i];
            batch.update(doc(db, "loans", oldLoan.id), {
              status: "RENEWED",
              balanceAmount: 0
            });
            oldLoan.status = "RENEWED";
            oldLoan.balanceAmount = 0;
            needsCommit = true;
          }
        }

        if (targetDate !== undefined) {
          const sorted = [...loans].sort((a, b) => b.startDate - a.startDate);
          const loanOnDate = sorted.find((l) => l.startDate <= targetDate);
          if (loanOnDate) {
            loansByCustomer[custId] = loanOnDate;
          } else {
            const oldest = sorted[sorted.length - 1];
            if (oldest) loansByCustomer[custId] = oldest;
          }
        } else {
          const active = loans.find((l) => l.status === "ACTIVE");
          if (active) {
            loansByCustomer[custId] = active;
          } else {
            const closed = loans.filter((l) => l.status === "CLOSED");
            if (closed.length > 0) {
              loansByCustomer[custId] = closed.sort((a, b) => b.startDate - a.startDate)[0];
            } else if (loans.length > 0) {
              loansByCustomer[custId] = loans[0];
            }
          }
        }
      });

      if (needsCommit) {
        await batch.commit();
      }
    })
  );

  return loansByCustomer;
}

export async function updateLoan(loan: Loan, newPrincipalAmount: number, newStartDate: number, newDisbursementMode?: PaymentMode) {
  assertPositiveAmount(newPrincipalAmount, "Loan amount");
  // Recalculate interest and totals based on new principal
  const interestAmount = newPrincipalAmount * 0.2;
  const totalPayable = newPrincipalAmount + interestAmount;
  
  // Calculate how much has been paid so far
  const paidSoFar = loan.totalPayable - loan.balanceAmount;
  const newBalanceAmount = totalPayable - paidSoFar;
  
  const finalMode = newDisbursementMode ? normalizeMode(newDisbursementMode) : normalizeMode(loan.disbursement_mode ?? loan.disbursementMode ?? "CASH");
  
  const updatedLoan: Loan = {
    ...loan,
    principalAmount: newPrincipalAmount,
    interestAmount: interestAmount,
    totalPayable: totalPayable,
    balanceAmount: newBalanceAmount,
    startDate: newStartDate,
    disbursement_mode: finalMode,
    disbursementMode: finalMode,
  };
  
  await setDoc(doc(db, "loans", loan.id), stripUndefined(updatedLoan));
  invalidateUserDataCache(loan.userId);
  return updatedLoan;
}

export async function getPaymentsForCustomer(userId: string, customerId: string, forceRefresh = false) {
  const fastQ = query(
    coll.payments,
    where("userId", "==", userId),
    where("customerId", "==", customerId),
    limit(500)
  );
  let fastSnap;
  if (forceRefresh) {
    try {
      fastSnap = await getDocsFromServer(fastQ);
    } catch (e) {
      fastSnap = await getDocs(fastQ);
    }
  } else {
    fastSnap = await getDocs(fastQ);
  }
  
  if (!fastSnap.empty) {
    return fastSnap.docs
      .map((d) => d.data() as Payment)
      .sort((a, b) => toMillis(b.paymentDate) - toMillis(a.paymentDate));
  }

  const loansQ = query(coll.loans, where("userId", "==", userId), where("customerId", "==", customerId));
  let loansSnap;
  if (forceRefresh) {
    try {
      loansSnap = await getDocsFromServer(loansQ);
    } catch (e) {
      loansSnap = await getDocs(loansQ);
    }
  } else {
    loansSnap = await getDocs(loansQ);
  }
  const loanIds = loansSnap.docs.map((d) => (d.data() as Loan).id);
  if (loanIds.length === 0) return [] as Payment[];

  const payments: Payment[] = [];
  for (let i = 0; i < loanIds.length; i += 30) {
    const chunk = loanIds.slice(i, i + 30);
    const legacyQ = query(coll.payments, where("userId", "==", userId), where("loanId", "in", chunk));
    let legacySnap;
    if (forceRefresh) {
      try {
        legacySnap = await getDocsFromServer(legacyQ);
      } catch (e) {
        legacySnap = await getDocs(legacyQ);
      }
    } else {
      legacySnap = await getDocs(legacyQ);
    }
    legacySnap.docs.forEach((d) => payments.push(d.data() as Payment));
  }
  return payments.sort((a, b) => toMillis(b.paymentDate) - toMillis(a.paymentDate));
}

export async function getPaymentStatusesForCustomersThisWeek(userId: string, customerIds: string[]) {
  if (customerIds.length === 0) return {} as Record<string, "paid" | "due" | "none">;

  const startMs = weekStart(Date.now());
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;

  const statuses = Object.fromEntries(
    customerIds.map((customerId) => [customerId, "none" as "paid" | "due" | "none"])
  );

  const chunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += 30) {
    chunks.push(customerIds.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const [loansSnap, customerPaymentsSnap] = await Promise.all([
        getDocs(query(coll.loans, where("userId", "==", userId), where("customerId", "in", chunk))),
        getDocs(query(coll.payments, where("userId", "==", userId), where("customerId", "in", chunk))),
      ]);

      const customerIdByLoanId = new Map<string, string>();
      loansSnap.docs.forEach((d) => {
        const loan = d.data() as Loan;
        customerIdByLoanId.set(loan.id, loan.customerId);
      });

      customerPaymentsSnap.docs.forEach((d) => {
        const payment = d.data() as Payment;
        const customerId = payment.customerId ?? customerIdByLoanId.get(payment.loanId);
        if (!customerId || !(customerId in statuses)) return;

        const paymentDate = toMillis(payment.paymentDate);
        if (paymentDate < startMs || paymentDate > endMs) return;

        if (payment.paymentType === "DUE") {
          if (statuses[customerId] !== "paid") {
            statuses[customerId] = "due";
          }
        } else if (
          payment.paymentType === "REGULAR" ||
          payment.paymentType === "RENEWAL_CLOSURE" ||
          (payment as any).paymentType === "CASH" ||
          (payment as any).paymentType === "PHONE" ||
          (payment as any).type === "CASH" ||
          (payment as any).type === "PHONE"
        ) {
          statuses[customerId] = "paid";
        }
      });
    })
  );

  return statuses;
}

export async function getLastRegularPaymentDatesForCustomers(userId: string, customerIds: string[]) {
  if (customerIds.length === 0) return {} as Record<string, { lastPaymentDate: number; paidLastWeek: boolean }>;

  const currentMonday = weekStart(Date.now());
  const prevWeekStart = currentMonday - 7 * 24 * 60 * 60 * 1000;
  const prevWeekEnd = currentMonday - 1;

  const latest: Record<string, { lastPaymentDate: number; paidLastWeek: boolean }> = {};
  customerIds.forEach((id) => {
    latest[id] = { lastPaymentDate: 0, paidLastWeek: false };
  });

  const chunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += 30) {
    chunks.push(customerIds.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const [loansSnap, customerPaymentsSnap] = await Promise.all([
        getDocs(query(coll.loans, where("userId", "==", userId), where("customerId", "in", chunk))),
        getDocs(query(coll.payments, where("userId", "==", userId), where("customerId", "in", chunk))),
      ]);

      const customerIdByLoanId = new Map<string, string>();
      loansSnap.docs.forEach((d) => {
        const loan = d.data() as Loan;
        customerIdByLoanId.set(loan.id, loan.customerId);
      });

      customerPaymentsSnap.docs
        .map((d) => d.data() as Payment)
        .filter(isRealCollectionPayment)
        .forEach((payment) => {
          const customerId = payment.customerId ?? customerIdByLoanId.get(payment.loanId);
          if (!customerId || !(customerId in latest)) return;

          const paymentDate = toMillis(payment.paymentDate);
          if (paymentDate > latest[customerId].lastPaymentDate) {
            latest[customerId].lastPaymentDate = paymentDate;
          }
          if (paymentDate >= prevWeekStart && paymentDate <= prevWeekEnd) {
            latest[customerId].paidLastWeek = true;
          }
        });
    })
  );

  return latest;
}

export async function addPayment(loan: Loan, amountPaid: number, paymentDate: number, mode: PaymentMode, nestedUid?: string) {
  assertPositiveAmount(amountPaid, "Payment amount");
  const paymentMode = normalizeMode(mode);
  const payment: Payment = {
    id: id(),
    loanId: loan.id,
    customerId: loan.customerId,
    amountPaid,
    paymentDate,
    weekNumber: loanWeekNumber(loan.startDate, paymentDate),
    paymentType: "REGULAR",
    paymentMode,
    type: paymentMode,
    userId: auth.currentUser?.uid || loan.userId,
    nestedUid: nestedUid || undefined,
  };
  await runTransaction(db, async (transaction) => {
    const loanRef = doc(db, "loans", loan.id);
    const loanSnap = await transaction.get(loanRef);
    const liveLoan = loanSnap.exists() ? (loanSnap.data() as Loan) : loan;
    
    transaction.set(doc(db, "payments", payment.id), stripUndefined(payment));

    if (liveLoan.status === "RENEWED") {
      const closureQuery = query(
        coll.payments,
        where("loanId", "==", loan.id),
        where("paymentType", "==", "RENEWAL_CLOSURE")
      );
      const closureSnap = await getDocs(closureQuery);
      if (!closureSnap.empty) {
        const closureDoc = closureSnap.docs[0];
        const closureData = closureDoc.data() as Payment;
        const newClosureAmount = Math.max(0, closureData.amountPaid - amountPaid);
        transaction.update(doc(db, "payments", closureDoc.id), {
          amountPaid: newClosureAmount
        });
      } else {
        const newBalance = Math.max(0, money(liveLoan.balanceAmount) - amountPaid);
        transaction.update(loanRef, {
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
        });
      }
    } else {
      const newBalance = Math.max(0, money(liveLoan.balanceAmount) - amountPaid);
      transaction.update(loanRef, {
        balanceAmount: newBalance,
        status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
      });
    }
  });
  invalidateUserDataCache(auth.currentUser?.uid || loan.userId);
}

export async function addPaymentsBatch(
  entries: { loan: Loan; amountPaid: number; paymentDate: number; mode: PaymentMode }[]
) {
  if (entries.length === 0) return 0;
  const batch = writeBatch(db);
  const userId = auth.currentUser?.uid || entries[0].loan.userId;
  
  for (const { loan, amountPaid, paymentDate, mode } of entries) {
    assertPositiveAmount(amountPaid, "Payment amount");
    const paymentMode = normalizeMode(mode);
    const payment: Payment = {
      id: id(),
      loanId: loan.id,
      customerId: loan.customerId,
      amountPaid,
      paymentDate,
      weekNumber: loanWeekNumber(loan.startDate, paymentDate),
      paymentType: "REGULAR",
      paymentMode,
      type: paymentMode,
      userId,
    };
    batch.set(doc(db, "payments", payment.id), stripUndefined(payment));

    if (loan.status === "RENEWED") {
      const closureQuery = query(
        coll.payments,
        where("loanId", "==", loan.id),
        where("paymentType", "==", "RENEWAL_CLOSURE")
      );
      const closureSnap = await getDocs(closureQuery);
      if (!closureSnap.empty) {
        const closureDoc = closureSnap.docs[0];
        const closureData = closureDoc.data() as Payment;
        const newClosureAmount = Math.max(0, closureData.amountPaid - amountPaid);
        batch.update(doc(db, "payments", closureDoc.id), {
          amountPaid: newClosureAmount
        });
      } else {
        const newBalance = Math.max(0, money(loan.balanceAmount) - amountPaid);
        batch.update(doc(db, "loans", loan.id), {
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
        });
      }
    } else {
      const newBalance = Math.max(0, money(loan.balanceAmount) - amountPaid);
      batch.update(doc(db, "loans", loan.id), {
        balanceAmount: newBalance,
        status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
      });
    }
  }
  
  await batch.commit();
  invalidateUserDataCache(userId);
  return entries.length;
}

export async function addBulkPaymentsAndDues(
  entries: { loan: Loan; amountPaid: number; isDue: boolean }[],
  paymentDate: number
) {
  if (entries.length === 0) return 0;
  const batch = writeBatch(db);
  const userId = auth.currentUser?.uid || entries[0].loan.userId;

  for (const { loan, amountPaid, isDue } of entries) {
    if (isDue) {
      const payment: Payment = {
        id: id(),
        loanId: loan.id,
        customerId: loan.customerId,
        amountPaid: 0,
        paymentDate,
        weekNumber: loanWeekNumber(loan.startDate, paymentDate),
        paymentType: "DUE",
        paymentMode: "CASH",
        type: "DUE",
        userId,
      };
      batch.set(doc(db, "payments", payment.id), stripUndefined(payment));
    } else {
      assertPositiveAmount(amountPaid, "Payment amount");
      const payment: Payment = {
        id: id(),
        loanId: loan.id,
        customerId: loan.customerId,
        amountPaid,
        paymentDate,
        weekNumber: loanWeekNumber(loan.startDate, paymentDate),
        paymentType: "REGULAR",
        paymentMode: "CASH",
        type: "CASH",
        userId,
      };
      batch.set(doc(db, "payments", payment.id), stripUndefined(payment));

      if (loan.status === "RENEWED") {
        const closureQuery = query(
          coll.payments,
          where("loanId", "==", loan.id),
          where("paymentType", "==", "RENEWAL_CLOSURE")
        );
        const closureSnap = await getDocs(closureQuery);
        if (!closureSnap.empty) {
          const closureDoc = closureSnap.docs[0];
          const closureData = closureDoc.data() as Payment;
          const newClosureAmount = Math.max(0, closureData.amountPaid - amountPaid);
          batch.update(doc(db, "payments", closureDoc.id), {
            amountPaid: newClosureAmount
          });
        } else {
          const newBalance = Math.max(0, money(loan.balanceAmount) - amountPaid);
          batch.update(doc(db, "loans", loan.id), {
            balanceAmount: newBalance,
            status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
          });
        }
      } else {
        const newBalance = Math.max(0, money(loan.balanceAmount) - amountPaid);
        batch.update(doc(db, "loans", loan.id), {
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
        });
      }
    }
  }

  await batch.commit();
  invalidateUserDataCache(userId);
  return entries.length;
}

export async function updatePayment(payment: Payment, newAmount: number, newDate: number, newMode: PaymentMode) {
  assertPositiveAmount(newAmount, "Payment amount");
  const oldAmount = payment.amountPaid;
  const updatedPayment: Payment = {
    ...payment,
    amountPaid: newAmount,
    paymentDate: newDate,
    paymentMode: normalizeMode(newMode),
    type: normalizeMode(newMode),
    weekNumber: payment.weekNumber,
  };

  await runTransaction(db, async (transaction) => {
    const paymentRef = doc(db, "payments", payment.id);
    const loanRef = doc(db, "loans", payment.loanId);
    const loanSnap = await transaction.get(loanRef);
    transaction.update(paymentRef, stripUndefined(updatedPayment));
    if (loanSnap.exists()) {
      const loan = loanSnap.data() as Loan;
      const balanceDiff = oldAmount - newAmount;
      if (loan.status === "RENEWED") {
        const closureQuery = query(
          coll.payments,
          where("loanId", "==", payment.loanId),
          where("paymentType", "==", "RENEWAL_CLOSURE")
        );
        const closureSnap = await getDocs(closureQuery);
        if (!closureSnap.empty) {
          const closureDoc = closureSnap.docs[0];
          const closureData = closureDoc.data() as Payment;
          const newClosureAmount = Math.max(0, closureData.amountPaid + balanceDiff);
          transaction.update(doc(db, "payments", closureDoc.id), {
            amountPaid: newClosureAmount
          });
        } else {
          const newBalance = Math.max(0, loan.balanceAmount + balanceDiff);
          transaction.update(loanRef, {
            balanceAmount: newBalance,
            status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
          });
        }
      } else {
        const newBalance = Math.max(0, loan.balanceAmount + balanceDiff);
        transaction.update(loanRef, {
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
        });
      }
    }
  });
  invalidateUserDataCache(payment.userId);
}

export async function deletePayment(payment: Payment) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "payments", payment.id));
  
  const amountPaid = money(payment.amountPaid);
  const isDue = payment.paymentType === "DUE" || payment.type === "DUE";
  
  if (amountPaid > 0 && !isDue) {
    const loanRef = doc(db, "loans", payment.loanId);
    const loanSnap = await getDoc(loanRef);
    if (loanSnap.exists()) {
      const loan = loanSnap.data() as Loan;
      if (loan.status === "RENEWED") {
        const closureQuery = query(
          coll.payments,
          where("loanId", "==", payment.loanId),
          where("paymentType", "==", "RENEWAL_CLOSURE")
        );
        const closureSnap = await getDocs(closureQuery);
        if (!closureSnap.empty) {
          const closureDoc = closureSnap.docs[0];
          const closureData = closureDoc.data() as Payment;
          const newClosureAmount = closureData.amountPaid + amountPaid;
          batch.update(doc(db, "payments", closureDoc.id), {
            amountPaid: newClosureAmount
          });
        } else {
          const newBalance = loan.balanceAmount + amountPaid;
          batch.update(loanRef, {
            balanceAmount: newBalance,
            status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
          });
        }
      } else {
        const newBalance = loan.balanceAmount + amountPaid;
        batch.update(loanRef, {
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
        });
      }
    }
  }
  await batch.commit();
  invalidateUserDataCache(payment.userId);
}

export async function deleteDuePayment(payment: Payment) {
  if (payment.paymentType !== "DUE" && payment.type !== "DUE") {
    throw new Error("Only DUE entries can be deleted here.");
  }
  await deleteDoc(doc(db, "payments", payment.id));
  invalidateUserDataCache(payment.userId);
}

export async function markDue(loan: Loan, paymentDate: number) {
  const payment: Payment = {
    id: id(),
    loanId: loan.id,
    customerId: loan.customerId,
    amountPaid: 0,
    paymentDate,
    weekNumber: loanWeekNumber(loan.startDate, paymentDate),
    paymentType: "DUE",
    paymentMode: "CASH",
    type: "DUE",
    userId: auth.currentUser?.uid || loan.userId,
  };
  await setDoc(doc(db, "payments", payment.id), stripUndefined(payment));
  invalidateUserDataCache(loan.userId);
}

export async function renewLoan(loan: Loan, newPrincipal: number, date: number, paymentMode: PaymentMode = "CASH") {
  assertPositiveAmount(newPrincipal, "Renewal amount");
  const userId = auth.currentUser?.uid || loan.userId;
  const closureMode = normalizeMode(paymentMode);
  const disbursementMode = closureMode;
  const batch = writeBatch(db);

  if (loan.balanceAmount > 0) {
    const closure: Payment = {
      id: id(),
      loanId: loan.id,
      customerId: loan.customerId,
      amountPaid: loan.balanceAmount,
      paymentDate: date,
      weekNumber: loanWeekNumber(loan.startDate, date),
      paymentType: "RENEWAL_CLOSURE",
      paymentMode: closureMode,
      type: closureMode,
      notes: "Loan renewed - old balance cleared",
      userId,
    };
    batch.set(doc(db, "payments", closure.id), stripUndefined(closure));
  }
  batch.update(doc(db, "loans", loan.id), { balanceAmount: 0, status: "RENEWED" });
  batch.update(doc(db, "customers", loan.customerId), { isActive: true });

  const interest = newPrincipal * 0.2;
  const totalPayable = newPrincipal + interest;
  const newLoan: Loan = {
    id: id(),
    customerId: loan.customerId,
    principalAmount: newPrincipal,
    interestAmount: interest,
    totalPayable,
    balanceAmount: totalPayable,
    userId,
    startDate: date,
    status: "ACTIVE",
    disbursement_mode: disbursementMode,
    disbursementMode,
  };
  batch.set(doc(db, "loans", newLoan.id), stripUndefined(newLoan));
  await batch.commit();
  invalidateUserDataCache(userId);
}

export function getPersonalCycleStartTs(dateMs: number, cycleStartDay: number): number {
  const d = new Date(toMillis(dateMs));
  d.setHours(0, 0, 0, 0);
  const currentDay = d.getDay(); // 0 (Sun) - 6 (Sat)
  let diff = currentDay - cycleStartDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function getOrDeriveCycleStartDay(customer: Customer, loanStartDate?: number): number {
  if (customer && typeof (customer as any).cycleStartDay === "number" && (customer as any).cycleStartDay >= 0 && (customer as any).cycleStartDay <= 6) {
    return (customer as any).cycleStartDay;
  }
  const baseDate = loanStartDate || customer?.createdAt || Date.now();
  return new Date(toMillis(baseDate)).getDay();
}

export function getPersonalCycleWeekIndex(paymentDateMs: number, loanStartDateMs: number, cycleStartDay: number): number {
  const pStart = getPersonalCycleStartTs(paymentDateMs, cycleStartDay);
  const lStart = getPersonalCycleStartTs(loanStartDateMs + 7 * 24 * 60 * 60 * 1000, cycleStartDay);
  const diffMs = pStart - lStart;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function formatPersonalCycleRange(startTs: number): string {
  const start = new Date(toMillis(startTs));
  const end = new Date(toMillis(startTs) + 6 * 24 * 60 * 60 * 1000);
  
  const daysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const startStr = `${daysShort[start.getDay()]} ${start.getDate()} ${monthsShort[start.getMonth()]}`;
  const endStr = `${daysShort[end.getDay()]} ${end.getDate()} ${monthsShort[end.getMonth()]}`;
  
  return `${startStr} – ${endStr}`;
}

let _lastAutoDueRun = 0;
const AUTO_DUE_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export async function checkAndAutoMarkDues(userId: string, activeLoans: Loan[]) {
  if (!activeLoans || activeLoans.length === 0) return;

  // Throttle: only run once per hour to conserve Firestore quota
  const now = Date.now();
  if (now - _lastAutoDueRun < AUTO_DUE_THROTTLE_MS) return;
  _lastAutoDueRun = now;

  const batch = writeBatch(db);
  let hasChanges = false;
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  // Group active loans by customer ID so we can fetch customers in batch
  const customerIds = Array.from(new Set(activeLoans.map(l => l.customerId)));
  if (customerIds.length === 0) return;

  // Fetch customers in chunks of 30 (Firestore limit for "in" query)
  const customersMap = new Map<string, Customer>();
  const chunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += 30) {
    chunks.push(customerIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snap = await getDocs(query(coll.customers, where("userId", "==", userId), where("__name__", "in", chunk)));
    snap.docs.forEach(d => {
      customersMap.set(d.id, d.data() as Customer);
    });
  }

  // Fetch all payments for all active loans
  const loanIds = activeLoans.map(l => l.id);
  const paymentsMap = new Map<string, Payment[]>();
  
  const loanChunks: string[][] = [];
  for (let i = 0; i < loanIds.length; i += 30) {
    loanChunks.push(loanIds.slice(i, i + 30));
  }

  for (const chunk of loanChunks) {
    const snap = await getDocs(query(coll.payments, where("userId", "==", userId), where("loanId", "in", chunk)));
    snap.docs.forEach(d => {
      const p = d.data() as Payment;
      if (!paymentsMap.has(p.loanId)) {
        paymentsMap.set(p.loanId, []);
      }
      paymentsMap.get(p.loanId)!.push(p);
    });
  }

  for (const loan of activeLoans) {
    const customer = customersMap.get(loan.customerId);
    if (!customer) continue;

    const loanStartDateMs = toMillis(loan.startDate);
    const cycleStartDay = getOrDeriveCycleStartDay(customer, loanStartDateMs);

    // Find all completed personal cycle weeks since loan start (first week is grace period)
    const currentCycleStartTs = getPersonalCycleStartTs(now, cycleStartDay);
    const loanCycleStartTs = getPersonalCycleStartTs(loanStartDateMs + oneWeekMs, cycleStartDay);

    const diffMs = currentCycleStartTs - loanCycleStartTs;
    const totalWeeksElapsed = Math.floor(diffMs / oneWeekMs);

    if (totalWeeksElapsed <= 0) {
      continue;
    }

    const loanPayments = paymentsMap.get(loan.id) || [];

    // Group payments by their personal cycle week start timestamp
    const paidCycleStarts = new Set<number>();
    const existingDueCycleStarts = new Set<number>();

    for (const p of loanPayments) {
      const pTs = toMillis(p.paymentDate);
      const pCycleStart = getPersonalCycleStartTs(pTs, cycleStartDay);
      const pType = p.paymentType || (p as any).type;
      
      if (pType === "DUE") {
        existingDueCycleStarts.add(pCycleStart);
      } else if (
        pType === "REGULAR" ||
        pType === "CASH" ||
        pType === "PHONE" ||
        p.paymentMode === "CASH" ||
        p.paymentMode === "PHONE"
      ) {
        paidCycleStarts.add(pCycleStart);
      }
    }

    // For each elapsed week, see if a regular payment exists. If not, make sure a DUE exists.
    for (let w = 0; w < totalWeeksElapsed; w++) {
      const weekStartTs = loanCycleStartTs + w * oneWeekMs;

      // If paid, skip
      if (paidCycleStarts.has(weekStartTs)) {
        continue;
      }

      // If not paid and no DUE entry exists, create one
      if (!existingDueCycleStarts.has(weekStartTs)) {
        const dueId = `due_${loan.id}_w${w + 1}`;
        const duePayment = {
          id: dueId,
          loanId: loan.id,
          customerId: loan.customerId,
          amountPaid: 0,
          paymentDate: weekStartTs, // Start of that cycle week
          weekNumber: w + 1,
          paymentType: "DUE",
          paymentMode: "CASH",
          type: "DUE",
          userId: loan.userId,
          isAutoDue: true, // Mark it as an auto-due
          createdAt: Date.now(),
        };

        batch.set(doc(db, "payments", dueId), stripUndefined(duePayment));
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    await batch.commit();
    clearCache();
  }
}


export async function runRetroactiveCleanup(userId: string) {
  if (typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("migration_done_v2")) {
    return;
  }

  try {
    const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId)));
    const activeCustomers = customersSnap.docs.map(d => d.data() as Customer).filter(c => c.isActive !== false);

    const batch = writeBatch(db);
    let updateCount = 0;

    for (const customer of activeCustomers) {
      let cycleStartDay = (customer as any).cycleStartDay;
      if (typeof cycleStartDay !== "number" || cycleStartDay < 0 || cycleStartDay > 6) {
        cycleStartDay = new Date(customer.createdAt || Date.now()).getDay();
        batch.update(doc(db, "customers", customer.id), { cycleStartDay });
        updateCount++;
      }

      const pSnap = await getDocs(query(coll.payments, where("customerId", "==", customer.id)));
      const payments = pSnap.docs.map(d => ({ data: d.data() as Payment, ref: d.ref }));

      const dues = payments.filter(p => p.data.paymentType === "DUE" || (p.data as any).type === "DUE");
      const regularPayments = payments.filter(p => p.data.paymentType === "REGULAR" || (p.data as any).type === "REGULAR" || p.data.paymentMode === "CASH" || p.data.paymentMode === "PHONE" || (p.data as any).type === "CASH" || (p.data as any).type === "PHONE");

      for (const reg of regularPayments) {
        const regTs = toMillis(reg.data.paymentDate);
        const targetCycleStart = getPersonalCycleStartTs(regTs, cycleStartDay);

        const coexistingDues = dues.filter(due => {
          const dueTs = toMillis(due.data.paymentDate);
          return getPersonalCycleStartTs(dueTs, cycleStartDay) === targetCycleStart;
        });

        for (const due of coexistingDues) {
          batch.delete(due.ref);
          updateCount++;
        }
      }
    }

    if (updateCount > 0) {
      await batch.commit();
      console.log(`Retroactive cleanup migrated ${updateCount} records.`);
    }

    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("migration_done_v2", "true");
    }
  } catch (err) {
    console.error("Migration failed", err);
  }
}

export async function getCollectionToday(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const q = query(coll.payments, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Payment)
    .filter((p) => isRealCollectionPayment(p) && p.paymentDate >= start.getTime() && p.paymentDate <= end.getTime())
    .reduce((sum, p) => sum + p.amountPaid, 0);
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week = Math.ceil(
    ((d.getTime() - new Date(d.getFullYear(), 0, 4).getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type AllPaymentEver = {
  id: string;
  amount: number;
  amountPaid?: number;
  date: Date;
  paymentDate?: number;
  customerId?: string;
  loanId?: string;
  paymentType?: Payment["paymentType"];
  paymentMode?: PaymentMode;
  type?: Payment["type"];
};

export type AllLoanEver = {
  id: string;
  amount: number;
  date: Date;
  status: string;
  customerId?: string;
  principalAmount?: number;
  startDate?: number;
  disbursement_mode?: PaymentMode;
  disbursementMode?: PaymentMode;
};

export type WeeklyChartPoint = {
  weekLabel: string;
  collected: number;
  distributed: number;
};

function mapPaymentDoc(
  docSnap: { id: string; data: () => any },
  customerIdByLoanId?: Map<string, string>
): AllPaymentEver {
  const d = docSnap.data() as any;
  const rawDate = d.date ?? d.payment_date ?? d.paymentDate;
  const millis = toMillis(rawDate);
  const loanId = d.loanId ?? d.loan_id;
  return {
    id: docSnap.id,
    amount: money(d.amountPaid ?? d.amount_paid ?? d.amount),
    amountPaid: money(d.amountPaid ?? d.amount_paid ?? d.amount),
    date: new Date(millis || Date.now()),
    paymentDate: millis || Date.now(),
    customerId: d.customerId ?? d.customer_id ?? customerIdByLoanId?.get(loanId),
    loanId,
    paymentType: d.paymentType ?? d.type,
    paymentMode: d.paymentMode ?? (d.type === "PHONE" ? "PHONE" : "CASH"),
    type: d.type,
  };
}

function mapLoanDoc(docSnap: { id: string; data: () => any }): AllLoanEver {
  const d = docSnap.data() as any;
  const rawDate = d.start_date ?? d.startDate ?? d.createdAt;
  const millis = toMillis(rawDate);
  return {
    id: docSnap.id,
    amount: getLoanDistributedAmount(d),
    principalAmount: getLoanPrincipalAmount(d),
    date: new Date(millis || Date.now()),
    startDate: millis || Date.now(),
    status: d.status || "ACTIVE",
    customerId: d.customerId ?? d.customer_id,
    disbursement_mode: d.disbursement_mode ?? d.disbursementMode ?? "CASH",
    disbursementMode: d.disbursementMode ?? d.disbursement_mode ?? "CASH",
  };
}

/** Full user payment/loan/expense/investment fetch filtered to a date range (no 1500-doc cap). */
export async function getAccountSummaryForRange(
  userId: string,
  startMs: number,
  endMs: number
): Promise<{
  payments: AllPaymentEver[];
  loans: AllLoanEver[];
  expenses: Expense[];
  investments: Investment[];
}> {
  const [paymentsSnap, loansSnap, expensesSnap, investmentsSnap, villagesSnap, customersSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId))),
    getDocs(query(coll.loans, where("userId", "==", userId))),
    getDocs(query(coll.expenses, where("userId", "==", userId))),
    getDocs(query(coll.investments, where("userId", "==", userId))),
    getDocs(query(coll.villages, where("userId", "==", userId))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);

  const villages = villagesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const customersRaw = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const villageById = new Map(villages.map((village) => [village.id, village]));
  const customers = filterCustomersWithVillage(customersRaw)
    .filter((customer) => villageById.has(customer.villageId));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const customerIdByLoanId = new Map(
    loansSnap.docs.map((d) => {
      const loan = d.data() as Loan;
      return [loan.id, loan.customerId];
    })
  );

  const payments = paymentsSnap.docs
    .map((docSnap) => mapPaymentDoc(docSnap, customerIdByLoanId))
    .filter((payment) => {
      const ts = toMillis(payment.paymentDate ?? payment.date);
      return (
        ts >= startMs &&
        ts <= endMs &&
        isRealCollectionPayment(payment) &&
        !!payment.customerId &&
        customerById.has(payment.customerId)
      );
    });

  const loans = loansSnap.docs
    .map(mapLoanDoc)
    .filter((loan) => {
      const ts = toMillis(loan.startDate ?? loan.date);
      return (
        ts >= startMs &&
        ts <= endMs &&
        !!loan.customerId &&
        customerById.has(loan.customerId)
      );
    });

  const expenses = expensesSnap.docs
    .map((d) => {
      const data = d.data() as Expense;
      return { ...data, id: d.id || data.id };
    })
    .filter((expense) => expense.date >= startMs && expense.date <= endMs);

  const investments = investmentsSnap.docs
    .map((d) => {
      const data = d.data() as Investment;
      return { ...data, id: d.id || data.id };
    })
    .filter((investment) => investment.date >= startMs && investment.date <= endMs);

  return { payments, loans, expenses, investments };
}

function formatBalanceDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function balanceDateKeyToMillis(dateStr?: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ""));
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date.getTime()
    : 0;
}

/** Opening BF for an account range, calculated from uncapped ledger data before startMs. */
export async function getAccountOpeningBalanceForDate(
  userId: string,
  startMs: number,
  options: { useExactDateOverride?: boolean } = {}
): Promise<number> {
  const targetStart = startOfDay(startMs);
  const targetDateKey = formatBalanceDateKey(targetStart);
  const previousDayEnd = endOfDay(targetStart - 1);

  const [globalBfSnap, dateBfsSnap, paymentsSnap, loansSnap, expensesSnap, investmentsSnap, villagesSnap, customersSnap] = await Promise.all([
    getDoc(doc(db, "balancingFund", userId)),
    getDocs(query(coll.balancingFund, where("userId", "==", userId))),
    getDocs(query(coll.payments, where("userId", "==", userId))),
    getDocs(query(coll.loans, where("userId", "==", userId))),
    getDocs(query(coll.expenses, where("userId", "==", userId))),
    getDocs(query(coll.investments, where("userId", "==", userId))),
    getDocs(query(coll.villages, where("userId", "==", userId))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);

  const dateBfs = dateBfsSnap.docs.map((docSnap) => docSnap.data() as any);
  const exactOverride = dateBfs.find((item) => item?.dateStr === targetDateKey);
  if (options.useExactDateOverride !== false && exactOverride) {
    return money(exactOverride.amount);
  }

  const latestOverride = dateBfs
    .map((item) => ({ ...item, timestamp: balanceDateKeyToMillis(item?.dateStr) }))
    .filter((item) => item.timestamp > 0 && item.timestamp <= previousDayEnd)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  const startBalance = latestOverride
    ? money(latestOverride.amount)
    : money(globalBfSnap.exists() ? globalBfSnap.data().amount : 0);
  const startLimit = latestOverride ? startOfDay(latestOverride.timestamp) : 0;

  const villages = villagesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const customersRaw = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const villageById = new Map(villages.map((village) => [village.id, village]));
  const customers = filterCustomersWithVillage(customersRaw)
    .filter((customer) => villageById.has(customer.villageId));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const customerIdByLoanId = new Map(
    loansSnap.docs.map((d) => {
      const loan = d.data() as Loan;
      return [loan.id, loan.customerId];
    })
  );

  const sumInvs = investmentsSnap.docs
    .map((d) => d.data() as Investment)
    .filter((investment) => investment.date >= startLimit && investment.date <= previousDayEnd)
    .reduce((sum, investment) => sum + money(investment.amount), 0);

  const sumColls = paymentsSnap.docs
    .map((docSnap) => mapPaymentDoc(docSnap, customerIdByLoanId))
    .filter((payment) => {
      const ts = toMillis(payment.paymentDate ?? payment.date);
      return (
        ts >= startLimit &&
        ts <= previousDayEnd &&
        isRealCollectionPayment(payment) &&
        payment.customerId &&
        customerById.has(payment.customerId)
      );
    })
    .reduce((sum, payment) => sum + money(payment.amountPaid ?? payment.amount), 0);

  const sumLoans = loansSnap.docs
    .map(mapLoanDoc)
    .filter((loan) => {
      const ts = toMillis(loan.startDate ?? loan.date);
      return (
        ts >= startLimit &&
        ts <= previousDayEnd &&
        loan.customerId &&
        customerById.has(loan.customerId)
      );
    })
    .reduce((sum, loan) => sum + money(loan.amount), 0);

  const sumExps = expensesSnap.docs
    .map((d) => d.data() as Expense)
    .filter((expense) => expense.date >= startLimit && expense.date <= previousDayEnd)
    .reduce((sum, expense) => sum + money(expense.amount), 0);

  return startBalance + sumInvs + sumColls - sumLoans - sumExps;
}

/** All payments between two timestamps (inclusive), without the 1500-doc snapshot cap. */
export async function getPaymentsForAccountRange(
  userId: string,
  startMs: number,
  endMs: number
): Promise<AllPaymentEver[]> {
  const { payments } = await getAccountSummaryForRange(userId, startMs, endMs);
  return payments;
}

export const getAllPaymentsEver = async (userId?: string): Promise<AllPaymentEver[]> => {
  const [snap, loansSnap, villagesSnap, customersSnap] = await Promise.all([
    getDocs(userId ? query(coll.payments, where("userId", "==", userId)) : query(coll.payments)),
    userId ? getDocs(query(coll.loans, where("userId", "==", userId))) : Promise.resolve(null),
    userId ? getDocs(query(coll.villages, where("userId", "==", userId))) : Promise.resolve(null),
    userId ? getDocs(query(coll.customers, where("userId", "==", userId))) : Promise.resolve(null),
  ]);

  let customerById: Map<string, any> | null = null;
  if (userId && villagesSnap && customersSnap) {
    const villages = villagesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const customersRaw = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const villageById = new Map(villages.map((v) => [v.id, v]));
    const customers = filterCustomersWithVillage(customersRaw)
      .filter((c) => villageById.has(c.villageId));
    customerById = new Map(customers.map((c) => [c.id, c]));
  }

  const customerIdByLoanId = new Map<string, string>(
    loansSnap?.docs.map((d) => {
      const loan = d.data() as Loan;
      return [loan.id, loan.customerId] as [string, string];
    }) ?? []
  );
  return snap.docs
    .map((docSnap) => mapPaymentDoc(docSnap, customerIdByLoanId))
    .filter((payment) => {
      if (!payment.customerId) return false;
      if (customerById && !customerById.has(payment.customerId)) return false;
      return true;
    });
};

export const getAllLoansEver = async (userId?: string): Promise<AllLoanEver[]> => {
  const [snap, villagesSnap, customersSnap] = await Promise.all([
    getDocs(userId ? query(coll.loans, where("userId", "==", userId)) : query(coll.loans)),
    userId ? getDocs(query(coll.villages, where("userId", "==", userId))) : Promise.resolve(null),
    userId ? getDocs(query(coll.customers, where("userId", "==", userId))) : Promise.resolve(null),
  ]);

  let customerById: Map<string, any> | null = null;
  if (userId && villagesSnap && customersSnap) {
    const villages = villagesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const customersRaw = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const villageById = new Map(villages.map((v) => [v.id, v]));
    const customers = filterCustomersWithVillage(customersRaw)
      .filter((c) => villageById.has(c.villageId));
    customerById = new Map(customers.map((c) => [c.id, c]));
  }

  const loans = snap.docs.map(mapLoanDoc).filter((loan) => {
    if (!loan.customerId) return false;
    if (customerById && !customerById.has(loan.customerId)) return false;
    return true;
  });
  const seen = new Set<string>();
  return loans.filter((loan) => {
    const key = `${loan.customerId ?? ""}:${loan.startDate}:${loan.amount}:${loan.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getWeeklyChartData = async (userId?: string): Promise<WeeklyChartPoint[]> => {
  // Only load data from the last 12 weeks for the chart
  const twelveWeeksAgoMs = Date.now() - 12 * 7 * 24 * 60 * 60 * 1000;

  const paymentsQuery = userId
    ? query(coll.payments, where("userId", "==", userId))
    : query(coll.payments);
  const loansQuery = userId
    ? query(coll.loans, where("userId", "==", userId))
    : query(coll.loans);
  const [paymentsSnap, loansSnap] = await Promise.all([
    getDocs(paymentsQuery),
    getDocs(loansQuery),
  ]);

  // Build loan customerId lookup for payments that only have loanId
  const loansRaw = loansSnap.docs.map((docSnap) => {
    const d = docSnap.data() as any;
    const rawDate = d.start_date ?? d.startDate ?? d.createdAt;
    const millis = toMillis(rawDate);
    return {
      id: docSnap.id,
      amount: getLoanDistributedAmount(d),
      date: new Date(millis || Date.now()),
      customerId: d.customerId ?? d.customer_id,
    };
  }).filter((loan) => loan.date.getTime() >= twelveWeeksAgoMs);

  const customerIdByLoanId = new Map(loansRaw.map((l) => [l.id, l.customerId]));

  const paymentsRaw = paymentsSnap.docs.map((docSnap) => {
    const d = docSnap.data() as any;
    const rawDate = d.date ?? d.payment_date ?? d.paymentDate;
    const millis = toMillis(rawDate);
    return {
      id: docSnap.id,
      amount: money(d.amountPaid ?? d.amount_paid ?? d.amount),
      date: new Date(millis || Date.now()),
      customerId: d.customerId ?? d.customer_id ?? customerIdByLoanId.get(d.loanId ?? d.loan_id),
      paymentType: d.paymentType ?? d.type,
    };
  }).filter((payment) => payment.date.getTime() >= twelveWeeksAgoMs);

  const weekMap: Record<string, { collected: number; distributed: number; date: Date }> = {};

  paymentsRaw.filter(isRealCollectionPayment).forEach((payment) => {
    const key = getWeekKey(payment.date);
    if (!weekMap[key]) weekMap[key] = { collected: 0, distributed: 0, date: payment.date };
    weekMap[key].collected += payment.amount;
  });

  loansRaw.forEach((loan) => {
    const key = getWeekKey(loan.date);
    if (!weekMap[key]) weekMap[key] = { collected: 0, distributed: 0, date: loan.date };
    weekMap[key].distributed += loan.amount;
  });

  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => ({
      weekLabel: value.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      collected: value.collected,
      distributed: value.distributed,
    }));
};

export async function getTodayDashboardStats(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const [paymentsSnap, loansSnap, customersSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId), where("paymentDate", ">=", startMs), where("paymentDate", "<=", endMs))),
    getDocs(query(coll.loans, where("userId", "==", userId), where("startDate", ">=", startMs), where("startDate", "<=", endMs))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);

  const activeCustomerIds = new Set(
    customersSnap.docs
      .map((d) => d.data() as Customer)
      .map((customer) => customer.id)
  );
  const activeLoanCustomerById = new Map<string, string>();
  const todayLoans = loansSnap.docs
    .map((d) => d.data() as Loan)
    .filter((loan) => activeCustomerIds.has(loan.customerId));
  todayLoans.forEach((loan) => activeLoanCustomerById.set(loan.id, loan.customerId));

  const collectionToday = paymentsSnap.docs
    .map((d) => d.data() as Payment)
    .filter((payment) => {
      const customerId = payment.customerId ?? activeLoanCustomerById.get(payment.loanId);
      return (
        payment.paymentType !== "DUE" &&
        !!customerId &&
        activeCustomerIds.has(customerId)
      );
    })
    .reduce((sum, payment) => sum + money(payment.amountPaid), 0);

  const distributedToday = todayLoans
    .reduce((sum, loan) => sum + getLoanDistributedAmount(loan), 0);

  return { collectionToday, distributedToday };
}

export const getAllTimeTotals = async (userId?: string): Promise<{ distributed: number; collected: number }> => {
  const [payments, loans] = await Promise.all([
    getAllPaymentsEver(userId),
    getAllLoansEver(userId),
  ]);
  return {
    distributed: loans.reduce((sum, loan) => sum + loan.amount, 0),
    collected: payments.filter(isRealCollectionPayment).reduce((sum, payment) => sum + payment.amount, 0),
  };
};

export async function getPaymentsByDate(userId: string, startDate: number, endDate: number) {
  const q = query(
    coll.payments,
    where("userId", "==", userId),
    where("paymentDate", ">=", startDate),
    where("paymentDate", "<=", endDate)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Payment);
}

export async function getClosedCustomers(userId: string, villageId: string) {
  const q = query(
    coll.customers,
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("isActive", "==", false)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Customer);
}

export async function closeCustomer(customerId: string, userId: string) {
  await updateDoc(doc(db, "customers", customerId), {
    isActive: false,
    closedAt: Date.now(),
  });
  invalidateUserDataCache(userId);
}

export async function reopenCustomer(customerId: string, userId: string) {
  await updateDoc(doc(db, "customers", customerId), {
    isActive: true,
    closedAt: null,
  });
  invalidateUserDataCache(userId);
}

export async function updateCustomer(customer: Customer) {
  const sanitized = sanitizeCustomerInput(customer);
  if ((sanitized as any).locationCustomerId && (sanitized as any).locationCustomerId !== customer.id) {
    console.warn("Skipping mismatched customer location save", {
      customerId: customer.id,
      locationCustomerId: (sanitized as any).locationCustomerId,
    });
    sanitized.latitude = undefined;
    sanitized.longitude = undefined;
  }
  await updateDoc(doc(db, "customers", customer.id), {
    ...stripUndefined(sanitized),
    latitude: sanitized.latitude === undefined ? deleteField() : sanitized.latitude,
    longitude: sanitized.longitude === undefined ? deleteField() : sanitized.longitude,
  });
  invalidateUserDataCache(customer.userId, customer.villageId);
}

export async function updateCustomerAndLoan(
  customer: Customer,
  loan?: Loan | null,
  loanUpdates?: { principalAmount: number; startDate: number; disbursementMode?: PaymentMode }
) {
  const sanitized = sanitizeCustomerInput(customer);
  if ((sanitized as any).locationCustomerId && (sanitized as any).locationCustomerId !== customer.id) {
    sanitized.latitude = undefined;
    sanitized.longitude = undefined;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "customers", customer.id), {
    ...stripUndefined(sanitized),
    latitude: sanitized.latitude === undefined ? deleteField() : sanitized.latitude,
    longitude: sanitized.longitude === undefined ? deleteField() : sanitized.longitude,
  });

  let updatedLoan: Loan | null = loan ?? null;
  if (loan && loanUpdates) {
    assertPositiveAmount(loanUpdates.principalAmount, "Loan amount");
    const interestAmount = loanUpdates.principalAmount * 0.2;
    const totalPayable = loanUpdates.principalAmount + interestAmount;
    const paidSoFar = loan.totalPayable - loan.balanceAmount;
    const finalMode = loanUpdates.disbursementMode
      ? normalizeMode(loanUpdates.disbursementMode)
      : normalizeMode(loan.disbursement_mode ?? loan.disbursementMode ?? "CASH");
    updatedLoan = {
      ...loan,
      principalAmount: loanUpdates.principalAmount,
      interestAmount,
      totalPayable,
      balanceAmount: totalPayable - paidSoFar,
      startDate: loanUpdates.startDate,
      disbursement_mode: finalMode,
      disbursementMode: finalMode,
    };
    batch.set(doc(db, "loans", loan.id), stripUndefined(updatedLoan));
  }

  await batch.commit();
  invalidateUserDataCache(customer.userId, customer.villageId);
  return { customer: sanitized as Customer, loan: updatedLoan };
}

export async function deleteCustomer(userId: string, customerId: string) {
  const batch = writeBatch(db);

  // Delete all loans associated with this customer
  const loansQ = query(coll.loans, where("userId", "==", userId), where("customerId", "==", customerId));
  const loansSnap = await getDocs(loansQ);
  
  // We will collect loan IDs to query payments
  const loanIds = loansSnap.docs.map(doc => doc.id);

  // Delete loans
  loansSnap.docs.forEach((loanDoc) => {
    batch.delete(loanDoc.ref);
  });

  // Delete payments for these loans
  for (const loanId of loanIds) {
    const paymentsQ = query(coll.payments, where("userId", "==", userId), where("loanId", "==", loanId));
    const paymentsSnap = await getDocs(paymentsQ);
    paymentsSnap.docs.forEach((paymentDoc) => {
      batch.delete(paymentDoc.ref);
    });
  }

  // Delete any stray payments attached directly to the customer
  const strayPaymentsQ = query(coll.payments, where("userId", "==", userId), where("customerId", "==", customerId));
  const strayPaymentsSnap = await getDocs(strayPaymentsQ);
  strayPaymentsSnap.docs.forEach((paymentDoc) => {
    batch.delete(paymentDoc.ref);
  });
  
  // Finally delete the customer
  batch.delete(doc(db, "customers", customerId));

  // Commit the batch
  await batch.commit();
  clearCache();
}

export async function getCustomerByAadhar(userId: string, aadhar: string, excludeCustomerId?: string): Promise<Customer | null> {
  const normalizedAadhar = normalizeAadhar(aadhar);
  if (!normalizedAadhar) return null;

  const indexedQ = query(
    coll.customers,
    where("userId", "==", userId),
    where("aadhar", "==", normalizedAadhar),
    limit(5)
  );
  const indexedSnap = await getDocs(indexedQ);
  const indexedMatch = indexedSnap.docs
    .map((d) => d.data() as Customer)
    .find((customer) => customer.isActive !== false && customer.id !== excludeCustomerId);
  if (indexedMatch) return indexedMatch;

  // Legacy fallback for records saved before normalized Aadhaar indexing.
  const q = query(coll.customers, where("userId", "==", userId), limit(300));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Customer)
    .find((customer) =>
      customer.isActive !== false &&
      customer.id !== excludeCustomerId &&
      normalizeAadhar(customer.aadhar) === normalizedAadhar
    ) ?? null;
}

export async function getCustomerLoanSummary(userId: string, aadhar: string): Promise<{customer: Customer | null, hasActiveLoan: boolean}> {
  const customer = await getCustomerByAadhar(userId, aadhar);
  if (!customer) {
    return { customer: null, hasActiveLoan: false };
  }

  const activeLoan = await getActiveLoan(userId, customer.id);
  const hasActive = !!activeLoan && activeLoan.status === "ACTIVE";
  return { customer, hasActiveLoan: hasActive };
}

export async function blockAadhaar(aadhaar: string, reason: string, userId: string): Promise<void> {
  const normalizedAadhaar = normalizeAadhar(aadhaar);
  if (normalizedAadhaar.length !== 12) throw new Error("Aadhaar must be exactly 12 digits.");
  await addDoc(coll.blockedAadhaar, {
    aadhaarNumber: normalizedAadhaar,
    aadhaar: normalizedAadhaar,
    reason: cleanText(reason),
    blockedAt: serverTimestamp(),
    blocked_at: serverTimestamp(),
    blockedBy: userId,
    blocked_by: userId,
    userId,
  });
}

export async function isAadhaarBlocked(aadhaar: string, userId?: string): Promise<boolean> {
  const normalizedAadhaar = normalizeAadhar(aadhaar);
  if (normalizedAadhaar.length !== 12) return false;
  const [snap, legacySnap] = await Promise.all([
    getDocs(
      userId
        ? query(coll.blockedAadhaar, where("aadhaarNumber", "==", normalizedAadhaar), where("userId", "==", userId), limit(1))
        : query(coll.blockedAadhaar, where("aadhaarNumber", "==", normalizedAadhaar), limit(1))
    ),
    getDocs(
      userId
        ? query(coll.blockedAadhaar, where("aadhaar", "==", normalizedAadhaar), where("userId", "==", userId), limit(1))
        : query(coll.blockedAadhaar, where("aadhaar", "==", normalizedAadhaar), limit(1))
    ),
  ]);
  return !snap.empty || !legacySnap.empty;
}

export async function getBlockedAadhaars(userId?: string): Promise<BlockedAadhaar[]> {
  const snap = await getDocs(userId ? query(coll.blockedAadhaar, where("userId", "==", userId), limit(500)) : query(coll.blockedAadhaar, limit(500)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<BlockedAadhaar, "id">) }));
}

export async function unblockAadhaar(docId: string): Promise<void> {
  await deleteDoc(doc(db, "blockedAadhaar", docId));
}

export const addBlockedAadhaar = blockAadhaar;
export const checkAadhaarBlocked = isAadhaarBlocked;
export const getBlockedAadhaarList = getBlockedAadhaars;

export async function getBalancingFund(userId: string): Promise<number> {
  const snap = await getDoc(doc(db, "balancingFund", userId));
  if (snap.exists()) {
    const data = snap.data();
    return Number(data.amount || 0);
  }
  return 0;
}

export async function saveBalancingFund(userId: string, amount: number): Promise<void> {
  await setDoc(doc(db, "balancingFund", userId), {
    id: userId,
    userId,
    amount,
    updatedAt: Date.now()
  });
  clearCache();
}

export async function getBalancingFundForDate(userId: string, dateStr: string): Promise<{amount: number; exists: boolean}> {
  const snap = await getDoc(doc(db, "balancingFund", `${userId}_${dateStr}`));
  if (snap.exists()) {
    const data = snap.data();
    return { amount: Number(data.amount || 0), exists: true };
  }
  return { amount: 0, exists: false };
}

export async function saveBalancingFundForDate(userId: string, amount: number, dateStr: string): Promise<void> {
  await setDoc(doc(db, "balancingFund", `${userId}_${dateStr}`), {
    id: `${userId}_${dateStr}`,
    userId,
    amount,
    dateStr,
    updatedAt: Date.now()
  });
  clearCache();
}

export async function getAllBalancingFunds(userId: string): Promise<any[]> {
  const q = query(coll.balancingFund, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => docSnap.data());
}

export async function getInvestments(userId: string): Promise<Investment[]> {
  const q = query(coll.investments, where("userId", "==", userId), limit(1000));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Investment;
    return { ...data, id: docSnap.id || data.id };
  }).sort((a, b) => b.date - a.date);
}

export async function addInvestment(userId: string, amount: number, date: number, investorName?: string, paymentMode: PaymentMode = "CASH"): Promise<Investment> {
  return addInvestmentWithMode(userId, amount, date, investorName, paymentMode);
}

export async function addInvestmentWithMode(userId: string, amount: number, date: number, investorName?: string, paymentMode: PaymentMode = "CASH"): Promise<Investment> {
  assertPositiveAmount(amount, "Investment amount");
  const cleanedInvestorName = cleanText(investorName);
  const investment: Investment = {
    id: id(),
    userId,
    amount,
    date,
    investorName: cleanedInvestorName || "",
    payment_mode: normalizeMode(paymentMode),
  };
  await setDoc(doc(db, "investments", investment.id), stripUndefined(investment));
  clearCache();
  return investment;
}

export async function deleteInvestment(investmentId: string): Promise<void> {
  await deleteDoc(doc(db, "investments", investmentId));
  clearCache();
}

export async function updateInvestment(investmentId: string, amount: number, date: number, investorName?: string, paymentMode: PaymentMode = "CASH"): Promise<void> {
  assertPositiveAmount(amount, "Investment amount");
  const cleanedInvestorName = cleanText(investorName);
  const ref = doc(db, "investments", investmentId);
  await updateDoc(ref, {
    amount,
    date,
    investorName: cleanedInvestorName || "",
    payment_mode: normalizeMode(paymentMode),
    updatedAt: Date.now()
  });
  clearCache();
}

export async function getExpenses(userId: string): Promise<Expense[]> {
  const q = query(coll.expenses, where("userId", "==", userId), limit(1000));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Expense;
    return { ...data, id: docSnap.id || data.id };
  }).sort((a, b) => b.date - a.date);
}

export async function addExpense(userId: string, amount: number, description: string, date: number, paymentMode: PaymentMode = "CASH"): Promise<Expense> {
  assertPositiveAmount(amount, "Expense amount");
  const cleanedDescription = cleanText(description);
  if (!cleanedDescription) throw new Error("Description is required.");
  const expense: Expense = {
    id: id(),
    userId,
    amount,
    description: cleanedDescription,
    date,
    payment_mode: normalizeMode(paymentMode),
  };
  await setDoc(doc(db, "expenses", expense.id), stripUndefined(expense));
  clearCache();
  return expense;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await deleteDoc(doc(db, "expenses", expenseId));
  clearCache();
}

export async function updateExpense(expenseId: string, amount: number, description: string, date: number, paymentMode: PaymentMode = "CASH"): Promise<void> {
  assertPositiveAmount(amount, "Expense amount");
  const cleanedDescription = cleanText(description);
  if (!cleanedDescription) throw new Error("Description is required.");
  
  const ref = doc(db, "expenses", expenseId);
  await updateDoc(ref, {
    amount,
    description: cleanedDescription,
    date,
    payment_mode: normalizeMode(paymentMode),
    updatedAt: Date.now()
  });
  clearCache();
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const snap = await getDoc(doc(db, "users", userId));
  const data = snap.exists() ? (snap.data() as Partial<UserProfile>) : {};
  return {
    id: userId,
    userId,
    ...data,
    accountNotes: data.accountNotes ?? "",
    cashOpeningBalance: Number(data.cashOpeningBalance || 0),
    phonePeOpeningBalance: Number(data.phonePeOpeningBalance || 0),
  };
}

export async function saveAccountNotes(userId: string, accountNotes: string): Promise<void> {
  // PRIVATE — never export
  await setDoc(doc(db, "users", userId), { id: userId, userId, accountNotes, updatedAt: Date.now() }, { merge: true });
  clearCache();
}

export async function saveWalletOpeningBalances(
  userId: string,
  cashOpeningBalance: number,
  phonePeOpeningBalance: number,
  walletOpeningDate: number
): Promise<void> {
  assertNonNegativeAmount(cashOpeningBalance, "Cash balance");
  assertNonNegativeAmount(phonePeOpeningBalance, "PhonePe balance");
  // PRIVATE — never export
  await setDoc(
    doc(db, "users", userId),
    {
      id: userId,
      userId,
      cashOpeningBalance,
      phonePeOpeningBalance,
      walletOpeningDate,
      phonePeOpeningDate: deleteField(),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  clearCache();
}


/*
 * subscribeWalletData — sets up real-time onSnapshot listeners for all collections
 * that feed into the Live Calculated Balance. Calls `callback` with the latest
 * raw arrays whenever any collection changes.
 *
 * Returns a single cleanup / unsubscribe function — call it on component unmount.
 *
 * IMPORTANT: this function only reads data; it NEVER writes to the wallet fields.
 */
export function subscribeWalletData(
  userId: string,
  callback: (data: {
    expenses: Expense[];
    payments: AllPaymentEver[];
    loans: AllLoanEver[];
    investments: Investment[];
    userProfile: UserProfile;
  }) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  // Shared mutable cache — updated independently by each listener
  const state: {
    expenses: Expense[];
    payments: AllPaymentEver[];
    loans: AllLoanEver[];
    investments: Investment[];
    userProfile: UserProfile;
  } = {
    expenses: [],
    payments: [],
    loans: [],
    investments: [],
    userProfile: { id: userId, userId },
  };

  // Debounce so that multiple simultaneous snapshots only trigger one recalc
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!cancelled) callback({ ...state });
    }, 100);
  };

  const handleError = (err: unknown) => {
    if (!cancelled) onError?.(err);
  };

  // Local raw data stores to support active-customer filtering in real time
  let rawPayments: AllPaymentEver[] = [];
  let rawLoans: AllLoanEver[] = [];
  let rawCustomers: any[] = [];
  let rawVillages: any[] = [];

  const updateAndNotify = () => {
    const villageById = new Map(rawVillages.map((v) => [v.id, v]));
    const customers = filterCustomersWithVillage(rawCustomers)
      .filter((c) => villageById.has(c.villageId));
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const customerIdByLoanId = new Map(rawLoans.map((l) => [l.id, l.customerId]));

    const mappedPayments = rawPayments.map((p) => ({
      ...p,
      customerId: p.customerId ?? customerIdByLoanId.get(p.loanId),
    }));

    state.payments = mappedPayments.filter(
      (p) => p.customerId && customerById.has(p.customerId)
    );

    const seen = new Set<string>();
    const uniqueLoans = rawLoans.filter((loan) => {
      const key = `${loan.customerId ?? ""}:${loan.startDate}:${loan.amount}:${loan.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    state.loans = uniqueLoans.filter(
      (l) => l.customerId && customerById.has(l.customerId)
    );

    notify();
  };

  // Listener: expenses
  const unsubExpenses = onSnapshot(
    query(coll.expenses, where("userId", "==", userId)),
    (snap) => {
      state.expenses = snap.docs
        .map((d) => {
          const data = d.data() as Expense;
          return { ...data, id: d.id || data.id };
        })
        .sort((a, b) => b.date - a.date);
      notify();
    },
    handleError
  );

  // Listener: investments
  const unsubInvestments = onSnapshot(
    query(coll.investments, where("userId", "==", userId)),
    (snap) => {
      state.investments = snap.docs
        .map((d) => {
          const data = d.data() as Investment;
          return { ...data, id: d.id || data.id };
        })
        .sort((a, b) => b.date - a.date);
      notify();
    },
    handleError
  );

  // Listener: payments — mapped to AllPaymentEver shape
  const unsubPayments = onSnapshot(
    query(coll.payments, where("userId", "==", userId)),
    (snap) => {
      rawPayments = snap.docs.map((docSnap) => mapPaymentDoc(docSnap));
      updateAndNotify();
    },
    handleError
  );

  // Listener: loans — mapped to AllLoanEver shape
  const unsubLoans = onSnapshot(
    query(coll.loans, where("userId", "==", userId)),
    (snap) => {
      rawLoans = snap.docs.map(mapLoanDoc);
      updateAndNotify();
    },
    handleError
  );

  // Listener: customers
  const unsubCustomers = onSnapshot(
    query(coll.customers, where("userId", "==", userId)),
    (snap) => {
      rawCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      updateAndNotify();
    },
    handleError
  );

  // Listener: villages
  const unsubVillages = onSnapshot(
    query(coll.villages, where("userId", "==", userId)),
    (snap) => {
      rawVillages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      updateAndNotify();
    },
    handleError
  );

  // Listener: user profile (wallet snapshot lives here)
  const unsubUser = onSnapshot(
    doc(db, "users", userId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as Partial<UserProfile>) : {};
      state.userProfile = {
        id: userId,
        userId,
        ...data,
        accountNotes: data.accountNotes ?? "",
        cashOpeningBalance: Number(data.cashOpeningBalance || 0),
        phonePeOpeningBalance: Number(data.phonePeOpeningBalance || 0),
      };
      notify();
    },
    handleError
  );

  // Return single cleanup function
  return () => {
    cancelled = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubExpenses();
    unsubInvestments();
    unsubPayments();
    unsubLoans();
    unsubCustomers();
    unsubVillages();
    unsubUser();
  };
}

export async function createNestedAuthUser(email: string, password: string): Promise<string> {
  const appName = "nestedAppInstance_" + Math.random().toString(36).slice(2);
  const secondaryApp = initializeApp(firebaseConfig, appName);
  let secondaryAuth;
  try {
    secondaryAuth = initializeAuth(secondaryApp, {
      persistence: inMemoryPersistence,
    });
  } catch (err) {
    secondaryAuth = getAuth(secondaryApp);
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;
    try {
      await secondarySignOut(secondaryAuth);
    } catch {}
    return newUid;
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch {}
  }
}

export async function addNestedTransaction(txn: {
  ownerUid: string;
  nestedUid: string;
  nestedEmail: string;
  customerId: string;
  customerName: string;
  amount: number;
  type: string;
  date: number;
  notes: string;
}): Promise<void> {
  const ref = doc(collection(db, "nestedTransactions"));
  await setDoc(ref, {
    ...txn,
    id: ref.id,
    exported: false,
    createdAt: Date.now()
  });
}

export async function deleteNestedTransaction(id: string): Promise<void> {
  await deleteDoc(doc(db, "nestedTransactions", id));
}

export async function updateNestedTransaction(id: string, amount: number, notes: string): Promise<void> {
  await updateDoc(doc(db, "nestedTransactions", id), {
    amount,
    notes,
    updatedAt: Date.now()
  });
}

export async function deleteNestedExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, "nestedExpenses", id));
}

export async function updateNestedExpense(id: string, amount: number, note: string): Promise<void> {
  await updateDoc(doc(db, "nestedExpenses", id), {
    amount,
    note: note.trim(),
    updatedAt: Date.now()
  });
}



export async function addNestedTransactionsBatch(
  entries: {
    ownerUid: string;
    nestedUid: string;
    nestedEmail: string;
    customerId: string;
    customerName: string;
    amount: number;
    type: string;
    date: number;
    notes: string;
  }[]
): Promise<void> {
  if (entries.length === 0) return;
  const batch = writeBatch(db);
  for (const entry of entries) {
    const ref = doc(collection(db, "nestedTransactions"));
    batch.set(ref, {
      ...entry,
      id: ref.id,
      exported: false,
      createdAt: Date.now()
    });
  }
  await batch.commit();
}

export async function getNestedTransactionsForCustomer(nestedUid: string, customerId: string) {
  const q = query(
    collection(db, "nestedTransactions"),
    where("nestedUid", "==", nestedUid),
    where("customerId", "==", customerId),
    where("exported", "==", false)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data() as any);
}

export async function getNestedTransactionsForOwner(ownerUid: string) {
  const q = query(
    collection(db, "nestedTransactions"),
    where("ownerUid", "==", ownerUid)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data() as any);
}

export async function getOwnerNestedAccounts(ownerUid: string) {
  const q = query(
    collection(db, "nestedAccounts"),
    where("ownerUid", "==", ownerUid)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data() as any);
}

export async function updateNestedAccountStatus(nestedUid: string, active: boolean): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "nestedAccounts", nestedUid), { active });
  batch.update(doc(db, "users", nestedUid), { active });
  await batch.commit();
}

export async function deleteNestedAccount(nestedUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "nestedAccounts", nestedUid));
  batch.delete(doc(db, "users", nestedUid));
  await batch.commit();
}

export async function reconcileNestedTransactions(ids: string[], action: "export" | "delete"): Promise<void> {
  if (ids.length === 0) return;

  if (action === "delete") {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.delete(doc(db, "nestedTransactions", id));
    }
    await batch.commit();
    return;
  }

  // Fetch all selected transactions
  const txns: any[] = [];
  for (const id of ids) {
    const snap = await getDoc(doc(db, "nestedTransactions", id));
    if (snap.exists()) {
      txns.push({ id: snap.id, ...snap.data() });
    }
  }

  // Sort chronologically (oldest first) so that new customer registrations/loans are set up before payments are applied
  txns.sort((a, b) => (a.date || 0) - (b.date || 0));

  for (const txn of txns) {
    if (txn.exported) continue;

    let targetCustomerId = txn.customerId;
    let targetLoanId: string | null = null;

    // Check if temporary customer
    if (targetCustomerId && targetCustomerId.startsWith("temp_cust_")) {
      const nestedCustRef = doc(db, "nestedCustomers", targetCustomerId);
      const nestedCustSnap = await getDoc(nestedCustRef);
      if (nestedCustSnap.exists()) {
        const nestedCustData = nestedCustSnap.data() as any;
        if (nestedCustData.realCustomerId) {
          targetCustomerId = nestedCustData.realCustomerId;
          targetLoanId = nestedCustData.realLoanId || null;
        } else {
          // Import temporary customer as a real customer
          const newCustId = id();
          const newLoanId = id();
          
          const principal = Number(nestedCustData.principal || 0);
          const interest = principal * 0.2;
          const totalPayable = principal + interest;
          const mode = normalizeMode(nestedCustData.disbursementMode || "CASH");
          
          const startDate = nestedCustData.createdAt || Date.now();
          const cycleStartDay = new Date(startDate).getDay();
          const startWeekStr = getISOWeekString(startDate);
          const resolvedVillageName = (await getVillageById(nestedCustData.villageId))?.name ?? "";
          
          const customer: Customer = {
            id: newCustId,
            numericalId: nestedCustData.numericalId || 999999,
            villageId: nestedCustData.villageId,
            userId: txn.ownerUid,
            isActive: true,
            createdAt: startDate,
            cycleStartDay,
            villageHistory: [
              {
                villageId: nestedCustData.villageId,
                villageName: resolvedVillageName,
                fromWeek: startWeekStr,
                toWeek: null,
                numericalId: nestedCustData.numericalId || 999999,
              }
            ],
            name: nestedCustData.name || "Customer",
            phone: nestedCustData.phone || "",
            aadhar: nestedCustData.aadhar || "",
            coName: nestedCustData.coName || "",
            coId: nestedCustData.coId || null,
            locationDesc: nestedCustData.locationDesc || "",
            latitude: nestedCustData.latitude || null,
            longitude: nestedCustData.longitude || null,
          };
          
          const loan: Loan = {
            id: newLoanId,
            customerId: newCustId,
            principalAmount: principal,
            interestAmount: interest,
            totalPayable,
            balanceAmount: totalPayable,
            userId: txn.ownerUid,
            startDate,
            status: "ACTIVE",
            disbursement_mode: mode,
            disbursementMode: mode,
          };

          const importBatch = writeBatch(db);
          importBatch.set(doc(db, "customers", newCustId), stripUndefined(customer));
          importBatch.set(doc(db, "loans", newLoanId), stripUndefined(loan));
          importBatch.update(nestedCustRef, {
            realCustomerId: newCustId,
            realLoanId: newLoanId
          });
          await importBatch.commit();
          
          targetCustomerId = newCustId;
          targetLoanId = newLoanId;
        }
      }
    }

    // Apply the nested transaction to the real database
    if (txn.type === "payment") {
      let loan: Loan | null = null;
      if (targetLoanId) {
        const loanSnap = await getDoc(doc(db, "loans", targetLoanId));
        if (loanSnap.exists()) {
          loan = loanSnap.data() as Loan;
        }
      } else {
        const q = query(
          collection(db, "loans"),
          where("userId", "==", txn.ownerUid),
          where("customerId", "==", targetCustomerId),
          where("status", "==", "ACTIVE")
        );
        const loansSnap = await getDocs(q);
        if (!loansSnap.empty) {
          loan = loansSnap.docs[0].data() as Loan;
        }
      }

      if (loan) {
        await addPayment(loan, txn.amount, txn.date || Date.now(), txn.notes?.includes("PhonePe") ? "PHONE" : "CASH", txn.nestedUid);
      }
    } else if (txn.type === "DUE") {
      let loan: Loan | null = null;
      if (targetLoanId) {
        const loanSnap = await getDoc(doc(db, "loans", targetLoanId));
        if (loanSnap.exists()) {
          loan = loanSnap.data() as Loan;
        }
      } else {
        const q = query(
          collection(db, "loans"),
          where("userId", "==", txn.ownerUid),
          where("customerId", "==", targetCustomerId),
          where("status", "==", "ACTIVE")
        );
        const loansSnap = await getDocs(q);
        if (!loansSnap.empty) {
          loan = loansSnap.docs[0].data() as Loan;
        }
      }

      if (loan) {
        await markDue(loan, txn.date || Date.now());
      }
    } else if (txn.type === "RENEWAL_CLOSURE") {
      let loan: Loan | null = null;
      if (targetLoanId) {
        const loanSnap = await getDoc(doc(db, "loans", targetLoanId));
        if (loanSnap.exists()) {
          loan = loanSnap.data() as Loan;
        }
      } else {
        const q = query(
          collection(db, "loans"),
          where("userId", "==", txn.ownerUid),
          where("customerId", "==", targetCustomerId),
          where("status", "==", "ACTIVE")
        );
        const loansSnap = await getDocs(q);
        if (!loansSnap.empty) {
          loan = loansSnap.docs[0].data() as Loan;
        }
      }

      if (loan) {
        const batch = writeBatch(db);
        const closure: Payment = {
          id: id(),
          loanId: loan.id,
          customerId: loan.customerId,
          amountPaid: loan.balanceAmount,
          paymentDate: txn.date || Date.now(),
          weekNumber: loanWeekNumber(loan.startDate, txn.date || Date.now()),
          paymentType: "REGULAR",
          paymentMode: "CASH",
          type: "CASH",
          userId: txn.ownerUid,
        };
        batch.set(doc(db, "payments", closure.id), stripUndefined(closure));
        batch.update(doc(db, "loans", loan.id), {
          balanceAmount: 0,
          status: "CLOSED",
        });
        await batch.commit();
      }
    } else if (txn.type === "RENEWAL_DISBURSEMENT") {
      const newLoanId = id();
      const principal = Number(txn.amount || 0);
      const interest = principal * 0.2;
      const totalPayable = principal + interest;
      
      const newLoan: Loan = {
        id: newLoanId,
        customerId: targetCustomerId,
        principalAmount: principal,
        interestAmount: interest,
        totalPayable,
        balanceAmount: totalPayable,
        userId: txn.ownerUid,
        startDate: txn.date || Date.now(),
        status: "ACTIVE",
        disbursement_mode: "CASH",
        disbursementMode: "CASH",
      };
      
      await setDoc(doc(db, "loans", newLoanId), stripUndefined(newLoan));
      targetLoanId = newLoanId;
    }

    await updateDoc(doc(db, "nestedTransactions", txn.id), { exported: true });
  }

  invalidateUserDataCache(auth.currentUser?.uid || "");
}

// ─────────────────────────────────────────
// Nested BF (Opening Balance)
// ─────────────────────────────────────────

/** Save a BF amount for a specific nested user for a specific date */
export async function saveNestedBF(
  ownerUid: string,
  nestedUid: string,
  amount: number,
  dateStr: string // YYYY-MM-DD
): Promise<void> {
  const docId = `${ownerUid}_nested_${nestedUid}_${dateStr}`;
  await setDoc(doc(db, "balancingFund", docId), {
    id: docId,
    ownerUid,
    nestedUid,
    userId: ownerUid,
    amount,
    dateStr,
    isNestedBF: true,
    updatedAt: Date.now(),
  });
  clearCache();
}

/** Get the BF amount for a nested user for a specific date */
export async function getNestedBF(
  ownerUid: string,
  nestedUid: string,
  dateStr: string // YYYY-MM-DD
): Promise<number> {
  const docId = `${ownerUid}_nested_${nestedUid}_${dateStr}`;
  const snap = await getDoc(doc(db, "balancingFund", docId));
  if (snap.exists()) {
    return Number(snap.data().amount || 0);
  }
  return 0;
}

// ─────────────────────────────────────────
// Nested Expenses
// ─────────────────────────────────────────

export interface NestedExpense {
  id: string;
  nestedUid: string;
  ownerUid: string;
  amount: number;
  note: string;
  date: number; // ms timestamp
  createdAt: number;
}

/** Add a new expense for a nested user */
export async function addNestedExpense(
  ownerUid: string,
  nestedUid: string,
  amount: number,
  note: string,
  date: number = Date.now()
): Promise<NestedExpense> {
  const docId = `nexp_${nestedUid}_${Date.now()}`;
  const expense: NestedExpense = {
    id: docId,
    nestedUid,
    ownerUid,
    amount,
    note: note.trim(),
    date,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, "nestedExpenses", docId), expense);
  return expense;
}

/** Fetch all expenses for a nested user */
export async function getNestedExpenses(
  nestedUid: string
): Promise<NestedExpense[]> {
  const q = query(
    coll.nestedExpenses,
    where("nestedUid", "==", nestedUid),
    orderBy("date", "desc"),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as NestedExpense);
}
