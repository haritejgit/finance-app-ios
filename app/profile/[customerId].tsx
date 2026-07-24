import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import { Image } from "expo-image";
import {
  Alert as RNAlert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../../src/auth-context";
import { AnimatedListItem } from "../../src/components/AnimatedListItem";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { CustomerIdBadge } from "../../src/components/CustomerIdBadge";
import { PhoneLink } from "../../src/components/PhoneLink";
import Icon from "../../src/Icon";
import { LOCATION_PERMISSION_DENIED, LOCATION_TIMEOUT, requestCurrentCoordinates } from "../../src/location";
import {
  addPayment,
  checkAndAutoMarkDues,
  deleteCustomer,
  closeCustomer,
  reopenCustomer,
  deleteDuePayment,
  deletePayment,
  getActiveLoan,
  getCustomerByAadhar,
  getCustomerById,
  getPaymentsForCustomer,
  isAadhaarBlocked,
  isNumericalIdTaken,
  markDue,
  renewLoan,
  updateCustomer,
  updateCustomerAndLoan,
  updatePayment,
  getVillages,
  moveCustomerToVillage,
  getNextNumericalId,
  getOrDeriveCycleStartDay,
  getPersonalCycleStartTs,
  getPersonalCycleWeekIndex,
  formatPersonalCycleRange,
  addNestedTransaction,
  getNestedTransactionsForCustomer,
  updateNestedTransaction,
  deleteNestedTransaction
} from "../../src/repository";
import { Customer, Loan, Payment, PaymentMode, PaymentType, Village } from "../../src/types";
import { db } from "../../src/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useTheme } from "../../src/theme-context";
import { colors } from "../../src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { calculateDisbursedAmount, money, toMillis, weekStart } from "../../src/business-logic";
import { useLanguage } from "../../src/language-context";
import { translateTelugu } from "../../src/exports";
import { openCustomerLedgerPrint } from "../../src/exports";
import { calculateCreditScore } from "../../src/credit-score";
import { showToast } from "../../src/notify";

const noTextSelection = Platform.OS === "web" ? ({ userSelect: "none", WebkitUserSelect: "none" } as any) : undefined;

const Alert = {
  alert: (title: string, message?: string, buttons?: { text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[]) => {
    if (Platform.OS === "web") {
      const formattedMessage = message ? `${title}\n\n${message}` : title;
      if (!buttons || buttons.length === 0) {
        window.alert(formattedMessage);
      } else if (buttons.length === 1) {
        window.alert(formattedMessage);
        if (buttons[0].onPress) buttons[0].onPress();
      } else if (buttons.length === 2) {
        const result = window.confirm(formattedMessage);
        const cancelButton = buttons.find(b => b.style === "cancel" || b.text.toLowerCase() === "cancel") || buttons[0];
        const confirmButton = buttons.find(b => b.style !== "cancel" && b.text.toLowerCase() !== "cancel") || buttons[1];
        if (result) {
          if (confirmButton && confirmButton.onPress) confirmButton.onPress();
        } else {
          if (cancelButton && cancelButton.onPress) cancelButton.onPress();
        }
      } else {
        // Multi-button: window.confirm
        const result = window.confirm(formattedMessage + "\n\n(OK: " + buttons[0].text + ", Cancel: " + buttons[buttons.length - 1].text + ")");
        if (result) {
          const btn = buttons.find(b => b.style !== "cancel" && b.text.toLowerCase() !== "cancel") || buttons[0];
          if (btn && btn.onPress) btn.onPress();
        } else {
          const btn = buttons.find(b => b.style === "cancel" || b.text.toLowerCase() === "cancel") || buttons[buttons.length - 1];
          if (btn && btn.onPress) btn.onPress();
        }
      }
    } else {
      RNAlert.alert(title, message, buttons as any);
    }
  }
};

function confirmRenewal(message: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert("Confirm Loan Renewal", message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirm", onPress: () => resolve(true) },
    ]);
  });
}

function buildRenewalSummary(newPrincipal: number, oldBalance: number) {
  const deduction = Math.floor(newPrincipal / 1000) * 20;
  const disbursed = calculateDisbursedAmount(newPrincipal);
  const netToGive = disbursed - oldBalance;
  return { deduction, disbursed, netToGive };
}

const PaymentHistory = memo(function PaymentHistory({ 
  payments, 
  customer,
  onEdit, 
  onDelete,
  onShare
}: { 
  payments: any[];
  customer: any;
  onEdit?: (payment: any) => void;
  onDelete?: (payment: any) => void;
  onShare?: (payment: any) => void;
}) {
  const { colors } = useTheme();
  const { user, userProfile } = useAuth();
  const isOwner = !userProfile || userProfile.role !== "nested";

  if (payments.length === 0) {
    return (
      <View style={styles.emptyHistoryContainer}>
        <Icon name="document-text-outline" size={44} color="#94A3B8" />
        <Text style={[styles.emptyHistoryTitle, { color: "#FFFFFF" }]}>No Transactions Found</Text>
        <Text style={[styles.emptyHistorySubtitle, { color: "#94A3B8" }]}>Payment records will appear here</Text>
      </View>
    );
  }

  const cycleStartDay = getOrDeriveCycleStartDay(customer);

  return (
    <View style={styles.timelineContainer}>
      {payments.map((p, index) => {
        const isDue = p.paymentType === "DUE" || p.type === "DUE";
        const isRenewal = p.paymentType === "RENEWAL_CLOSURE";
        const canManage = isOwner || p.isPendingSync || (p.nestedUid && p.nestedUid === user?.uid);

        return (
          <AnimatedListItem key={p.id || `pmt_${index}`} index={index}>
            <View style={styles.vibrantTimelineCard}>
              <View style={styles.vibrantCardHeader}>
                {/* Left: Status Icon & Details */}
                <View style={styles.vibrantHeaderLeft}>
                  <View style={[styles.vibrantIconBadge, { backgroundColor: isDue ? "#EF4444" : isRenewal ? "#3B82F6" : "#10B981" }]}>
                    <Icon name={isDue ? "close" : isRenewal ? "refresh" : "checkmark"} size={13} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vibrantCardTitle}>
                      {isDue 
                        ? (p.isAutoDue ? "Auto Due Marked" : "Due Marked")
                        : isRenewal 
                        ? "Loan Renewal Closure"
                        : p.paymentMode === "PHONE" ? "📱 PhonePe Payment" : "💵 Cash Payment"}
                    </Text>
                    <Text style={styles.vibrantCardSubtext}>
                      {isDue ? formatPersonalCycleRange(getPersonalCycleStartTs(p.paymentDate, cycleStartDay)) : (
                        <>
                          {new Date(p.paymentDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {" • "}
                          {new Date(p.paymentDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </>
                      )}
                    </Text>
                  </View>
                </View>

                {/* Right: Large Bold Amount Pill */}
                <View style={{ alignItems: "flex-end" }}>
                  {isDue ? (
                    <View style={styles.vibrantDuePill}>
                      <Text style={styles.vibrantDueText}>DUE</Text>
                    </View>
                  ) : (
                    <View style={styles.vibrantAmountPill}>
                      <Text style={styles.vibrantAmountText}>
                        +₹{Math.round(p.amountPaid || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Action Buttons Row */}
              {(canManage || onShare) && (
                <View style={styles.vibrantActionRow}>
                  {onEdit && canManage && (
                    <Pressable style={styles.vibrantActionBtn} onPress={() => onEdit(p)}>
                      <Icon name="create-outline" size={13} color="#60A5FA" />
                      <Text style={[styles.vibrantActionText, { color: "#60A5FA" }]}>Edit</Text>
                    </Pressable>
                  )}
                  {onDelete && canManage && (
                    <Pressable style={styles.vibrantActionBtn} onPress={() => onDelete(p)}>
                      <Icon name="trash-outline" size={13} color="#F87171" />
                      <Text style={[styles.vibrantActionText, { color: "#F87171" }]}>Delete</Text>
                    </Pressable>
                  )}
                  {onShare && (
                    <Pressable style={[styles.vibrantActionBtn, { backgroundColor: "rgba(16,185,129,0.15)" }]} onPress={() => onShare(p)}>
                      <Icon name="share-social-outline" size={13} color="#34D399" />
                      <Text style={[styles.vibrantActionText, { color: "#34D399" }]}>Share</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </AnimatedListItem>
        );
      })}
    </View>
  );
});

function formatDateInput(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateWithDay(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${dayName}, ${y}-${m}-${day}`;
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

function toStartOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseCoordinateInput(value: string, min: number, max: number) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function getLocationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === LOCATION_PERMISSION_DENIED) {
    return "Permission to access location was denied";
  }
  if (error instanceof Error && error.message === LOCATION_TIMEOUT) {
    return "Location is taking too long. You can enter coordinates manually.";
  }
  return "Failed to get location";
}

function hasCustomerCoordinates(customer?: Customer | null) {
  return typeof customer?.latitude === "number" && typeof customer?.longitude === "number";
}

function getSuggestedPaymentAmount(loan?: Loan | null) {
  if (!loan) return 0;
  const principalVal = loan.principalAmount ?? (loan as any).principal_amount ?? (loan as any).loanAmount ?? (loan as any).amount;
  const principal = Number(principalVal);
  const balance = Number(loan.balanceAmount ?? 0);
  
  const safePrincipal = Number.isFinite(principal) && principal > 0 ? principal : 0;
  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;

  const standardAmount = Math.max(1, Math.round(safePrincipal / 10));
  return Math.min(standardAmount, safeBalance);
}

function createEmptyEditForm() {
  return {
    numericalId: "",
    name: "",
    phone: "",
    aadhar: "",
    locationDesc: "",
    coName: "",
    coId: "",
    latitude: "",
    longitude: "",
    aadharSubmitted: false,
    passportPhotoSubmitted: false,
    loanAmount: "",
    loanStartDate: formatDateInput(Date.now()),
    loanDisbursementMode: "CASH" as PaymentMode,
  };
}

export default function ProfileScreen() {
  const { customerId, renew } = useLocalSearchParams<{ customerId: string; renew?: string }>();
  const activeCustomerId = Array.isArray(customerId) ? customerId[0] : customerId;
  const { user, userProfile, loading: authLoading } = useAuth();
  const isOwner = !userProfile || userProfile.role !== "nested";
  const effectiveOwnerId = isOwner ? user?.uid : userProfile?.parentUid;
  const { colors } = useTheme();
  const { language } = useLanguage();
  const loadRequestRef = useRef(0);
  const locationRequestRef = useRef(0);
  const paymentSavingRef = useRef(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [nestedTransactions, setNestedTransactions] = useState<any[]>([]);
  const [showPreviousHistory, setShowPreviousHistory] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedQrCustomer, setSelectedQrCustomer] = useState<{ customer: Customer; loan: Loan } | null>(null);
  const [qrCustomAmount, setQrCustomAmount] = useState<string>("");
  const [agentUpiId, setAgentUpiId] = useState("karthikeyafinance@ybl");
  const [dueOpen, setDueOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingPaymentEdit, setIsSavingPaymentEdit] = useState(false);
  const [isPaymentSaving, setIsPaymentSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [renewAmount, setRenewAmount] = useState("");
  const [renewMode, setRenewMode] = useState<PaymentMode>("CASH");
  const [paymentDateInput, setPaymentDateInput] = useState(formatDateInput(Date.now()));
  const [dueDateInput, setDueDateInput] = useState(formatDateInput(Date.now()));
  const [renewDateInput, setRenewDateInput] = useState(formatDateInput(Date.now()));
  const [paymentDateError, setPaymentDateError] = useState("");
  const [dueDateError, setDueDateError] = useState("");
  const [renewDateError, setRenewDateError] = useState("");
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [showRenewDatePicker, setShowRenewDatePicker] = useState(false);
  const [tempPaymentDate, setTempPaymentDate] = useState<Date>(new Date());
  const [tempDueDate, setTempDueDate] = useState<Date>(new Date());
  const [tempRenewDate, setTempRenewDate] = useState<Date>(new Date());
  // Payment edit/delete state
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState(formatDateInput(Date.now()));
  const [editPaymentMode, setEditPaymentMode] = useState<PaymentMode>("CASH");
  const [editPaymentError, setEditPaymentError] = useState("");
  const [showEditPaymentPicker, setShowEditPaymentPicker] = useState(false);
  const [tempEditPaymentDate, setTempEditPaymentDate] = useState<Date>(new Date());
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null);
  const [deletePaymentConfirmOpen, setDeletePaymentConfirmOpen] = useState(false);
  const [deleteCustomerConfirmOpen, setDeleteCustomerConfirmOpen] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [editLoanDateError, setEditLoanDateError] = useState("");
  const [editCoordinateError, setEditCoordinateError] = useState("");
  const [editLocationStatus, setEditLocationStatus] = useState("");
  const [showEditLoanDatePicker, setShowEditLoanDatePicker] = useState(false);
  const [tempEditLoanDate, setTempEditLoanDate] = useState<Date>(new Date());
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [selectedTimelineWeek, setSelectedTimelineWeek] = useState<number | null>(null);
  
  // Combined customer & loan edit state
  const [editOpen, setEditOpen] = useState(false);

  // Move village state
  const [moveVillageOpen, setMoveVillageOpen] = useState(false);
  const [villagesList, setVillagesList] = useState<Village[]>([]);
  const [targetVillageId, setTargetVillageId] = useState<string>("");
  const [newNumericalIdPreview, setNewNumericalIdPreview] = useState<number | null>(null);
  const [isMovingVillage, setIsMovingVillage] = useState(false);
  const [editForm, setEditForm] = useState(createEmptyEditForm);
  const [editAadhaarBlocked, setEditAadhaarBlocked] = useState(false);
  const [editAadhaarWarning, setEditAadhaarWarning] = useState("");

  const makePhoneCall = (phoneNumber: string) => {
    const phoneUrl = `tel:${phoneNumber}`;
    Linking.openURL(phoneUrl).catch(() => {
      showToast("error", "Call unavailable", "Unable to make phone call.");
    });
  };

  const openEditModal = () => {
    if (!customer) return;
    setEditForm({
      numericalId: customer.numericalId?.toString() || "",
      name: customer.name,
      phone: customer.phone,
      aadhar: customer.aadhar,
      locationDesc: customer.locationDesc || "",
      coName: customer.coName || "",
      coId: customer.coId?.toString() || "",
      latitude: typeof customer.latitude === "number" ? String(customer.latitude) : "",
      longitude: typeof customer.longitude === "number" ? String(customer.longitude) : "",
      aadharSubmitted: customer.aadharSubmitted === true,
      passportPhotoSubmitted: customer.passportPhotoSubmitted === true,
      loanAmount: loan ? loan.principalAmount.toString() : "",
      loanStartDate: loan ? formatDateInput(loan.startDate) : formatDateInput(Date.now()),
      loanDisbursementMode: loan ? (loan.disbursement_mode ?? loan.disbursementMode ?? "CASH") : "CASH",
    });
    setEditCoordinateError("");
    setEditLocationStatus("");
    setEditAadhaarBlocked(false);
    setEditAadhaarWarning("");
    setEditOpen(true);
  };

  const openMoveVillageModal = async () => {
    if (!customer || !user) return;
    try {
      const list = await getVillages(user.uid);
      const filtered = list.filter((v) => v.id !== customer.villageId);
      setVillagesList(filtered);
      setTargetVillageId("");
      setNewNumericalIdPreview(null);
      setMoveVillageOpen(true);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to load villages list.");
    }
  };

  const handleSelectTargetVillage = async (villageId: string) => {
    if (!user) return;
    setTargetVillageId(villageId);
    try {
      const nextId = await getNextNumericalId(user.uid, villageId);
      setNewNumericalIdPreview(nextId);
    } catch (err) {
      console.error(err);
      setNewNumericalIdPreview(null);
    }
  };

  const confirmMoveVillage = async () => {
    if (!customer || !user || !targetVillageId) return;
    try {
      setIsMovingVillage(true);
      await moveCustomerToVillage(user.uid, customer.id, targetVillageId);
      const targetVillage = villagesList.find(v => v.id === targetVillageId);
      const targetName = targetVillage ? targetVillage.name : "new village";
      
      Alert.alert(
        "Moved Successfully", 
        `Moved ${customer.name} to ${targetName}.\nNew Book No. is ${newNumericalIdPreview}.`
      );
      setMoveVillageOpen(false);
      router.replace("/(02)/shift-selection");
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Failed to move customer.");
    } finally {
      setIsMovingVillage(false);
    }
  };

  const updateEditAadhaar = useCallback(async (text: string) => {
    const normalized = text.replace(/\D/g, "").slice(0, 12);
    setEditForm(prev => ({ ...prev, aadhar: normalized }));
    setEditAadhaarBlocked(false);
    setEditAadhaarWarning("");
    if (normalized.length === 12) {
      const blocked = await isAadhaarBlocked(normalized, user?.uid);
      setEditAadhaarBlocked(blocked);
      setEditAadhaarWarning(blocked ? "This Aadhaar is blocked. Customer edits cannot be saved with this number." : "");
    }
  }, [user?.uid]);

  // Function to open Google Maps with customer location
  const openGoogleMaps = () => {
    if (!hasCustomerCoordinates(customer)) {
      showToast("info", "Location missing", "Customer location is not available.");
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}`;
    Linking.openURL(url).catch(() => {
      showToast("error", "Maps unavailable", "Unable to open maps.");
    });
  };

  // Function to update customer location in edit modal
  const updateEditLocation = async () => {
    if (!customer || customer.id !== activeCustomerId) {
      setEditCoordinateError("Customer is still loading. Try again in a moment.");
      return;
    }
    const requestId = locationRequestRef.current + 1;
    const requestCustomerId = customer.id;
    locationRequestRef.current = requestId;
    setIsUpdatingLocation(true);
    setEditCoordinateError("");
    setEditLocationStatus("");
    try {
      const coordinates = await requestCurrentCoordinates((quickCoordinates) => {
        if (locationRequestRef.current !== requestId) return;
        setEditForm(prev => ({
          ...prev,
          latitude: quickCoordinates.latitude.toFixed(6),
          longitude: quickCoordinates.longitude.toFixed(6),
        }));
      });
      if (
        locationRequestRef.current !== requestId ||
        requestCustomerId !== activeCustomerId ||
        customer.id !== requestCustomerId
      ) {
        return;
      }
      setEditForm(prev => ({
        ...prev,
        latitude: coordinates.latitude.toFixed(6),
        longitude: coordinates.longitude.toFixed(6),
      }));
      setEditCoordinateError("");
      setEditLocationStatus("Current location ready. Save changes to update this customer.");
    } catch (error) {
      const message = getLocationErrorMessage(error);
      setEditCoordinateError(`${message}. Retry or enter coordinates manually.`);
      setEditLocationStatus("");
    } finally {
      if (locationRequestRef.current === requestId) {
        setIsUpdatingLocation(false);
      }
    }
  };

  const toggleDocumentSubmitted = async (field: "aadharSubmitted" | "passportPhotoSubmitted") => {
    if (!customer) return;
    const updatedCustomer: Customer = {
      ...customer,
      [field]: !customer[field],
    };
    await updateCustomer(updatedCustomer);
    setCustomer(updatedCustomer);
  };

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const logDebug = useCallback(async (message: string, extra: any = {}) => {
    console.log(`[DEBUG] ${message}`, extra);
    const isError = message.toLowerCase().includes("fail") || 
                    message.toLowerCase().includes("error") || 
                    extra?.error || 
                    extra?.isError;
    if (!isError) return;
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      await addDoc(collection(db, "debugLogs"), {
        timestamp: Date.now(),
        message,
        profileCustomerId: activeCustomerId,
        ...extra
      });
    } catch (e) {
      console.error("Failed to write debug log", e);
    }
  }, [activeCustomerId]);

  const reload = useCallback(async (options?: { showLoading?: boolean; skipAutoDue?: boolean; forceRefresh?: boolean }) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    await logDebug("profile reload start", {
      userUid: user?.uid || null,
      userProfileRole: userProfile?.role || null,
      effectiveOwnerId,
      activeCustomerId,
      isOwner
    });

    if (!user || !activeCustomerId || !effectiveOwnerId) {
      await logDebug("profile reload early exit", {
        hasUser: !!user,
        hasCustomerId: !!activeCustomerId,
        hasEffectiveOwnerId: !!effectiveOwnerId
      });
      console.log('Missing user or customerId:', { user: !!user, customerId: activeCustomerId });
      setCustomer(null);
      setLoan(null);
      setPayments([]);
      setNestedTransactions([]);
      setIsLoading(false);
      return;
    }
    const showLoading = options?.showLoading !== false;
    const forceRefresh = options?.forceRefresh === true;
    try {
      if (showLoading) setIsLoading(true);
      setLoadError(null);
      await logDebug("profile loading initial data", { activeCustomerId });
      let [c, l, p, nt] = await Promise.all([
        getCustomerById(activeCustomerId),
        getActiveLoan(effectiveOwnerId, activeCustomerId, forceRefresh),
        getPaymentsForCustomer(effectiveOwnerId, activeCustomerId, forceRefresh),
        isOwner ? Promise.resolve([]) : getNestedTransactionsForCustomer(user.uid, activeCustomerId),
      ]);
      await logDebug("profile initial data loaded", {
        hasCustomer: !!c,
        hasLoan: !!l,
        paymentsCount: p.length,
        txnsCount: nt.length
      });

      if (!c && !isOwner) {
        await logDebug("profile fetching nested customer", { activeCustomerId });
        const nestedCustSnap = await getDoc(doc(db, "nestedCustomers", activeCustomerId));
        if (nestedCustSnap.exists()) {
          const nestedCustData = nestedCustSnap.data();
          c = {
            ...nestedCustData,
            id: activeCustomerId,
            userId: nestedCustData.masterUserId,
            isTemp: true,
            numericalId: nestedCustData.numericalId || 999999,
          } as any;
          await logDebug("profile nested customer found", {
            name: c.name,
            userId: c.userId
          });
        } else {
          await logDebug("profile nested customer not found");
        }
      }
      if (loadRequestRef.current !== requestId || (c && activeCustomerId !== c.id)) {
        await logDebug("profile load request mismatch or id change", {
          currentRef: loadRequestRef.current,
          requestId,
          customerId: c?.id || null
        });
        return;
      }
      if (c && c.userId !== effectiveOwnerId) {
        await logDebug("profile owner mismatch error", {
          customerOwnerId: c.userId,
          effectiveOwnerId
        });
        throw new Error("Customer does not belong to the active user.");
      }
      let freshPayments = p;
      if (!options?.skipAutoDue && l && isOwner) {
        try {
          await checkAndAutoMarkDues(effectiveOwnerId, [l]);
          freshPayments = await getPaymentsForCustomer(effectiveOwnerId, activeCustomerId);
        } catch {
          // Non-critical: ignore silently
        }
      }
      if (loadRequestRef.current !== requestId) return;
      setCustomer(c);
      setLoan(l || null);
      setPayments(freshPayments);
      setNestedTransactions(nt);
    } catch (error: any) {
      if (loadRequestRef.current !== requestId) return;
      await logDebug("profile reload catch error", {
        errorName: error?.name || null,
        errorMessage: error?.message || null,
        errorStack: error?.stack || null
      });
      console.error('Error loading customer details:', error);
      setLoadError(error?.message || String(error));
      setCustomer(null);
      setLoan(null);
      setPayments([]);
      setNestedTransactions([]);
    } finally {
      if (loadRequestRef.current === requestId && showLoading) {
        setIsLoading(false);
      }
    }
  }, [activeCustomerId, user, effectiveOwnerId, isOwner, logDebug]);

  useEffect(() => {
    loadRequestRef.current += 1;
    locationRequestRef.current += 1;
    setCustomer(null);
    setLoan(null);
    setPayments([]);
    setEditOpen(false);
    setEditForm(createEmptyEditForm());
    setEditCoordinateError("");
    setEditLocationStatus("");
    setIsUpdatingLocation(false);
    setLoadError(null);
    setIsLoading(true);
  }, [activeCustomerId]);
  
  // On initial load, load the recipient UPI ID from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem("agent_upi_id").then((id) => {
      if (id) setAgentUpiId(id);
    });
  }, []);

  const saveUpiId = async (id: string) => {
    setAgentUpiId(id);
    await AsyncStorage.setItem("agent_upi_id", id);
  };

  // Load and reload on dependency changes
  useEffect(() => {
    if (authLoading || !user || !activeCustomerId || !effectiveOwnerId) return;
    reload({ forceRefresh: false });
  }, [authLoading, activeCustomerId, user, effectiveOwnerId, reload]);

  useFocusEffect(useCallback(() => {
    // Wait for Firebase Auth to resolve before fetching
    if (authLoading) return;
    reload({ forceRefresh: false });
  }, [authLoading, reload]));

  useEffect(() => {
    if (renew === "true" && loan) {
      setRenewOpen(true);
    }
  }, [renew, loan]);

  const creditSummary = useMemo(() => calculateCreditScore(payments, loan), [loan, payments]);

  const paidThisWeekAmount = useMemo(() => {
    const weekStartMs = weekStart(Date.now());
    const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
    return payments
      .filter((p) => {
        const pDate = p.paymentDate;
        if (!pDate) return false;
        return (p.paymentType === "REGULAR" || p.type === "REGULAR" || p.paymentType === "CASH" || p.paymentType === "PHONE" || p.type === "CASH" || p.type === "PHONE") &&
          pDate >= weekStartMs && pDate < weekEndMs;
      })
      .reduce((sum, p) => sum + Number(p.amountPaid || p.amount || 0), 0);
  }, [payments]);

  const customerInsights = useMemo(() => {
    const regular = payments.filter((payment) => payment.paymentType === "REGULAR");
    const dues = payments.filter((payment) => payment.paymentType === "DUE");
    const totalPaid = regular.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const averagePayment = regular.length ? totalPaid / regular.length : 0;
    const lastPayment = regular[0]?.paymentDate ? new Date(regular[0].paymentDate).toLocaleDateString() : "No payments yet";
    const dueRate = payments.length ? dues.length / payments.length : 0;
    const behavior = dueRate >= 0.3
      ? "Delays payments frequently"
      : dueRate > 0
        ? "Occasional delay pattern"
        : "Clean payment behavior";
    return {
      totalPaid,
      averagePayment,
      dueCount: dues.length,
      lastPayment,
      behavior,
    };
  }, [payments]);

  const localLoan = useMemo(() => {
    if (!loan) {
      if ((customer as any)?.isTemp) {
        const principal = Number((customer as any).principal || 10000);
        const interest = principal * 0.20;
        const totalPayable = principal + interest;
        const pendingSum = nestedTransactions
          .filter((t) => t.type === "payment" || t.type === "regular" || t.type === "CASH" || t.type === "PHONE")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const balanceAmount = Math.max(0, totalPayable - pendingSum);
        return {
          id: `temp_loan_${customer.id}`,
          customerId: activeCustomerId,
          principalAmount: principal,
          interestAmount: interest,
          totalPayable: totalPayable,
          balanceAmount: balanceAmount,
          userId: effectiveOwnerId,
          startDate: customer.createdAt,
          status: balanceAmount <= 0 ? "CLOSED" as const : "ACTIVE" as const,
          disbursement_mode: ((customer as any).disbursementMode || "CASH") as PaymentMode,
          disbursementMode: ((customer as any).disbursementMode || "CASH") as PaymentMode,
          isTemp: true,
        };
      }
      return null;
    }
    if (isOwner) return loan;

    const activeDisbursement = nestedTransactions.find(t => t.type === "RENEWAL_DISBURSEMENT");
    if (activeDisbursement) {
      const principal = activeDisbursement.amount;
      const interest = principal * 0.20;
      const totalPayable = principal + interest;
      const paymentsAfterRenewal = nestedTransactions
        .filter(t => t.date > activeDisbursement.date && (t.type === "payment" || t.type === "regular" || t.type === "CASH" || t.type === "PHONE"))
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const balanceAmount = Math.max(0, totalPayable - paymentsAfterRenewal);
      return {
        id: `temp_loan_${activeDisbursement.id}`,
        customerId: activeCustomerId,
        principalAmount: principal,
        interestAmount: interest,
        totalPayable: totalPayable,
        balanceAmount: balanceAmount,
        userId: effectiveOwnerId,
        startDate: activeDisbursement.date,
        status: balanceAmount <= 0 ? "CLOSED" as const : "ACTIVE" as const,
        disbursement_mode: (activeDisbursement.notes.includes("PHONE") ? "PHONE" : "CASH") as PaymentMode,
        disbursementMode: (activeDisbursement.notes.includes("PHONE") ? "PHONE" : "CASH") as PaymentMode,
        isTemp: true,
      };
    }

    const pendingSum = nestedTransactions
      .filter((t) => t.type === "payment" || t.type === "regular" || t.type === "CASH" || t.type === "PHONE")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const balanceAmount = Math.max(0, loan.balanceAmount - pendingSum);
    return {
      ...loan,
      balanceAmount,
      status: balanceAmount <= 0 ? "CLOSED" as const : loan.status,
    };
  }, [loan, nestedTransactions, isOwner, customer, activeCustomerId, effectiveOwnerId]);

  const mappedNestedPayments = useMemo(() => {
    return nestedTransactions.map((nt) => {
      let pType: "REGULAR" | "DUE" | "RENEWAL_CLOSURE" | "RENEWAL_DISBURSEMENT" = "REGULAR";
      if (nt.type === "RENEWAL_CLOSURE") pType = "RENEWAL_CLOSURE";
      else if (nt.type === "RENEWAL_DISBURSEMENT") pType = "RENEWAL_DISBURSEMENT";
      else if (nt.type === "DUE") pType = "DUE";

      return {
        id: nt.id,
        loanId: nt.loanId || loan?.id || "",
        customerId: nt.customerId,
        amountPaid: nt.amount,
        paymentDate: nt.date,
        paymentMode: nt.type === "PHONE" || nt.notes.includes("PHONE") || nt.notes.toLowerCase().includes("phone") ? "PHONE" as const : "CASH" as const,
        paymentType: pType,
        notes: nt.notes || "",
        isPendingSync: true,
      };
    });
  }, [nestedTransactions, loan?.id]);

  const repaymentProgress = useMemo(() => {
    if (!localLoan?.totalPayable) return { paid: 0, percent: 0 };
    const paid = Math.max(0, localLoan.totalPayable - localLoan.balanceAmount);
    return {
      paid,
      percent: Math.min((paid / localLoan.totalPayable) * 100, 100),
    };
  }, [localLoan]);

  const disbursementMode = (localLoan?.disbursement_mode ?? localLoan?.disbursementMode ?? "CASH") as PaymentMode;

  const paymentTimeline = useMemo(() => {
    if (!localLoan || !customer) return [] as { index: number; date: number; status: "paid" | "overdue" | "upcoming"; amount: number }[];
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    const toStartOfDay = (ts: number) => {
      const d = new Date(toMillis(ts));
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };

    const customerCycleStartDay = getOrDeriveCycleStartDay(customer, localLoan.startDate);
    const paidByWeek = new Map<number, number>();
    const explicitDueWeeks = new Set<number>();

    const combinedBasePayments = [...payments, ...mappedNestedPayments];

    combinedBasePayments
      .filter((p: any) => p.loanId === localLoan.id)
      .forEach((p: any) => {
        const weekIndex = getPersonalCycleWeekIndex(p.paymentDate, localLoan.startDate, customerCycleStartDay);

        if (p.paymentType === "DUE" || p.type === "DUE") {
          explicitDueWeeks.add(weekIndex);
        } else if (p.paymentType === "REGULAR" || p.type === "REGULAR" || p.paymentType === "CASH" || p.paymentType === "PHONE" || p.type === "CASH" || p.type === "PHONE") {
          paidByWeek.set(weekIndex, (paidByWeek.get(weekIndex) ?? 0) + Number(p.amountPaid || 0));
        }
      });

    const now = Date.now();
    const loanStartCycleStart = getPersonalCycleStartTs(localLoan.startDate + 7 * 24 * 60 * 60 * 1000, customerCycleStartDay);
    const completedWeeks = Math.max(0, Math.floor((now - loanStartCycleStart) / oneWeek));
    const maxPaidWeekIndex = paidByWeek.size > 0 ? Math.max(...paidByWeek.keys()) : 0;
    const totalWeeks = Math.max(12, completedWeeks + 1, maxPaidWeekIndex + 1);

    return Array.from({ length: totalWeeks }, (_, index) => {
      const date = loanStartCycleStart + index * oneWeek;
      const amount = paidByWeek.get(index) ?? 0;
      const weekDeadline = date + oneWeek;
      let status: "paid" | "overdue" | "upcoming";
      if (amount > 0) {
        status = "paid";
      } else if (explicitDueWeeks.has(index) || weekDeadline < now) {
        status = "overdue";
      } else {
        status = "upcoming";
      }
      return { index, date, amount, status };
    });
  }, [localLoan, payments, mappedNestedPayments, customer]);

  const displayedPayments = useMemo(() => {
    const combinedBasePayments = [...payments, ...mappedNestedPayments];
    if (!localLoan || !customer) return combinedBasePayments;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const customerCycleStartDay = getOrDeriveCycleStartDay(customer, localLoan.startDate);
    const paidByWeek = new Map<number, number>();
    
    combinedBasePayments
      .filter((p: any) => p.loanId === localLoan.id && (p.paymentType === "REGULAR" || p.type === "REGULAR" || p.paymentType === "CASH" || p.paymentType === "PHONE"))
      .forEach((p: any) => {
        const weekIndex = getPersonalCycleWeekIndex(p.paymentDate, localLoan.startDate, customerCycleStartDay);
        paidByWeek.set(weekIndex, (paidByWeek.get(weekIndex) ?? 0) + Number(p.amountPaid || 0));
      });
      
    const explicitDueWeekIndices = new Set<number>();
    combinedBasePayments
      .filter((p: any) => p.loanId === localLoan.id && (p.paymentType === "DUE" || p.type === "DUE"))
      .forEach((p: any) => {
        const weekIndex = getPersonalCycleWeekIndex(p.paymentDate, localLoan.startDate, customerCycleStartDay);
        explicitDueWeekIndices.add(weekIndex);
      });

    const loanStartCycleStart = getPersonalCycleStartTs(localLoan.startDate + 7 * 24 * 60 * 60 * 1000, customerCycleStartDay);
    const completedWeeks = Math.max(0, Math.floor((now - loanStartCycleStart) / oneWeek));
    const injectedDues: any[] = [];
    
    for (let i = 0; i < completedWeeks; i++) {
      const weekStartDate = loanStartCycleStart + i * oneWeek;
      const amount = paidByWeek.get(i) ?? 0;
      const isAutoOverdue = amount === 0;
      const hasExplicitDue = explicitDueWeekIndices.has(i);
      
      if (isAutoOverdue && !hasExplicitDue) {
        injectedDues.push({
          id: `auto-due-${i}`,
          loanId: localLoan.id,
          customerId: localLoan.customerId,
          amountPaid: 0,
          paymentDate: weekStartDate,
          weekNumber: i + 1,
          paymentType: "DUE",
          paymentMode: "CASH",
          type: "DUE",
          userId: localLoan.userId,
          isAutoInjected: true,
          isAutoDue: true,
        });
      }
    }
    
    const filteredPayments = combinedBasePayments.filter((p: any) => {
      if (p.paymentType !== "DUE" && p.type !== "DUE") return true;
      if (p.loanId !== localLoan.id) return true;
      const wIdx = getPersonalCycleWeekIndex(p.paymentDate, localLoan.startDate, customerCycleStartDay);
      return (paidByWeek.get(wIdx) ?? 0) === 0;
    });

    const combined = [...filteredPayments, ...injectedDues];
    return combined.sort((a, b) => b.paymentDate - a.paymentDate);
  }, [localLoan, payments, mappedNestedPayments, customer]);

  const { currentLoanPayments, previousLoanPayments } = useMemo(() => {
    const combinedBasePayments = [...payments, ...mappedNestedPayments];
    if (!localLoan) return { currentLoanPayments: displayedPayments, previousLoanPayments: [] };
    const current: any[] = [];
    const previous: any[] = [];

    displayedPayments.forEach((p: any) => {
      const isBeforeLoanStart = p.paymentDate && p.paymentDate < (localLoan.startDate - 24 * 60 * 60 * 1000);
      const isExplicitPriorLoan = p.loanId && p.loanId !== localLoan.id;
      if (isExplicitPriorLoan || isBeforeLoanStart) {
        previous.push(p);
      } else {
        current.push(p);
      }
    });

    combinedBasePayments.forEach((p: any) => {
      const isBeforeLoanStart = p.paymentDate && p.paymentDate < (localLoan.startDate - 24 * 60 * 60 * 1000);
      const isExplicitPriorLoan = p.loanId && p.loanId !== localLoan.id;
      if (isExplicitPriorLoan || isBeforeLoanStart) {
        if (!previous.some((existing) => existing.id === p.id)) {
          previous.push(p);
        }
      }
    });

    return { 
      currentLoanPayments: current.sort((a, b) => b.paymentDate - a.paymentDate), 
      previousLoanPayments: previous.sort((a, b) => b.paymentDate - a.paymentDate) 
    };
  }, [displayedPayments, localLoan, payments, mappedNestedPayments]);

  const sendWhatsAppReminder = useCallback(() => {
    if (!customer) return;
    const digits = customer.phone.replace(/\D/g, "");
    if (!digits) {
      Alert.alert("Missing phone", "This customer does not have a valid phone number.");
      return;
    }
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    const weeklyAmount = getSuggestedPaymentAmount(localLoan as Loan ?? undefined);
    
    const totalPaid = payments
      .filter((p) => p.paymentType === "REGULAR")
      .reduce((sum, p) => sum + Number(p.amountPaid || 0), 0);
      
    const reminderMsg = `Hi ${customer.name}, this is a payment reminder. Please pay this week's amount Rs.${Math.round(weeklyAmount).toLocaleString("en-IN")} ASAP.`;
    
    const disbursed = localLoan ? localLoan.principalAmount - Math.floor(localLoan.principalAmount / 1000) * 20 : 0;
    const statementMsg = `*Karthikeya Finance - Account Statement* 📖\n` +
      `------------------------------------\n` +
      `*Customer:* ${customer.name}\n` +
      `*Book No:* ${customer.numericalId}\n` +
      `*Aadhar:* ${customer.aadhar || "-"}\n` +
      `*Principal:* Rs. ${Math.round(loan?.principalAmount ?? 0).toLocaleString("en-IN")}\n` +
      `*Disbursed Cash:* Rs. ${Math.round(disbursed).toLocaleString("en-IN")}\n` +
      `*Total Paid:* Rs. ${Math.round(totalPaid).toLocaleString("en-IN")}\n` +
      `*Outstanding Balance:* Rs. ${Math.round(loan?.balanceAmount ?? 0).toLocaleString("en-IN")}\n` +
      `*Credit Score:* ${creditSummary.score} (${creditSummary.band})\n` +
      `------------------------------------\n` +
      `Status: ${loan?.status || "NO ACTIVE LOAN"}\n` +
      `Thank you! 🙏`;

    Alert.alert(
      "Share Options",
      "Choose what you want to share with this customer:",
      [
        {
          text: "Send Payment Reminder",
          onPress: () => {
            Linking.openURL(`https://wa.me/${normalized}?text=${encodeURIComponent(reminderMsg)}`).catch(() => {
              Alert.alert("WhatsApp unavailable", "Could not open WhatsApp.");
            });
          }
        },
        {
          text: "Send Passbook Statement",
          onPress: () => {
            Linking.openURL(`https://wa.me/${normalized}?text=${encodeURIComponent(statementMsg)}`).catch(() => {
              Alert.alert("WhatsApp unavailable", "Could not open WhatsApp.");
            });
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  }, [customer, loan, payments, creditSummary]);

  const sharePaymentReceipt = useCallback((payment: any) => {
    if (!customer) return;
    const dateStr = new Date(payment.paymentDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const message = `*Karthikeya Finance - Payment Receipt* 🧾\n` +
      `------------------------------------\n` +
      `*Customer:* ${customer.name}\n` +
      `*Book No:* ${customer.numericalId}\n` +
      `*Date:* ${dateStr}\n` +
      `*Amount Paid:* Rs. ${Math.round(payment.amountPaid).toLocaleString("en-IN")}\n` +
      `*Mode:* ${payment.paymentMode === "PHONE" ? "PhonePe 📱" : "Cash 💵"}\n` +
      `*Outstanding Balance:* Rs. ${Math.round(loan?.balanceAmount ?? 0).toLocaleString("en-IN")}\n` +
      `------------------------------------\n` +
      `Thank you for your payment! 🙏`;
      
    const digits = customer.phone.replace(/\D/g, "");
    if (!digits) {
      Alert.alert("Missing phone", "This customer does not have a valid phone number.");
      return;
    }
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    Linking.openURL(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`).catch(() => {
      Alert.alert("WhatsApp unavailable", "Could not open WhatsApp.");
    });
  }, [customer, loan]);

  const exportLedger = useCallback(() => {
    if (!customer) return;
    const opened = openCustomerLedgerPrint(customer, loan, payments);
    if (!opened) {
      Alert.alert("PDF Export", "Printable ledger export is available from the web dashboard.");
    }
  }, [customer, loan, payments]);

  const confirmPayment = async () => {
    Keyboard.dismiss();
    if (isPaymentSaving || paymentSavingRef.current) return;
    if (!loan) return;
    const parsedDate = parseDateInput(paymentDateInput);
    if (!parsedDate) {
      setPaymentDateError("Enter date as YYYY-MM-DD");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPaymentDateError("Enter a valid payment amount");
      return;
    }
    const activeLoan = localLoan || loan;
    if (activeLoan && parsedAmount > activeLoan.balanceAmount) {
      setPaymentDateError(`Amount cannot exceed outstanding balance of Rs.${Math.round(activeLoan.balanceAmount)}`);
      return;
    }
    setPaymentDateError("");
    const finalDate = (toStartOfDay(parsedDate) === toStartOfDay(Date.now())) ? Date.now() : toStartOfDay(parsedDate);
    
    const proceed = async () => {
      try {
        paymentSavingRef.current = true;
        setIsPaymentSaving(true);
        if (!isOwner) {
          await addNestedTransaction({
            ownerUid: effectiveOwnerId!,
            nestedUid: user.uid,
            nestedEmail: user.email || "",
            customerId: activeCustomerId,
            customerName: customer?.name || "Customer",
            amount: parsedAmount,
            type: "payment",
            date: finalDate,
            notes: `Regular payment via ${mode}`,
          });
        } else {
          await addPayment(loan, parsedAmount, finalDate, mode);
        }
        setPayOpen(false);
        setAmount("");
        const activeLoanObj = localLoan || loan;
        const newBal = activeLoanObj ? activeLoanObj.balanceAmount - parsedAmount : 0;
        if (newBal <= 0) {
          if (Platform.OS === "web") {
            if (isOwner) {
              const choice = window.confirm(
                `${customer?.name || "Customer"} has fully paid their loan.\n\nClick OK to go to Renew\nClick Cancel to Close account`
              );
              if (!choice) {
                await closeCustomer(activeCustomerId, user.uid);
              }
            } else {
              Alert.alert("Loan Fully Paid", `${customer?.name || "Customer"} has fully paid their loan.`);
            }
          } else {
            const action = await new Promise((resolve) => {
              const buttons = [
                { text: "Continue (Renew later)", onPress: () => resolve("keep") },
                { text: "Cancel", style: "cancel" as any, onPress: () => resolve("cancel") },
              ];
              if (isOwner) {
                buttons.unshift({ text: "Close Account", style: "destructive" as any, onPress: () => resolve("close") });
              }
              Alert.alert(
                "Loan Fully Paid",
                `${customer?.name || "Customer"} fully paid. What now?`,
                buttons
              );
            });
            if (action === "close" && isOwner) {
              await closeCustomer(activeCustomerId, user.uid);
            }
          }
        }
        await reload({ showLoading: false, skipAutoDue: true, forceRefresh: true });
      } catch {
        setPaymentDateError("Payment failed. Please try again.");
      } finally {
        paymentSavingRef.current = false;
        setIsPaymentSaving(false);
      }
    };

    if (paidThisWeekAmount > 0) {
      const msg = `${customer?.name || "Customer"} has already paid Rs.${paidThisWeekAmount} this week. Do you want to enter this additional amount of Rs.${parsedAmount}?`;
      if (Platform.OS === "web") {
        if (window.confirm(msg)) {
          await proceed();
        }
      } else {
        Alert.alert("Already Paid Today", msg, [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm", onPress: proceed },
        ]);
      }
    } else {
      await proceed();
    }
  };

  const closePaymentModal = () => {
    if (isPaymentSaving) return;
    Keyboard.dismiss();
    setPayOpen(false);
    setAmount("");
    setPaymentDateError("");
    setPaymentDateInput(formatDateInput(Date.now()));
  };

  const confirmDue = async () => {
    Keyboard.dismiss();
    if (!loan) return;
    const parsedDate = parseDateInput(dueDateInput);
    if (!parsedDate) {
      setDueDateError("Enter date as YYYY-MM-DD");
      return;
    }
    setDueDateError("");
    const finalDate = (toStartOfDay(parsedDate) === toStartOfDay(Date.now())) ? Date.now() : toStartOfDay(parsedDate);
    await markDue(loan, finalDate);
    setDueOpen(false);
    await reload({ showLoading: false, skipAutoDue: true, forceRefresh: true });
  };

  const closeDueModal = () => {
    Keyboard.dismiss();
    setDueOpen(false);
    setDueDateError("");
    setDueDateInput(formatDateInput(Date.now()));
  };

  // Payment edit handlers
  const openEditPaymentModal = (payment: any) => {
    setEditingPayment(payment);
    setEditPaymentAmount(payment.amountPaid.toString());
    setEditPaymentDate(formatDateInput(payment.paymentDate));
    setEditPaymentMode(payment.paymentMode);
    setEditPaymentError("");
    setEditPaymentOpen(true);
  };

  const closeEditPaymentModal = () => {
    Keyboard.dismiss();
    setEditPaymentOpen(false);
    setEditingPayment(null);
    setEditPaymentAmount("");
    setEditPaymentError("");
    setEditPaymentDate(formatDateInput(Date.now()));
    setShowEditPaymentPicker(false);
  };

  const confirmEditPayment = async () => {
    Keyboard.dismiss();
    if (!editingPayment || isSavingPaymentEdit) return;
    
    const parsedDate = parseDateInput(editPaymentDate);
    if (!parsedDate) {
      setEditPaymentError("Enter date as YYYY-MM-DD");
      return;
    }
    const parsedAmount = Number(editPaymentAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setEditPaymentError("Enter a valid amount");
      return;
    }
    setEditPaymentError("");

    const finalDate = (toStartOfDay(parsedDate) === toStartOfDay(Date.now())) ? Date.now() : toStartOfDay(parsedDate);
    const oldAmount = money(editingPayment.amountPaid);
    const balanceDiff = oldAmount - parsedAmount;

    try {
      setIsSavingPaymentEdit(true);
      if (editingPayment.isPendingSync) {
        await updateNestedTransaction(editingPayment.id, parsedAmount, editPaymentMode);
        setNestedTransactions((prev) =>
          prev.map((t) =>
            t.id === editingPayment.id
              ? { ...t, amount: parsedAmount, date: finalDate, notes: editPaymentMode }
              : t
          )
        );
      } else {
        await updatePayment(editingPayment, parsedAmount, finalDate, editPaymentMode);
        setPayments((prev) =>
          prev
            .map((payment) =>
              payment.id === editingPayment.id
                ? { ...payment, amountPaid: parsedAmount, paymentDate: finalDate, paymentMode: editPaymentMode, type: editPaymentMode }
                : payment
            )
            .sort((a, b) => toMillis(b.paymentDate) - toMillis(a.paymentDate))
        );
        if (loan) {
          const newBalance = Math.max(0, loan.balanceAmount + balanceDiff);
          setLoan({
            ...loan,
            balanceAmount: newBalance,
            status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
          });
        }
      }
      closeEditPaymentModal();
      showToast("success", "Payment updated", "Payment changes were saved.");
    } catch (error: any) {
      console.error("Payment update failed:", error);
      await logDebug("confirmEditPayment failed", {
        errorName: error?.name || null,
        errorMessage: error?.message || null,
        errorStack: error?.stack || null,
        paymentId: editingPayment.id,
        isPendingSync: !!editingPayment.isPendingSync
      });
      setEditPaymentError(error?.message || "Payment update failed. Please try again.");
    } finally {
      setIsSavingPaymentEdit(false);
    }
  };

  // Payment delete handlers
  const openDeletePaymentConfirm = (payment: any) => {
    setDeletingPayment(payment);
    setDeletePaymentConfirmOpen(true);
  };

  const closeDeletePaymentConfirm = () => {
    setDeletePaymentConfirmOpen(false);
    setDeletingPayment(null);
  };

  // Combined edit confirm handler
  const confirmEdit = async () => {
    if (!customer || !user || isSavingEdit) return;
    if (customer.id !== activeCustomerId) {
      setEditCoordinateError("Customer changed while editing. Reopen this customer and try again.");
      return;
    }

    const normalizedAadhar = editForm.aadhar ? editForm.aadhar.replace(/\D/g, "").trim() : "";
    const parsedLatitude = parseCoordinateInput(editForm.latitude, -90, 90);
    const parsedLongitude = parseCoordinateInput(editForm.longitude, -180, 180);
    if (parsedLatitude === null || parsedLongitude === null) {
      setEditCoordinateError("Enter valid coordinates. Latitude must be -90 to 90 and longitude -180 to 180.");
      return;
    }
    if ((parsedLatitude === undefined) !== (parsedLongitude === undefined)) {
      setEditCoordinateError("Enter both latitude and longitude, or leave both empty.");
      return;
    }
    const newNumericalId = Number(editForm.numericalId);
    if (isNaN(newNumericalId) || newNumericalId <= 0 || !Number.isInteger(newNumericalId)) {
      setEditCoordinateError("Customer ID (Book No) must be a valid positive integer.");
      return;
    }

    setEditCoordinateError("");
    setEditLocationStatus("");

    try {
      setIsSavingEdit(true);

      if (newNumericalId !== customer.numericalId) {
        const isTaken = await isNumericalIdTaken(effectiveOwnerId!, customer.villageId, newNumericalId);
        if (isTaken) {
          Alert.alert("Customer ID Taken", `Customer ID (Book No) ${newNumericalId} is already taken in this village.`);
          setIsSavingEdit(false);
          return;
        }
      }

      if (normalizedAadhar) {
        const [blocked, existingCustomer] = await Promise.all([
          isAadhaarBlocked(normalizedAadhar, user.uid),
          getCustomerByAadhar(user.uid, normalizedAadhar, customer.id),
        ]);
        if (blocked) {
          setEditAadhaarBlocked(true);
          setEditAadhaarWarning("This Aadhaar is blocked. Customer edits cannot be saved with this number.");
          Alert.alert("Aadhaar Blocked", "This Aadhaar card has been blocked. Customer registration cannot proceed.");
          setIsSavingEdit(false);
          return;
        }
        if (existingCustomer && existingCustomer.id !== customer.id) {
          Alert.alert(
            'Duplicate Aadhar Detected',
            `A customer with this Aadhar number already exists in our records.\n\nExisting Customer: ${existingCustomer.name}\nPhone: ${existingCustomer.phone}\nBook No: ${existingCustomer.numericalId}\n\nPlease verify the Aadhar number or contact the existing customer.`,
            [{ text: 'OK', style: 'default' }]
          );
          setIsSavingEdit(false);
          return;
        }
      }
      
      const updatedCustomer = {
        ...customer,
        numericalId: newNumericalId,
        name: editForm.name,
        phone: editForm.phone,
        aadhar: normalizedAadhar,
        locationDesc: editForm.locationDesc,
        coName: editForm.coName,
        coId: editForm.coId ? Number(editForm.coId) : undefined,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        aadharSubmitted: editForm.aadharSubmitted,
        passportPhotoSubmitted: editForm.passportPhotoSubmitted,
      };

      const parsedDate = loan ? parseDateInput(editForm.loanStartDate) : null;
      const loanUpdates = loan && parsedDate
        ? {
            principalAmount: Number(editForm.loanAmount || 0),
            startDate: parsedDate,
            disbursementMode: editForm.loanDisbursementMode as PaymentMode,
          }
        : undefined;

      const saved = await updateCustomerAndLoan(updatedCustomer, loan, loanUpdates);
      setCustomer(saved.customer);
      if (saved.loan) setLoan(saved.loan);
      setEditOpen(false);
      showToast("success", "Saved", "Customer and loan details were updated.");
    } catch (error: any) {
      console.error("Customer edit failed:", error);
      Alert.alert("Save failed", error?.message || "Could not save customer details. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDeletePayment = async () => {
    if (!deletingPayment) return;
    const paymentToDelete = deletingPayment;
    const isDue = paymentToDelete.paymentType === "DUE" || paymentToDelete.type === "DUE";
    try {
      if (paymentToDelete.isPendingSync) {
        await deleteNestedTransaction(paymentToDelete.id);
        setNestedTransactions((prev) => prev.filter((t) => t.id !== paymentToDelete.id));
      } else {
        if (isDue) {
          await deleteDuePayment(paymentToDelete);
        } else {
          await deletePayment(paymentToDelete);
        }
        setPayments((prev) => prev.filter((payment) => payment.id !== paymentToDelete.id));
        if (loan && loan.id === paymentToDelete.loanId && !isDue && money(paymentToDelete.amountPaid) > 0) {
          const newBalance = loan.balanceAmount + money(paymentToDelete.amountPaid);
          setLoan({
            ...loan,
            balanceAmount: newBalance,
            status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
          });
        }
      }
      closeDeletePaymentConfirm();
      showToast("success", "Payment removed", "The payment entry was deleted.");
    } catch (error: any) {
      console.error("Delete payment failed:", error);
      await logDebug("confirmDeletePayment failed", {
        errorName: error?.name || null,
        errorMessage: error?.message || null,
        errorStack: error?.stack || null,
        paymentId: paymentToDelete.id,
        isPendingSync: !!paymentToDelete.isPendingSync
      });
      Alert.alert("Delete failed", error?.message || "Could not delete the payment.");
    }
  };

  return (
    <AnimatedScreen style={styles.root}>
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.loadingText}>Loading customer details...</Text>
          </View>
        )}
        {!isLoading && loadError && (
          <View style={styles.errorContainer}>
            <Icon name="alert-circle" size={32} color={colors.missedRed} style={{marginBottom: 8}} />
            <Text style={styles.errorTitle}>Failed to Load Details</Text>
            <Text style={styles.errorMessage}>{loadError}</Text>
            <Pressable style={styles.backBtn} onPress={() => reload({ showLoading: true })}>
              <Text style={styles.backBtnText}>↻ Retry</Text>
            </Pressable>
            <Pressable style={[styles.backBtn, { marginTop: 8 }]} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>← Go Back</Text>
            </Pressable>
          </View>
        )}
        {!isLoading && !loadError && !customer && (
          <View style={styles.errorContainer}>
            <Icon name="warning" size={32} color={colors.missedRed} style={{marginBottom: 8}} />
            <Text style={styles.errorTitle}>No Customer Found</Text>
            <Text style={styles.errorMessage}>Unable to find this customer in records.</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>← Go Back</Text>
            </Pressable>
          </View>
        )}
        {!isLoading && customer && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
            {/* Header Card */}
            <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.profileHeaderTop}>
                <CustomerIdBadge numericalId={customer.numericalId} id={customer.id} />
                <Text style={[styles.headerName, { color: colors.primary }]}>{customer?.name ? (language === "te" ? translateTelugu(customer.name) : customer.name) : "Profile"}</Text>
              </View>
              {!!customer && (
                <View style={styles.headerInfo}>
                  <View style={styles.headerInfoRow}>
                    <Icon name="person" size={18} color={colors.blue2} style={{marginRight: 8}} />
                    <Text style={[styles.headerText, { color: colors.textSecondary }]}>Book No: {String(customer.numericalId).padStart(2, "0")}</Text>
                  </View>
                  <View style={styles.headerInfoRow}>
                    <PhoneLink number={customer.phone} textStyle={[styles.headerText, styles.phoneLink, { color: colors.primary }]} />
                  </View>
                  <View style={styles.headerInfoRow}>
                    <Icon name="id-card" size={18} color={colors.blue2} style={{marginRight: 8}} />
                    <Text style={[styles.headerText, { color: colors.textSecondary }]}>Aadhar: {customer.aadhar}</Text>
                  </View>
                  <View style={styles.headerInfoRow}>
                    <Icon name="checkmark" size={18} color={colors.blue2} style={{marginRight: 8}} />
                    <Text style={[styles.headerText, { color: colors.textSecondary }]}>
                      Docs: {customer.aadharSubmitted ? "Aadhar" : "Aadhar pending"} | {customer.passportPhotoSubmitted ? "Photo" : "Photo pending"}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={[styles.docsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.docsHeaderRow}>
                <Text style={[styles.docsTitle, { color: colors.primary }]}>Customer Documents</Text>
                <Text style={[styles.docsStatusText, customer.aadharSubmitted && customer.passportPhotoSubmitted ? styles.docsStatusComplete : styles.docsStatusPending]}>
                  {customer.aadharSubmitted && customer.passportPhotoSubmitted ? "Complete" : "Pending"}
                </Text>
              </View>
              <Pressable style={[styles.docsDetailRow, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={() => toggleDocumentSubmitted("aadharSubmitted")}>
                <View style={[styles.docsDetailCheckbox, { backgroundColor: colors.card, borderColor: colors.border }, customer.aadharSubmitted && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {customer.aadharSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                </View>
                <Text style={[styles.docsDetailText, { color: colors.text }]}>Aadhar submitted</Text>
              </Pressable>
              <Pressable style={[styles.docsDetailRow, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={() => toggleDocumentSubmitted("passportPhotoSubmitted")}>
                <View style={[styles.docsDetailCheckbox, { backgroundColor: colors.card, borderColor: colors.border }, customer.passportPhotoSubmitted && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {customer.passportPhotoSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                </View>
                <Text style={[styles.docsDetailText, { color: colors.text }]}>Passport photo submitted</Text>
              </Pressable>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CIBIL SCORE</Text>
                <View style={styles.scoreContainer}>
                  <Text style={[styles.scoreValue, { color: colors.primary }]}>{creditSummary.score}</Text>
                  <Text style={[styles.scoreRating, { color: creditSummary.score >= 700 ? colors.success : colors.warning }]}>{creditSummary.band}</Text>
                </View>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CURRENT BALANCE</Text>
                <Text style={[styles.balanceValue, { color: colors.primary }]}>Rs.{localLoan?.balanceAmount?.toFixed(2) ?? "0.00"}</Text>
              </View>
            </View>

            {localLoan ? (
              <>
                <View style={[styles.repaymentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.repaymentHeader}>
                    <Text style={[styles.repaymentLabel, { color: colors.textSecondary }]}>
                      Rs.{Math.round(repaymentProgress.paid).toLocaleString("en-IN")} paid of Rs.{Math.round(localLoan.totalPayable).toLocaleString("en-IN")}
                    </Text>
                    <Text style={styles.repaymentPercent}>{repaymentProgress.percent.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.repaymentTrack}>
                    <View
                      style={[
                        styles.repaymentFill,
                        {
                          width: `${repaymentProgress.percent}%`,
                          backgroundColor: repaymentProgress.percent >= 100 ? "#00D4AA" : repaymentProgress.percent > 50 ? "#6C63FF" : "#FFB347",
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={[styles.disbursementRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.disbursementLabel, { color: colors.textSecondary }]}>Disbursed via:</Text>
                  <Text
                    style={[
                      styles.disbursementBadge,
                      { backgroundColor: disbursementMode === "PHONE" ? "#5F259F" : "#1565C0" },
                    ]}
                  >
                    {disbursementMode === "PHONE" ? "PhonePe" : "Cash"}
                  </Text>
                </View>

                <View style={[styles.disbursementRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.disbursementLabel, { color: colors.textSecondary }]}>Loan Taken Date:</Text>
                  <Text style={[styles.disbursementLabel, { color: colors.text, fontWeight: "700" }]}>
                    {new Date(localLoan.startDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </>
            ) : null}

            {localLoan ? (
              <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.timelineTitle, { color: colors.text }]}>Payment Timeline</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineRow}>
                  {paymentTimeline.map((week) => {
                    const circleColor = week.status === "paid" ? "#00C896" : week.status === "overdue" ? "#EF5350" : "#607D8B";
                    return (
                      <Pressable
                        key={week.index}
                        style={styles.timelineItem}
                        onPress={() => setSelectedTimelineWeek(selectedTimelineWeek === week.index ? null : week.index)}
                      >
                        <View
                          style={[
                            styles.timelineCircle,
                            week.status === "upcoming"
                              ? { borderColor: circleColor, backgroundColor: "transparent" }
                              : { borderColor: circleColor, backgroundColor: circleColor },
                          ]}
                        />
                        <Text style={[styles.timelineWeekLabel, { color: colors.textMuted }]}>W{week.index + 1}</Text>
                        {selectedTimelineWeek === week.index ? (
                          <View style={[styles.timelineTooltip, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                            <Text style={[styles.timelineTooltipText, { color: colors.text }]}>
                              Rs.{Math.round(week.amount).toLocaleString("en-IN")}
                            </Text>
                            <Text style={[styles.timelineTooltipDate, { color: colors.textSecondary }]}>
                              {formatPersonalCycleRange(week.date)}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Additional Info */}
            {!!customer && (
              <View style={[styles.infoContainer, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                {(customer.coName || customer.coId) && (
                  <View style={styles.infoRow}>
                    <Icon name="people" size={18} color={colors.blue2} style={{marginRight: 8}} />
                    <Text style={[styles.infoText, { color: colors.text }]}>
                      C/O: {customer.coName || 'N/A'} {customer.coId ? `(ID: ${customer.coId})` : ''}
                    </Text>
                  </View>
                )}
                {customer.locationDesc && (
                  <View style={styles.infoRow}>
                    <Icon name="location" size={18} color={colors.blue2} style={{marginRight: 8}} />
                    <Text style={[styles.infoText, { color: colors.text }]}>{customer.locationDesc}</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.actionGrid}>
              <Pressable
                style={[styles.actionBtn, noTextSelection, { backgroundColor: colors.paidGreen }, !localLoan || (localLoan.balanceAmount <= 0) && styles.actionBtnDisabled]}
                onPress={() => {
                  if (localLoan && localLoan.balanceAmount > 0) {
                    setPaymentDateInput(formatDateInput(Date.now()));
                    setPaymentDateError("");
                    setAmount(localLoan ? getSuggestedPaymentAmount(localLoan as Loan).toString() : "");
                    setPayOpen(true);
                  }
                }}
                disabled={!localLoan || localLoan.balanceAmount <= 0}
              >
                <Icon name="cash" size={20} color={colors.white} style={{marginBottom: 4}} />
                <Text selectable={false} style={styles.actionLabel}>Pay</Text>
              </Pressable>
              {localLoan && localLoan.balanceAmount <= 0 && (
                <Pressable
                  style={[styles.actionBtn, noTextSelection, { backgroundColor: colors.missedRed }]}
                  onPress={() => {
                    Alert.alert(
                      "Loan Fully Paid",
                      `${customer?.name || "Customer"} has no outstanding balance. What would you like to do?`,
                      [
                        ...(isOwner ? [{
                          text: "Close Account",
                          style: "destructive" as const,
                          onPress: async () => {
                            try {
                              await closeCustomer(activeCustomerId, user.uid);
                              showToast("success", "Closed", "Customer account closed.");
                              router.back();
                            } catch {
                              showToast("error", "Failed", "Could not close customer.");
                            }
                          },
                        }] : []),
                        {
                          text: "Renew Loan",
                          onPress: () => setRenewOpen(true),
                        },
                        { text: "Cancel", style: "cancel" as const },
                      ]
                    );
                  }}
                >
                  <Icon name="refresh" size={20} color={colors.white} style={{marginBottom: 4}} />
                  <Text selectable={false} style={styles.actionLabel}>Close/Renew</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.actionBtn, noTextSelection, { backgroundColor: colors.missedRed }]}
                onPress={() => {
                  setDueDateInput(formatDateInput(Date.now()));
                  setDueDateError("");
                  setDueOpen(true);
                }}
              >
                <Icon name="warning" size={20} color={colors.white} style={{marginBottom: 4}} />
                <Text selectable={false} style={styles.actionLabel}>Due</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, noTextSelection, { backgroundColor: colors.amber }, !localLoan && styles.actionBtnDisabled]}
                onPress={() => {
                  if (!localLoan) {
                    showToast("info", "No active loan", "This customer does not have an active loan to renew.");
                    return;
                  }
                  setRenewOpen(true);
                }}
                disabled={!localLoan}
              >
                <Icon name="refresh" size={20} color={colors.white} style={{marginBottom: 4}} />
                <Text selectable={false} style={styles.actionLabel}>Renew</Text>
              </Pressable>
            </View>
            
            <View style={[styles.iconBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {isOwner && (
                <Pressable style={[styles.iconBtn, noTextSelection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={openEditModal}>
                  <Icon name="person" size={21} color={colors.blue2} />
                  <Text selectable={false} style={[styles.iconBtnLabel, { color: colors.primary }]}>Edit</Text>
                </Pressable>
              )}
              {customer && loan && (
                <Pressable
                  style={[styles.iconBtn, noTextSelection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}
                  onPress={() => {
                    setSelectedQrCustomer({ customer, loan });
                    setQrCustomAmount(Math.round(getSuggestedPaymentAmount(loan)).toString());
                  }}
                >
                  <Icon name="qr-code" size={21} color={colors.paidGreen} />
                  <Text selectable={false} style={[styles.iconBtnLabel, { color: colors.primary }]}>UPI QR</Text>
                </Pressable>
              )}
              <Pressable style={[styles.iconBtn, noTextSelection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={exportLedger}>
                <Icon name="download-outline" size={21} color={colors.blue2} />
                <Text selectable={false} style={[styles.iconBtnLabel, { color: colors.primary }]}>Ledger</Text>
              </Pressable>
              <Pressable
                style={[styles.iconBtn, noTextSelection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }, !hasCustomerCoordinates(customer) && styles.iconBtnDisabled]}
                onPress={openGoogleMaps}
                disabled={!hasCustomerCoordinates(customer)}
              >
                <Icon name="location" size={21} color={hasCustomerCoordinates(customer) ? colors.teal : colors.gray} />
                <Text selectable={false} style={[styles.iconBtnLabel, { color: colors.primary }]}>Map</Text>
              </Pressable>
              <Pressable style={[styles.iconBtn, noTextSelection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={openMoveVillageModal}>
                <Icon name="arrow-forward-circle-outline" size={21} color={colors.amber} />
                <Text selectable={false} style={[styles.iconBtnLabel, { color: colors.primary }]}>Move</Text>
              </Pressable>
              {(!isOwner && !(customer as any).isTemp) ? null : (
                <Pressable style={[styles.iconBtn, noTextSelection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={() => setDeleteCustomerConfirmOpen(true)}>
                  <Icon name="trash" size={21} color={colors.missedRed} />
                  <Text selectable={false} style={[styles.iconBtnLabel, styles.iconBtnLabelDanger]}>Delete</Text>
                </Pressable>
              )}
            </View>
            <View style={[styles.customerAnalyticsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.customerAnalyticsHeader}>
                <Text style={[styles.customerAnalyticsTitle, { color: colors.primary }]}>Customer Analytics</Text>
                <Text style={styles.customerBehaviorPill}>{customerInsights.behavior}</Text>
              </View>
              <Text style={[styles.creditScoreSummary, { color: colors.textSecondary }]}>{creditSummary.summary}</Text>
              <View style={styles.customerAnalyticsGrid}>
                <View style={[styles.customerAnalyticsMetric, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                  <Text style={[styles.customerAnalyticsValue, { color: colors.text }]}>Rs.{Math.round(customerInsights.totalPaid).toLocaleString("en-IN")}</Text>
                  <Text style={[styles.customerAnalyticsLabel, { color: colors.textSecondary }]}>Total paid</Text>
                </View>
                <View style={[styles.customerAnalyticsMetric, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                  <Text style={[styles.customerAnalyticsValue, { color: colors.text }]}>Rs.{Math.round(customerInsights.averagePayment).toLocaleString("en-IN")}</Text>
                  <Text style={[styles.customerAnalyticsLabel, { color: colors.textSecondary }]}>Avg payment</Text>
                </View>
                <View style={[styles.customerAnalyticsMetric, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                  <Text style={[styles.customerAnalyticsValue, { color: colors.text }]}>{customerInsights.dueCount}</Text>
                  <Text style={[styles.customerAnalyticsLabel, { color: colors.textSecondary }]}>Due marks</Text>
                </View>
                <View style={[styles.customerAnalyticsMetric, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                  <Text style={[styles.customerAnalyticsValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{customerInsights.lastPayment}</Text>
                <Text style={[styles.customerAnalyticsLabel, { color: colors.textSecondary }]}>Last paid</Text>
                </View>
              </View>
            </View>
            <Text style={[styles.history, { color: colors.white }]}>Transaction History</Text>
            <PaymentHistory 
              payments={currentLoanPayments} 
              customer={customer}
              onEdit={isOwner ? openEditPaymentModal : (payment) => {
                if (payment.isPendingSync || (payment.nestedUid && payment.nestedUid === user?.uid)) {
                  openEditPaymentModal(payment);
                } else {
                  Alert.alert("Permission Denied", "You can only edit payments that you entered.");
                }
              }}
              onDelete={isOwner ? openDeletePaymentConfirm : (payment) => {
                if (payment.isPendingSync || (payment.nestedUid && payment.nestedUid === user?.uid)) {
                  openDeletePaymentConfirm(payment);
                } else {
                  Alert.alert("Permission Denied", "You can only delete payments that you entered.");
                }
              }}
              onShare={sharePaymentReceipt}
            />

            {previousLoanPayments.length > 0 && (
              <>
                <Pressable
                  style={styles.showPrevHistoryBtn}
                  onPress={() => setShowPreviousHistory((prev) => !prev)}
                >
                  <Text style={styles.showPrevHistoryText}>
                    {showPreviousHistory 
                      ? "▲ Hide Previous Loan History" 
                      : `📜 View Previous Loan History (${previousLoanPayments.length} entries)`}
                  </Text>
                </Pressable>

                {showPreviousHistory && (
                  <>
                    <Text style={styles.prevHistoryTitle}>📜 Previous Loan History</Text>
                    <PaymentHistory 
                      payments={previousLoanPayments} 
                      customer={customer}
                      onEdit={isOwner ? openEditPaymentModal : (payment) => {
                        if (payment.isPendingSync || (payment.nestedUid && payment.nestedUid === user?.uid)) {
                          openEditPaymentModal(payment);
                        } else {
                          Alert.alert("Permission Denied", "You can only edit payments that you entered.");
                        }
                      }}
                      onDelete={isOwner ? openDeletePaymentConfirm : (payment) => {
                        if (payment.isPendingSync || (payment.nestedUid && payment.nestedUid === user?.uid)) {
                          openDeletePaymentConfirm(payment);
                        } else {
                          Alert.alert("Permission Denied", "You can only delete payments that you entered.");
                        }
                      }}
                      onShare={sharePaymentReceipt}
                    />
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={payOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Record Payment</Text>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Payment Mode</Text>
            <View style={styles.modeRow}>
              {(["CASH", "PHONE"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[
                    styles.chip,
                    mode === m && styles.chipOn,
                    mode === m && m === "PHONE" && styles.chipPhoneOn,
                  ]}
                >
                  <Text style={mode === m ? styles.chipOnText : styles.chipText}>{m === "PHONE" ? "PhonePe" : "Cash"}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput placeholder="Amount" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]} keyboardType="numeric" />
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={paymentDateInput}
                onChange={(e) => setPaymentDateInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  marginBottom: 12,
                }}
              />
            ) : (
              <>
                <TextInput
                  placeholder="Payment Date (YYYY-MM-DD)"
                  placeholderTextColor={colors.textMuted}
                  value={paymentDateInput}
                  onChangeText={setPaymentDateInput}
                  style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                  autoCapitalize="none"
                />
                {parseDateInput(paymentDateInput) && (
                  <Text style={styles.dayDisplay}>
                    {formatDateWithDay(parseDateInput(paymentDateInput)!)}
                  </Text>
                )}
                <Pressable style={styles.dateBtn} onPress={() => {
                  setTempPaymentDate(new Date(parseDateInput(paymentDateInput) ?? Date.now()));
                  setShowPaymentPicker(true);
                }}>
                  <Text style={styles.dateBtnText}>Pick Payment Date</Text>
                </Pressable>
              </>
            )}
            {showPaymentPicker && (
              <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                <DateTimePicker
                  value={tempPaymentDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
                  themeVariant="light"
                  onChange={(event, selected) => {
                    if (selected) {
                      setTempPaymentDate(selected);
                      // Also update the input field immediately for iOS to show day
                      if (Platform.OS === "ios") {
                        setPaymentDateInput(formatDateInput(selected.getTime()));
                      }
                    }
                    if (Platform.OS === "ios") {
                      if (event.type === "dismissed") {
                        setShowPaymentPicker(false);
                      }
                    } else {
                      if (selected) {
                        setPaymentDateInput(formatDateInput(selected.getTime()));
                      }
                      setShowPaymentPicker(false);
                    }
                  }}
                />
                {Platform.OS === "ios" && (
                  <Pressable style={styles.pickerDoneBtn} onPress={() => {
                    setPaymentDateInput(formatDateInput(tempPaymentDate.getTime()));
                    setShowPaymentPicker(false);
                  }}>
                    <Text style={styles.pickerDoneBtnText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
            {!!paymentDateError && <Text style={styles.errorText}>{paymentDateError}</Text>}
            {paidThisWeekAmount > 0 ? (
              <View style={{ backgroundColor: "#FFF3CD", borderColor: "#FFEBAA", borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: "#856404", fontSize: 13, fontWeight: "600", textAlign: "center" }}>
                  ⚠️ {customer?.name || "Customer"} has already paid Rs.{paidThisWeekAmount} this week. Any new entry will be recorded as an additional payment.
                </Text>
              </View>
            ) : null}
            <Text style={[styles.paymentMode, { color: colors.textSecondary }]}>
              Confirm Rs.{Number(amount || 0).toLocaleString("en-IN")} payment via {mode === "PHONE" ? "PhonePe" : "Cash"}?
            </Text>
            <Pressable
              style={[styles.primary, isPaymentSaving && styles.primaryDisabled]}
              onPress={confirmPayment}
              disabled={isPaymentSaving}
            >
              {isPaymentSaving ? <ActivityIndicator size="small" color={colors.white} /> : null}
              <Text style={styles.primaryText}>{isPaymentSaving ? "Saving..." : "Confirm"}</Text>
            </Pressable>
            <Pressable
              style={[styles.cancelModalBtn, isPaymentSaving && styles.cancelModalBtnDisabled]}
              onPress={closePaymentModal}
              disabled={isPaymentSaving}
            >
              <Text style={styles.cancelModalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={dueOpen} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Mark as Due</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  marginBottom: 12,
                }}
              />
            ) : (
              <>
                <TextInput
                  placeholder="Due Date (YYYY-MM-DD)"
                  placeholderTextColor={colors.textMuted}
                  value={dueDateInput}
                  onChangeText={setDueDateInput}
                  style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                  autoCapitalize="none"
                />
                {parseDateInput(dueDateInput) && (
                  <Text style={styles.dayDisplay}>
                    {formatDateWithDay(parseDateInput(dueDateInput)!)}
                  </Text>
                )}
                <Pressable style={styles.dateBtn} onPress={() => {
                  setTempDueDate(new Date(parseDateInput(dueDateInput) ?? Date.now()));
                  setShowDuePicker(true);
                }}>
                  <Text style={styles.dateBtnText}>Pick Due Date</Text>
                </Pressable>
              </>
            )}
            {showDuePicker && (
              <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                <DateTimePicker
                  value={tempDueDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
                  themeVariant="light"
                  onChange={(event, selected) => {
                    if (selected) {
                      setTempDueDate(selected);
                      // Also update the input field immediately for iOS to show day
                      if (Platform.OS === "ios") {
                        setDueDateInput(formatDateInput(selected.getTime()));
                      }
                    }
                    if (Platform.OS === "ios") {
                      if (event.type === "dismissed") {
                        setShowDuePicker(false);
                      }
                    } else {
                      if (selected) {
                        setDueDateInput(formatDateInput(selected.getTime()));
                      }
                      setShowDuePicker(false);
                    }
                  }}
                />
                {Platform.OS === "ios" && (
                  <Pressable style={styles.pickerDoneBtn} onPress={() => {
                    setDueDateInput(formatDateInput(tempDueDate.getTime()));
                    setShowDuePicker(false);
                  }}>
                    <Text style={styles.pickerDoneBtnText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
            {!!dueDateError && <Text style={styles.errorText}>{dueDateError}</Text>}
            <Pressable
              style={styles.primary}
              onPress={confirmDue}
            >
              <Text style={styles.primaryText}>Mark Due</Text>
            </Pressable>
            <Pressable
              style={styles.cancelModalBtn}
              onPress={closeDueModal}
            >
              <Text style={styles.cancelModalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={renewOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.card, maxHeight: "85%", padding: 0 }]}>
            <ScrollView
              style={{ width: "100%", borderRadius: 16 }}
              contentContainerStyle={{ padding: 20, alignItems: "center", gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>Renew Loan</Text>
              <TextInput placeholder="New Principal Amount" placeholderTextColor={colors.textMuted} value={renewAmount} onChangeText={setRenewAmount} style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]} keyboardType="numeric" />
              
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Renewal Date</Text>
              <TextInput
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.textMuted}
                value={renewDateInput}
                onChangeText={setRenewDateInput}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                autoCapitalize="none"
              />
              {parseDateInput(renewDateInput) && (
                <Text style={styles.dayDisplay}>
                  {formatDateWithDay(parseDateInput(renewDateInput)!)}
                </Text>
              )}
              <Pressable style={styles.dateBtn} onPress={() => {
                setTempRenewDate(new Date(parseDateInput(renewDateInput) ?? Date.now()));
                setShowRenewDatePicker(true);
              }}>
                <Text style={styles.dateBtnText}>Pick Renewal Date</Text>
              </Pressable>

              {showRenewDatePicker && (
                <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                  <DateTimePicker
                    value={tempRenewDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
                    themeVariant="light"
                    onChange={(event, selected) => {
                      if (selected) {
                        setTempRenewDate(selected);
                        if (Platform.OS === "ios") {
                          setRenewDateInput(formatDateInput(selected.getTime()));
                        }
                      }
                      if (Platform.OS === "ios") {
                        if (event.type === "dismissed") {
                          setShowRenewDatePicker(false);
                        }
                      } else {
                        if (selected) {
                          setRenewDateInput(formatDateInput(selected.getTime()));
                        }
                        setShowRenewDatePicker(false);
                      }
                    }}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable style={styles.pickerDoneBtn} onPress={() => {
                      setRenewDateInput(formatDateInput(tempRenewDate.getTime()));
                      setShowRenewDatePicker(false);
                    }}>
                      <Text style={styles.pickerDoneBtnText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {!!renewDateError && <Text style={styles.errorText}>{renewDateError}</Text>}

              <Text style={[styles.sectionLabel, { color: colors.text }]}>Closure Payment Mode</Text>
              <View style={styles.modeRow}>
                {(["CASH", "PHONE"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setRenewMode(m)}
                    style={[
                      styles.chip,
                      renewMode === m && styles.chipOn,
                      renewMode === m && m === "PHONE" && styles.chipPhoneOn,
                    ]}
                  >
                    <Text style={renewMode === m ? styles.chipOnText : styles.chipText}>{m === "PHONE" ? "PhonePe" : "Cash"}</Text>
                  </Pressable>
                ))}
              </View>
              
              {(() => {
                if (!loan || !renewAmount) return null;
                const newPrincipal = Number(renewAmount);
                if (isNaN(newPrincipal) || newPrincipal <= 0) return null;
                const { deduction, disbursed, netToGive } = buildRenewalSummary(newPrincipal, loan.balanceAmount);
                
                return (
                  <View style={{ marginVertical: 12, padding: 12, backgroundColor: colors.surfaceTint, borderRadius: 10, borderWidth: 1, borderColor: colors.border, width: "100%" }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
                      New Disbursed Amount: <Text style={{ fontWeight: "700", color: colors.text }}>Rs.{disbursed.toLocaleString("en-IN")}</Text> (after Rs.{deduction} deduction)
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
                      Old Loan Balance: <Text style={{ fontWeight: "700", color: colors.text }}>Rs.{Math.round(loan.balanceAmount).toLocaleString("en-IN")}</Text>
                    </Text>
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: netToGive >= 0 ? "#059669" : "#dc3545" }}>
                      {netToGive >= 0 ? "Net Cash to Give Customer: " : "Net Cash to Collect: "}
                      Rs.{Math.abs(netToGive).toLocaleString("en-IN")}/-
                    </Text>
                  </View>
                );
              })()}

              <Pressable
                style={[styles.primary, isRenewing && styles.primaryDisabled]}
                disabled={isRenewing}
                onPress={async () => {
                  const activeLoanObj = localLoan || loan;
                  if (!activeLoanObj || isRenewing) return;
                  const newPrincipal = Number(renewAmount);
                  if (isNaN(newPrincipal) || newPrincipal <= 0) {
                    showToast("error", "Invalid amount", "Please enter a valid principal amount.");
                    return;
                  }
                  const renewalDateMs = parseDateInput(renewDateInput);
                  if (!renewalDateMs) {
                    setRenewDateError("Invalid date format. Use DD/MM/YYYY");
                    return;
                  }
                  setRenewDateError("");

                  const { deduction, disbursed, netToGive } = buildRenewalSummary(newPrincipal, activeLoanObj.balanceAmount);
                  const msg =
                    `Please confirm the renewal details:\n\n` +
                    `New Loan: Rs.${newPrincipal.toLocaleString("en-IN")}\n` +
                    `Actual Disbursed: Rs.${disbursed.toLocaleString("en-IN")} (after Rs.${deduction} deduction)\n` +
                    `Less Old Balance: -Rs.${Math.round(activeLoanObj.balanceAmount).toLocaleString("en-IN")}\n\n` +
                    `Net Amount to ${netToGive >= 0 ? "GIVE" : "COLLECT"}: Rs.${Math.abs(netToGive).toLocaleString("en-IN")}/-\n\n` +
                    `Do you want to confirm renewal?`;

                  const confirmed = await confirmRenewal(msg);
                  if (!confirmed) return;

                  try {
                    setIsRenewing(true);
                    if (!isOwner) {
                      // 1. Add RENEWAL_CLOSURE to nestedTransactions (if balance > 0)
                      if (activeLoanObj.balanceAmount > 0) {
                        await addNestedTransaction({
                          ownerUid: effectiveOwnerId!,
                          nestedUid: user.uid,
                          nestedEmail: user.email || "",
                          customerId: activeCustomerId,
                          customerName: customer?.name || "",
                          amount: activeLoanObj.balanceAmount,
                          type: "RENEWAL_CLOSURE",
                          date: renewalDateMs,
                          notes: "Loan renewed - old balance cleared (closure)",
                        });
                      }
                      
                      // 2. Add RENEWAL_DISBURSEMENT to nestedTransactions
                      await addNestedTransaction({
                        ownerUid: effectiveOwnerId!,
                        nestedUid: user.uid,
                        nestedEmail: user.email || "",
                        customerId: activeCustomerId,
                        customerName: customer?.name || "",
                        amount: newPrincipal,
                        type: "RENEWAL_DISBURSEMENT",
                        date: renewalDateMs + 1,
                        notes: `New loan disbursed via renewal (disbursement) | Mode: ${renewMode}`,
                      });
                      
                      setRenewOpen(false);
                      setRenewAmount("");
                      setRenewMode("CASH");
                      setRenewDateInput(formatDateInput(Date.now()));
                      setRenewDateError("");
                      await reload({ showLoading: false, skipAutoDue: true, forceRefresh: true });
                      showToast("success", "Loan renewed", "Renewal recorded successfully.");
                    } else {
                      const createdLoan = await renewLoan(activeLoanObj as Loan, newPrincipal, renewalDateMs, renewMode);
                      setLoan(createdLoan);
                      setRenewOpen(false);
                      setRenewAmount("");
                      setRenewMode("CASH");
                      setRenewDateInput(formatDateInput(Date.now()));
                      setRenewDateError("");
                      await reload({ showLoading: false, skipAutoDue: true, forceRefresh: true });
                      showToast("success", "Loan renewed", "The loan was renewed successfully.");
                    }
                  } catch (error: any) {
                    console.error("Renewal failed:", error);
                    showToast("error", "Renewal failed", error?.message || "Could not renew the loan. Please try again.");
                  } finally {
                    setIsRenewing(false);
                  }
                }}
              >
                <Text style={styles.primaryText}>{isRenewing ? "Renewing..." : "Renew Now"}</Text>
              </Pressable>
              
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => {
                  setRenewOpen(false);
                  setRenewAmount("");
                  setRenewMode("CASH");
                  setRenewDateInput(formatDateInput(Date.now()));
                  setRenewDateError("");
                }}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      <Modal visible={editOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Customer & Loan</Text>
            
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Customer Section */}
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>Customer Details</Text>
              
              <TextInput
                placeholder="Customer ID (Book No)"
                placeholderTextColor={colors.textMuted}
                value={editForm.numericalId}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, numericalId: text }))}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                keyboardType="numeric"
              />

              <TextInput
                placeholder="Customer Name"
                placeholderTextColor={colors.textMuted}
                value={editForm.name}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, name: text }))}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />
              
              <TextInput
                placeholder="Phone Number"
                placeholderTextColor={colors.textMuted}
                value={editForm.phone}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, phone: text }))}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                keyboardType="phone-pad"
              />
              
              <TextInput
                placeholder="Aadhar Number"
                placeholderTextColor={colors.textMuted}
                value={editForm.aadhar}
                onChangeText={updateEditAadhaar}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: editAadhaarBlocked ? colors.error : colors.border, color: colors.text }]}
                keyboardType="numeric"
                maxLength={12}
              />
              {editAadhaarWarning ? <Text style={[styles.errorText, { color: colors.error }]}>{editAadhaarWarning}</Text> : null}

              <TextInput
                placeholder="Location Description"
                placeholderTextColor={colors.textMuted}
                value={editForm.locationDesc}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, locationDesc: text }))}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />

              {/* Location Update Section */}
              <View style={[styles.locationUpdateSection, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                <Text style={[styles.locationLabel, { color: colors.text }]}>Customer Coordinates</Text>
                {editForm.latitude.trim() && editForm.longitude.trim() ? (
                  <Text style={[styles.locationCoords, { color: colors.success }]}>
                    <Icon name="location" size={12} color={colors.textSecondary} /> {editForm.latitude.trim()}, {editForm.longitude.trim()}
                  </Text>
                ) : (
                  <Text style={[styles.locationNotSet, { color: colors.textMuted }]}>No location set</Text>
                )}
                <View style={styles.coordinateRow}>
                  <TextInput
                    placeholder="Latitude"
                    placeholderTextColor={colors.textMuted}
                    value={editForm.latitude}
                    onChangeText={(text) => {
                      setEditForm(prev => ({ ...prev, latitude: text }));
                      setEditCoordinateError("");
                      setEditLocationStatus("");
                    }}
                    style={[styles.input, styles.coordinateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                  />
                  <TextInput
                    placeholder="Longitude"
                    placeholderTextColor={colors.textMuted}
                    value={editForm.longitude}
                    onChangeText={(text) => {
                      setEditForm(prev => ({ ...prev, longitude: text }));
                      setEditCoordinateError("");
                      setEditLocationStatus("");
                    }}
                    style={[styles.input, styles.coordinateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                  />
                </View>
                <Text style={[styles.coordinateHint, { color: colors.textSecondary }]}>Enter coordinates manually, or use current device location.</Text>
                {editCoordinateError ? <Text style={styles.errorText}>{editCoordinateError}</Text> : null}
                {editLocationStatus ? <Text style={styles.successText}>{editLocationStatus}</Text> : null}
                <Pressable 
                  style={[styles.updateLocationBtn, isUpdatingLocation && styles.updateLocationBtnDisabled]} 
                  onPress={updateEditLocation}
                  disabled={isUpdatingLocation}
                >
                  {isUpdatingLocation ? <ActivityIndicator size="small" color={colors.white} /> : null}
                  <Text style={styles.updateLocationBtnText}>
                    {isUpdatingLocation ? 'Getting Location...' : editForm.latitude.trim() ? 'Update Location' : 'Set Location'}
                  </Text>
                </Pressable>
              </View>
              
              <TextInput
                placeholder="C/O Name"
                placeholderTextColor={colors.textMuted}
                value={editForm.coName}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, coName: text }))}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />
              
              <TextInput
                placeholder="C/O ID"
                placeholderTextColor={colors.textMuted}
                value={editForm.coId}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, coId: text }))}
                style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                keyboardType="numeric"
              />

              {/* Loan Section */}
              {loan && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.primary }]}>Loan Details</Text>
                  
                  <TextInput
                    placeholder="Loan Amount (Principal)"
                    placeholderTextColor={colors.textMuted}
                    value={editForm.loanAmount}
                    onChangeText={(text) => setEditForm(prev => ({ ...prev, loanAmount: text }))}
                    style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                    keyboardType="numeric"
                  />
                  
                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 8, marginBottom: 6 }]}>Disbursement Mode</Text>
                  <View style={[styles.modeRow, { marginBottom: 12 }]}>
                    {(["CASH", "PHONE"] as const).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setEditForm(prev => ({ ...prev, loanDisbursementMode: m }))}
                        style={[
                          styles.chip,
                          editForm.loanDisbursementMode === m && styles.chipOn,
                          editForm.loanDisbursementMode === m && m === "PHONE" && styles.chipPhoneOn,
                        ]}
                      >
                        <Text style={editForm.loanDisbursementMode === m ? styles.chipOnText : styles.chipText}>
                          {m === "PHONE" ? "PhonePe" : "Cash"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  
                  {/* Date Picker Section */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Loan Start Date</Text>
                  {Platform.OS === "web" ? (
                    <input
                      type="date"
                      value={editForm.loanStartDate}
                      onChange={(e) => {
                        setEditForm(prev => ({ ...prev, loanStartDate: e.target.value }));
                        setEditLoanDateError("");
                      }}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#ddd",
                        marginBottom: 8,
                        fontSize: 16,
                      }}
                    />
                  ) : (
                    <>
                      <Pressable
                        style={styles.datePickerButton}
                        onPress={() => {
                          const parsed = parseDateInput(editForm.loanStartDate);
                          setTempEditLoanDate(new Date(parsed ?? Date.now()));
                          setShowEditLoanDatePicker(true);
                        }}
                      >
                        <Text style={styles.datePickerButtonText}>
                          {formatDateWithDay(parseDateInput(editForm.loanStartDate) || Date.now())}
                        </Text>
                      </Pressable>
                      
                      {showEditLoanDatePicker && (
                        <DateTimePicker
                          value={tempEditLoanDate}
                          mode="date"
                          display="default"
                          onChange={(event: any, date?: Date) => {
                            setShowEditLoanDatePicker(false);
                            if (date) {
                              setEditForm(prev => ({ ...prev, loanStartDate: formatDateInput(date.getTime()) }));
                              setEditLoanDateError("");
                            }
                          }}
                        />
                      )}
                    </>
                  )}
                  {editLoanDateError ? (
                    <Text style={styles.errorText}>{editLoanDateError}</Text>
                  ) : null}
                </>
              )}
              
              <View style={styles.modalButtons}>
                <Pressable style={styles.cancelModalBtn} onPress={() => setEditOpen(false)}>
                  <Text style={styles.cancelModalBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.primary, editAadhaarBlocked && { opacity: 0.55 }, isSavingEdit && styles.primaryDisabled]} onPress={confirmEdit} disabled={editAadhaarBlocked || isSavingEdit}>
                  <Text style={styles.primaryText}>{isSavingEdit ? "Saving..." : "Save Changes"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal visible={editPaymentOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Payment</Text>
            <TextInput 
              placeholder="Amount" 
              placeholderTextColor={colors.textMuted}
              value={editPaymentAmount} 
              onChangeText={setEditPaymentAmount} 
              style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              keyboardType="numeric" 
            />
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={editPaymentDate}
                onChange={(e) => setEditPaymentDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  marginBottom: 12,
                }}
              />
            ) : (
              <>
                <TextInput
                  placeholder="Payment Date (YYYY-MM-DD)"
                  value={editPaymentDate}
                  onChangeText={setEditPaymentDate}
                  style={styles.input}
                  autoCapitalize="none"
                />
                {parseDateInput(editPaymentDate) && (
                  <Text style={styles.dayDisplay}>
                    {formatDateWithDay(parseDateInput(editPaymentDate)!)}
                  </Text>
                )}
                <Pressable style={styles.dateBtn} onPress={() => {
                  setTempEditPaymentDate(new Date(parseDateInput(editPaymentDate) ?? Date.now()));
                  setShowEditPaymentPicker(true);
                }}>
                  <Text style={styles.dateBtnText}>Pick Payment Date</Text>
                </Pressable>
              </>
            )}
            {editPaymentError ? <Text style={styles.errorText}>{editPaymentError}</Text> : null}
            
            {showEditPaymentPicker && (
              <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                <DateTimePicker
                  value={tempEditPaymentDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, date) => {
                    if (date) {
                      setTempEditPaymentDate(date);
                      if (Platform.OS !== "ios") {
                        setEditPaymentDate(formatDateInput(date.getTime()));
                        setShowEditPaymentPicker(false);
                      }
                    }
                  }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    style={styles.pickerDoneBtn}
                    onPress={() => {
                      setEditPaymentDate(formatDateInput(tempEditPaymentDate.getTime()));
                      setShowEditPaymentPicker(false);
                    }}
                  >
                    <Text style={styles.pickerDoneBtnText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
            
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, editPaymentMode === "CASH" && styles.modeBtnActive]}
                onPress={() => setEditPaymentMode("CASH")}
              >
                <Text style={[styles.modeText, editPaymentMode === "CASH" && styles.modeTextActive]}>Cash</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, editPaymentMode === "PHONE" && styles.modeBtnActive]}
                onPress={() => setEditPaymentMode("PHONE")}
              >
                <Text style={[styles.modeText, editPaymentMode === "PHONE" && styles.modeTextActive]}>Phone</Text>
              </Pressable>
            </View>
            
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelModalBtn} onPress={closeEditPaymentModal}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primary, isSavingPaymentEdit && styles.primaryDisabled]} onPress={confirmEditPayment} disabled={isSavingPaymentEdit}>
                <Text style={styles.primaryText}>{isSavingPaymentEdit ? "Saving..." : "Save Changes"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Payment Confirmation Modal */}
      <Modal visible={deletePaymentConfirmOpen} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { maxHeight: 200 }]}>
            <Text style={styles.modalTitle}>
              {deletingPayment?.paymentType === "DUE" || deletingPayment?.type === "DUE" ? "Delete Due Entry" : "Delete Payment"}
            </Text>
            <Text style={{ marginBottom: 20, textAlign: "center" }}>
              {deletingPayment?.paymentType === "DUE" || deletingPayment?.type === "DUE"
                ? "Delete this due entry? This removes only the DUE mark and will not change the loan balance."
                : `Are you sure you want to delete this payment of Rs.${deletingPayment?.amountPaid?.toFixed(2)}? This will restore the loan balance.`}
            </Text>
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelModalBtn} onPress={closeDeletePaymentConfirm}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primary, { backgroundColor: colors.missedRed }]} onPress={confirmDeletePayment}>
                <Text style={styles.primaryText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Customer Confirmation Modal */}
      <Modal visible={deleteCustomerConfirmOpen} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { maxHeight: 220 }]}>
            <Text style={styles.modalTitle}>Delete Customer</Text>
            <Text style={{ marginBottom: 20, textAlign: "center" }}>
              Are you sure you want to delete {customer?.name ? (language === "te" ? translateTelugu(customer.name) : customer.name) : ""}?
              {'\n\n'}
              This will permanently delete the customer and all their loan/payment records.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable 
                style={styles.cancelModalBtn} 
                onPress={() => setDeleteCustomerConfirmOpen(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.primary, { backgroundColor: colors.missedRed }]} 
                onPress={async () => {
                  if (!customer || !user) return;
                  setIsDeletingCustomer(true);
                  try {
                    if ((customer as any).isTemp) {
                      const { deleteDoc, doc: docRef } = await import("firebase/firestore");
                      await deleteDoc(docRef(db, "nestedCustomers", customer.id));
                    } else {
                      await deleteCustomer(user.uid, customer.id);
                    }
                    setDeleteCustomerConfirmOpen(false);
                    router.back();
                  } catch {
                    Alert.alert('Error', 'Failed to delete customer. Please try again.');
                  } finally {
                    setIsDeletingCustomer(false);
                  }
                }}
                disabled={isDeletingCustomer}
              >
                <Text style={styles.primaryText}>
                  {isDeletingCustomer ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move Customer to Another Village Modal */}
      <Modal visible={moveVillageOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Move Customer to Another Village</Text>
            
            <Text style={{ marginBottom: 10, fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
              Select a target village for <Text style={{ fontWeight: '700', color: colors.text }}>{customer?.name ? (language === "te" ? translateTelugu(customer.name) : customer.name) : ""}</Text>.
              {'\n'}
              Current Book No: <Text style={{ fontWeight: '700', color: colors.text }}>{customer?.numericalId}</Text>
            </Text>

            <View style={{ flex: 1, maxHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
              <ScrollView style={{ backgroundColor: colors.surfaceTint }} nestedScrollEnabled={true}>
                {villagesList.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>No other villages available.</Text>
                  </View>
                ) : (
                  villagesList.map((v) => (
                    <Pressable
                      key={v.id}
                      style={[
                        styles.dropdownItem,
                        targetVillageId === v.id && styles.dropdownItemActive
                      ]}
                      onPress={() => handleSelectTargetVillage(v.id)}
                    >
                      <Text style={[
                        styles.dropdownItemText,
                        targetVillageId === v.id && styles.dropdownItemTextActive
                      ]}>
                        {v.name} ({v.dayOfWeek} - {v.shift})
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>

            {targetVillageId ? (
              <View style={{ marginBottom: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.success, fontWeight: '700' }}>
                  New Book No: {newNumericalIdPreview !== null ? String(newNumericalIdPreview).padStart(2, "0") : "Loading..."}
                </Text>
              </View>
            ) : null}

            <View style={styles.modalButtons}>
              <Pressable 
                style={styles.cancelModalBtn} 
                onPress={() => setMoveVillageOpen(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.primary, (!targetVillageId || isMovingVillage) && { opacity: 0.5 }]} 
                onPress={confirmMoveVillage}
                disabled={!targetVillageId || isMovingVillage}
              >
                <Text style={styles.primaryText}>
                  {isMovingVillage ? 'Moving...' : 'Move Customer'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Surprise UPI Payment QR Code Modal */}
      <Modal
        visible={selectedQrCustomer !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedQrCustomer(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.qrModalContent, { backgroundColor: "#1E293B", borderColor: "#334155" }]}>
            <View style={styles.qrModalHeader}>
              <Text style={[styles.qrModalTitle, { color: "#FFFFFF" }]}>Collect Payment via UPI QR</Text>
              <Pressable style={styles.qrCloseBtn} onPress={() => setSelectedQrCustomer(null)}>
                <Icon name="close" size={24} color="#94A3B8" />
              </Pressable>
            </View>

            {selectedQrCustomer && (() => {
              const suggestedVal = Math.round(getSuggestedPaymentAmount(selectedQrCustomer.loan));
              const activeQrAmount = Number(qrCustomAmount) > 0 ? Number(qrCustomAmount) : suggestedVal;

              return (
                <ScrollView contentContainerStyle={styles.qrModalScroll}>
                  <Text style={[styles.qrCustName, { color: "#38BDF8" }]}>
                    {selectedQrCustomer.customer.name}
                  </Text>
                  
                  {/* Editable Payment Amount */}
                  <View style={[styles.qrAmountContainer, { backgroundColor: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.3)", borderWidth: 1 }]}>
                    <Text style={[styles.qrAmountLabel, { color: "#94A3B8" }]}>Payment Amount (Editable)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: "#0F172A", borderColor: "#22C55E", color: "#4ADE80", fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 6, width: 180, borderRadius: 10 }]}
                      value={qrCustomAmount}
                      onChangeText={setQrCustomAmount}
                      keyboardType="numeric"
                      placeholder="Amount"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  {/* QR Code Image */}
                  <View style={styles.qrImageContainer}>
                    <Image
                      source={{
                        uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                          `upi://pay?pa=${agentUpiId.trim()}&pn=KarthikeyaFinance&am=${activeQrAmount}&cu=INR&tn=${encodeURIComponent(`Finance Payment - ${selectedQrCustomer.customer.name}`)}`
                        )}`,
                      }}
                      style={styles.qrImage}
                      contentFit="contain"
                    />
                  </View>

                  {/* UPI ID Settings Input */}
                  <View style={styles.upiInputSection}>
                    <Text style={[styles.upiInputLabel, { color: "#CBD5E1" }]}>
                      Recipient UPI ID (to receive payment):
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: "#0F172A", borderColor: "#475569", color: "#FFFFFF", marginTop: 6 }]}
                      value={agentUpiId}
                      onChangeText={saveUpiId}
                      placeholder="Enter UPI ID (e.g. name@paytm)"
                      placeholderTextColor="#64748B"
                      autoCapitalize="none"
                    />
                  </View>

                  {/* UPI Link Display & Copy */}
                  <Pressable
                    style={styles.copyLinkBtn}
                    onPress={async () => {
                      const link = `upi://pay?pa=${agentUpiId.trim()}&pn=KarthikeyaFinance&am=${activeQrAmount}&cu=INR&tn=Payment`;
                      await Clipboard.setString(link);
                      showToast("success", "UPI Link Copied", "UPI Payment URL copied to clipboard.");
                    }}
                  >
                    <Icon name="copy-outline" size={14} color={colors.primary} />
                    <Text style={[styles.copyLinkText, { color: colors.primary }]}>Copy UPI URI Link</Text>
                  </Pressable>

                  {/* Log / Record Payment Button directly inside modal */}
                  <View style={styles.qrPayButtonsRow}>
                    <Pressable
                      style={[styles.qrPayBtn, { backgroundColor: "#0ABFBC" }]}
                      onPress={() => {
                        setSelectedQrCustomer(null);
                        setAmount(activeQrAmount.toString());
                        setMode("CASH");
                        setPayOpen(true);
                      }}
                    >
                      <Text style={styles.qrPayBtnText}>Paid Cash (Rs.{activeQrAmount})</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.qrPayBtn, { backgroundColor: "#5F259F" }]}
                      onPress={() => {
                        setSelectedQrCustomer(null);
                        setAmount(activeQrAmount.toString());
                        setMode("PHONE");
                        setPayOpen(true);
                      }}
                    >
                      <Text style={styles.qrPayBtnText}>Paid PhonePe (Rs.{activeQrAmount})</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

    </LinearGradient>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  content: { width: "100%", maxWidth: Math.min(Dimensions.get("window").width - 32, 430), alignSelf: "center", gap: 12 },
  
  // Header Card Styles
  headerCard: { backgroundColor: colors.white, borderRadius: 18, padding: 16, borderWidth: 1, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  profileHeaderTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  headerName: { color: colors.blue2, fontSize: 20, fontWeight: '700', flex: 1 },
  headerInfo: { gap: 8 },
  headerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 14, width: 20 },
  headerText: { color: '#555', fontSize: 13 },
  phoneLink: { color: colors.blue2, textDecorationLine: 'underline' },
  
  // Stats Row Styles
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  statLabel: { color: '#888', fontSize: 10, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  scoreContainer: { alignItems: 'center' },
  scoreValue: { color: colors.blue2, fontSize: 24, fontWeight: '700' },
  scoreRating: { color: colors.success, fontSize: 11, fontWeight: '500', marginTop: 2 },
  balanceValue: { color: colors.blue2, fontSize: 18, fontWeight: '700', marginTop: 2 },
  repaymentCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  repaymentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  repaymentLabel: { flex: 1, fontSize: 12, fontWeight: "700" },
  repaymentPercent: { color: "#00D4AA", fontSize: 13, fontWeight: "900" },
  repaymentTrack: { height: 10, backgroundColor: "#2A2A3E", borderRadius: 5, overflow: "hidden" },
  repaymentFill: { height: "100%", borderRadius: 5 },
  timelineCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  timelineTitle: { fontSize: 14, fontWeight: "900" },
  timelineRow: { gap: 10, paddingVertical: 4 },
  timelineItem: { width: 48, minHeight: 72, alignItems: "center" },
  timelineCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  timelineWeekLabel: { fontSize: 10, fontWeight: "800", marginTop: 5 },
  timelineTooltip: { position: "absolute", top: 42, minWidth: 74, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, zIndex: 2 },
  timelineTooltipText: { fontSize: 11, fontWeight: "900", textAlign: "center" },
  timelineTooltipDate: { fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 2 },
  
  // Info Section Styles
  infoContainer: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  infoIcon: { fontSize: 14, width: 20 },
  infoText: { color: colors.white, fontSize: 13, flex: 1 },
  docsCard: { backgroundColor: colors.white, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  docsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  docsTitle: { color: colors.blue2, fontSize: 14, fontWeight: "900" },
  docsStatusText: { fontSize: 11, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  docsStatusComplete: { color: "#047857", backgroundColor: "#d1fae5" },
  docsStatusPending: { color: "#b45309", backgroundColor: "#fef3c7" },
  docsDetailRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#eef4ff", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#dbeafe" },
  docsDetailCheckbox: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderWidth: 1, borderColor: "#bfdbfe" },
  docsDetailCheckboxOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  docsDetailText: { color: colors.ink, fontSize: 13, fontWeight: "800", flex: 1 },
  
  // Action Grid Styles (2x2)
  actionGrid: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, minHeight: 74, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  actionBtnDisabled: { opacity: 0.45 },
  actionIcon: { fontSize: 24 },
  actionLabel: { color: colors.white, fontSize: 13, fontWeight: '600' },
  
  // Icon Bar Styles
  iconBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: 18, padding: 8, borderWidth: 1, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  iconBtn: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center', marginHorizontal: 3, gap: 3, borderWidth: 1, borderColor: '#dbeafe' },
  iconBtnDisabled: { backgroundColor: '#f0f0f0', opacity: 0.5 },
  iconBtnLabel: { color: colors.blue2, fontSize: 10, fontWeight: "800" },
  iconBtnLabelDanger: { color: colors.missedRed },
  iconBtnIcon: { fontSize: 18 },
  customerAnalyticsCard: { backgroundColor: colors.white, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  customerAnalyticsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  customerAnalyticsTitle: { color: colors.blue2, fontSize: 15, fontWeight: "900" },
  customerBehaviorPill: { color: "#047857", backgroundColor: "#d1fae5", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden", fontSize: 10, fontWeight: "900" },
  creditScoreSummary: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  customerAnalyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  customerAnalyticsMetric: { flex: 1, minWidth: "45%", backgroundColor: "#f8fafc", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  customerAnalyticsValue: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  customerAnalyticsLabel: { color: colors.gray, fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginTop: 3 },
  
  // Old styles (keeping for compatibility)
  title: { color: colors.white, fontSize: 26, fontWeight: "700" },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 14, color: colors.blue2, fontWeight: "700" },
  info: { color: colors.white, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 12 },
  phoneLinkOld: { color: "#4FC3F7", textDecorationLine: "underline" },
  row: { flexDirection: "row", gap: 10 },
  action: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
  actionTxt: { color: colors.white, fontWeight: "800" },
  outline: { borderWidth: 1, borderColor: colors.white, borderRadius: 14, padding: 12, alignItems: "center" },
  outlineText: { color: colors.white, fontWeight: "700" },
  delete: { color: "#ffd6d6", textAlign: "center" },
  editBtn: { backgroundColor: colors.white, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 2, borderColor: colors.amber },
  editBtnText: { color: colors.blue2, fontWeight: "700" },
  editLoanBtn: { borderWidth: 1, borderColor: colors.amber, borderRadius: 14, padding: 12, alignItems: "center", backgroundColor: colors.amber },
  editLoanBtnText: { color: colors.white, fontWeight: "700" },
  inputLabel: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 4 },
  datePreview: { fontSize: 12, color: "#666", fontStyle: "italic", marginBottom: 8 },
  modalScroll: { maxHeight: 600 },
  sectionLabel: { fontSize: 14, fontWeight: "700", color: colors.blue2, marginTop: 16, marginBottom: 8 },
  docsEditSection: { backgroundColor: "#f8fafc", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", padding: 10, marginBottom: 10, gap: 8 },
  docsCheckRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  docsCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  docsCheckboxOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  docsCheckText: { flex: 1, color: "#334155", fontSize: 13, fontWeight: "700" },
  datePickerButton: { backgroundColor: "#f5f5f5", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", marginBottom: 8 },
  datePickerButtonText: { fontSize: 16, color: "#333" },
  history: { color: colors.white, fontSize: 18, fontWeight: "700" },
  emptyHistoryContainer: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 40, alignItems: "center", marginVertical: 20 },
  emptyHistoryIcon: { fontSize: 48, marginBottom: 16 },
  emptyHistoryTitle: { fontSize: 18, fontWeight: "700", color: colors.white, marginBottom: 8 },
  emptyHistorySubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  paymentCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  paymentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  paymentDateContainer: { alignItems: "flex-start" },
  paymentDate: { fontSize: 16, fontWeight: "700", color: "#333" },
  paymentYear: { fontSize: 12, color: "#666", marginTop: 2 },
  paymentAmountContainer: { alignItems: "flex-end" },
  paymentAmount: { fontSize: 18, fontWeight: "700", color: "#333" },
  paymentTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  paymentTypeText: { color: colors.white, fontWeight: "600", fontSize: 10 },
  paymentMode: { fontSize: 12, color: "#666", fontStyle: "italic", marginTop: 4 },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelModalBtn: { flex: 1, backgroundColor: "#f0f0f0", borderRadius: 12, padding: 14, alignItems: "center" },
  cancelModalBtnText: { fontSize: 16, fontWeight: "600", color: "#666" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  modal: { backgroundColor: colors.white, padding: 16, paddingBottom: 22, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10, maxHeight: "88%" },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#d2d8e1", borderRadius: 12, padding: 12 },
  chip: { flex: 1, borderWidth: 1, borderColor: "#d2d8e1", borderRadius: 12, alignItems: "center", padding: 12 },
  chipOn: { backgroundColor: "#e8f0ff", borderColor: colors.blue2 },
  chipPhoneOn: { backgroundColor: "#5F259F", borderColor: "#5F259F" },
  chipText: { color: "#555" },
  chipOnText: { color: colors.white, fontWeight: "700" },
  primary: { backgroundColor: colors.blue2, borderRadius: 12, padding: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryDisabled: { opacity: 0.65 },
  cancelModalBtnDisabled: { opacity: 0.6 },
  primaryText: { color: colors.white, fontWeight: "700" },
  errorText: { color: "#b91c1c", fontSize: 12, marginTop: -4 },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  dropdownItemActive: {
    backgroundColor: "#e2fbf7"
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569"
  },
  dropdownItemTextActive: {
    color: "#0d9488",
    fontWeight: "700"
  },
  successText: { color: "#047857", fontSize: 12, fontWeight: "700", marginTop: -4 },
  dateBtn: { borderWidth: 1, borderColor: "#d2d8e1", borderRadius: 10, padding: 10, alignItems: "center" },
  dateBtnText: { color: colors.blue2, fontWeight: "600" },
  dayDisplay: { 
    fontSize: 14, 
    color: "#666", 
    fontStyle: "italic", 
    marginBottom: 8,
    textAlign: "center",
    backgroundColor: "#f8f9fa",
    padding: 8,
    borderRadius: 8,
  },
  pickerContainer: { 
    backgroundColor: colors.white, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pickerDoneBtn: { backgroundColor: colors.blue2, borderRadius: 8, padding: 12, alignItems: "center", marginTop: 10 },
  pickerDoneBtnText: { color: colors.white, fontWeight: "600", fontSize: 16 },
  paymentActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  editPaymentBtn: { backgroundColor: colors.blue2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  editPaymentBtnText: { color: colors.white, fontWeight: "600", fontSize: 12 },
  deletePaymentBtn: { backgroundColor: colors.missedRed, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  deletePaymentBtnText: { color: colors.white, fontWeight: "600", fontSize: 12 },
  modeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ccc", alignItems: "center" },
  modeBtnActive: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  modeText: { color: "#666", fontWeight: "600" },
  modeTextActive: { color: colors.white },
  disbursementRow: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#0f172a", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },

  // Vibrant Card Timeline Styles
  timelineContainer: { marginTop: 12, marginBottom: 16, gap: 10 },
  vibrantTimelineCard: { backgroundColor: "#1E293B", borderRadius: 14, borderWidth: 1, borderColor: "#334155", padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  vibrantCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vibrantHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 8 },
  vibrantIconBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  vibrantCardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  vibrantCardSubtext: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  vibrantAmountPill: { backgroundColor: "rgba(16,185,129,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "rgba(16,185,129,0.3)" },
  vibrantAmountText: { color: "#34D399", fontSize: 16, fontWeight: "900" },
  vibrantDuePill: { backgroundColor: "rgba(239,68,68,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  vibrantDueText: { color: "#F87171", fontSize: 13, fontWeight: "900" },
  vibrantActionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#334155" },
  vibrantActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)" },
  vibrantActionText: { fontSize: 12, fontWeight: "700" },
  
  // Previous loan history button
  showPrevHistoryBtn: { marginVertical: 18, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 999, backgroundColor: "#1E293B", borderWidth: 2, borderColor: "#3B82F6", alignItems: "center", alignSelf: "center", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  showPrevHistoryText: { fontSize: 14, fontWeight: "800", color: "#60A5FA" },
  prevHistoryTitle: { fontSize: 17, fontWeight: "900", marginVertical: 14, color: "#60A5FA", letterSpacing: 0.5 },
  disbursementLabel: { fontSize: 13, fontWeight: "800" },
  disbursementBadge: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, color: colors.white, fontSize: 12, fontWeight: "900" },
  locationUpdateSection: { backgroundColor: "#f8f9fa", borderRadius: 12, padding: 16, marginVertical: 8, borderWidth: 1, borderColor: "#e0e0e0" },
  locationLabel: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  locationCoords: { fontSize: 14, color: "#28a745", marginBottom: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  locationNotSet: { fontSize: 14, color: "#999", marginBottom: 12, fontStyle: "italic" },
  coordinateRow: { flexDirection: "row", gap: 10 },
  coordinateInput: { flex: 1 },
  coordinateHint: { color: "#64748b", fontSize: 12, fontWeight: "600", marginTop: -2, marginBottom: 10 },
  updateLocationBtn: { backgroundColor: colors.blue2, borderRadius: 10, padding: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  updateLocationBtnDisabled: { backgroundColor: "#ccc" },
  updateLocationBtnText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  
  // Loading & Error States
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  loadingText: { color: colors.white, fontSize: 16, marginTop: 12, fontWeight: "500" },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  errorTitle: { fontSize: 24, fontWeight: "700", color: colors.white, marginBottom: 12, textAlign: "center" },
  errorMessage: { fontSize: 16, color: "rgba(255,255,255,0.9)", textAlign: "center", marginBottom: 24 },
  backBtn: { backgroundColor: colors.white, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backBtnText: { color: colors.blue2, fontWeight: "700", fontSize: 16 },
  
  // QR Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" },
  qrModalContent: { width: "90%", maxWidth: 400, borderRadius: 20, borderWidth: 1, padding: 18, alignSelf: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  qrModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  qrModalTitle: { fontSize: 18, fontWeight: "900" },
  qrCloseBtn: { padding: 4 },
  qrModalScroll: { alignItems: "center", paddingBottom: 10 },
  qrCustName: { fontSize: 16, fontWeight: "700", marginBottom: 14, textAlign: "center" },
  qrAmountContainer: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(46,125,50,0.08)", alignItems: "center", marginBottom: 16 },
  qrAmountLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  qrAmountValue: { fontSize: 24, fontWeight: "900", marginTop: 2 },
  qrImageContainer: { width: 220, height: 220, padding: 10, backgroundColor: colors.white, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  qrImage: { width: 200, height: 200 },
  upiInputSection: { width: "100%", marginBottom: 14 },
  upiInputLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  copyLinkBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "rgba(21,101,192,0.08)", marginBottom: 18 },
  copyLinkText: { fontSize: 12, fontWeight: "800" },
  qrPayButtonsRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 8 },
  qrPayBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  qrPayBtnText: { color: colors.white, fontSize: 14, fontWeight: "900" },
});
