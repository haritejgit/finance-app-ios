import { LinearGradient } from "expo-linear-gradient";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
} from "react-native";
import { useAuth } from "../../src/auth-context";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { CustomerIdBadge } from "../../src/components/CustomerIdBadge";
import Icon from "../../src/Icon";
import { colors } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import { lightImpact } from "../../src/interactions";
import { showToast } from "../../src/notify";
import { getCachedCoordinates, LOCATION_PERMISSION_DENIED, LOCATION_TIMEOUT, requestCurrentCoordinates } from "../../src/location";
import { addCustomerWithLoan, addPayment, addPaymentsBatch, getActiveLoansByCustomerIds, getCustomers, getPaymentStatusesForCustomersThisWeek, getVillageById, getCustomerLoanSummary, getLastRegularPaymentDatesForCustomers, isAadhaarBlocked, markDue, updateCustomer } from "../../src/repository";
import { Customer, Loan, PaymentMode, Village } from "../../src/types";
import { weekStart } from "../../src/business-logic";
import { validateAadhaar, validateIndianPhone, validatePositiveAmount } from "../../src/validation";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const noTextSelection = Platform.OS === "web" ? ({ userSelect: "none", WebkitUserSelect: "none" } as any) : undefined;

type AddCustomerForm = {
  name: string;
  phone: string;
  aadhar: string;
  locationDesc: string;
  coName: string;
  coId: string;
  principal: string;
  disbursementMode: PaymentMode;
  coordinates: { latitude: number; longitude: number } | null;
  aadharSubmitted: boolean;
  passportPhotoSubmitted: boolean;
};

function createEmptyCustomerForm(): AddCustomerForm {
  return {
    name: "",
    phone: "",
    aadhar: "",
    locationDesc: "",
    coName: "",
    coId: "",
    principal: "",
    disbursementMode: "CASH",
    coordinates: null,
    aadharSubmitted: false,
    passportPhotoSubmitted: false,
  };
}

// Helper to check if date is today
function isToday(timestamp: number): boolean {
  const date = new Date(timestamp);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}

// Helper to check if date is in the current week (Monday to Sunday)
function isNewThisWeek(timestamp: number): boolean {
  const startMs = weekStart(Date.now());
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;
  return timestamp >= startMs && timestamp <= endMs;
}

// Get customer payment status for today
type PaymentStatus = 'paid' | 'due' | 'none';
type CustomerFilter = "all" | "pending" | "paid" | "due" | "new" | "docs";
type AadhaarScanResult = {
  name?: string | null;
  aadhaar?: string | null;
  phone?: string | null;
  location_desc?: string | null;
};

const CUSTOMER_FILTERS: { key: CustomerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "due", label: "Due" },
  { key: "new", label: "New" },
  { key: "docs", label: "Docs" },
];

function normalizeAadhar(aadhar?: string) {
  return (aadhar ?? "").replace(/\D/g, "").trim();
}

function hasCoordinates(customer: Customer) {
  return typeof customer.latitude === "number" && typeof customer.longitude === "number";
}

function getSuggestedPaymentAmount(loan?: Loan) {
  if (!loan) return 0;
  const standardAmount = Math.max(1, Math.round(loan.principalAmount / 10));
  return Math.min(standardAmount, loan.balanceAmount);
}

function loanHealthScore(loan?: Loan, lastPaymentDate?: number): number {
  if (!loan || loan.balanceAmount <= 0) return 100;
  const missedWeeks = lastPaymentDate ? Math.max(0, Math.floor((Date.now() - lastPaymentDate) / (7 * 24 * 60 * 60 * 1000))) : 1;
  const daysOverdue = lastPaymentDate ? Math.max(0, Math.floor((Date.now() - lastPaymentDate) / (24 * 60 * 60 * 1000)) - 7) : 7;
  return Math.max(0, Math.min(100, 100 - missedWeeks * 15 - daysOverdue * 2));
}



function toStartOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getLocationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === LOCATION_PERMISSION_DENIED) {
    return "Permission to access location was denied.";
  }
  if (error instanceof Error && error.message === LOCATION_TIMEOUT) {
    return "Location is taking too long. Please try again or enter coordinates from the customer edit screen.";
  }
  return "Failed to get location.";
}

function formatAadhaarDisplay(value?: string | null) {
  const digits = normalizeAadhar(value ?? "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function AadhaarManualInput({ onSubmit, inline = false }: { onSubmit: (data: AadhaarScanResult) => void; inline?: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const confirm = useCallback(() => {
    if (!/^\d{12}$/.test(value)) {
      setError("Aadhaar must be exactly 12 digits");
      return;
    }
    setError("");
    onSubmit({ aadhaar: value });
  }, [onSubmit, value]);

  return (
    <View style={inline ? styles.manualInputPanelInline : styles.manualInputPanel}>
      <Text style={styles.scannerTitle}>Enter Aadhaar Manually</Text>
      <TextInput
        value={value}
        onChangeText={(text) => {
          setValue(text.replace(/\D/g, "").slice(0, 12));
          setError("");
        }}
        placeholder="12-digit Aadhaar"
        placeholderTextColor="#6B7280"
        keyboardType="numeric"
        maxLength={12}
        style={styles.manualAadhaarInput}
      />
      {error ? <Text style={styles.manualInputError}>{error}</Text> : null}
      <Pressable style={styles.confirmScanBtn} onPress={confirm}>
        <Text style={styles.confirmScanText}>Confirm</Text>
      </Pressable>
    </View>
  );
}

const CustomerItem = React.memo(function CustomerItem({
  customer,
  onPress,
  onOpenDirections,
  onQuickPay,
  onManualPay,
  onMarkDue,
  onSaveCurrentLocation,
  status,
  isNew,
  loan,
  lastPaymentDate,
  paidLastWeek,
  isPaying,
  isUpdatingLocation,
}: {
  customer: Customer;
  onPress: (id: string) => void;
  onOpenDirections: (customer: Customer) => void;
  onQuickPay: (customer: Customer, mode: PaymentMode) => void;
  onManualPay: (customer: Customer, mode: PaymentMode) => void;
  onMarkDue: (customer: Customer) => void;
  onSaveCurrentLocation: (customer: Customer) => void;
  status: PaymentStatus;
  isNew?: boolean;
  loan?: Loan;
  lastPaymentDate?: number;
  paidLastWeek?: boolean;
  isPaying?: boolean;
  isUpdatingLocation?: boolean;
}) {
  const lastActionPressAtRef = useRef(0);
  const hasLocation = hasCoordinates(customer);
  const canPay = !!loan && loan.balanceAmount > 0 && !isPaying;
  const paidRatio = loan?.totalPayable ? Math.max(0, Math.min(1, 1 - loan.balanceAmount / loan.totalPayable)) : 0;
  const progressPercent = Math.min(paidRatio * 100, 100);
  // Badge only shows for customers whose loan started before the current week with no payment in the previous week
  const currentMonday = weekStart(Date.now());
  const didntPayLastWeek = !!loan && loan.status === "ACTIVE" && loan.startDate < currentMonday && !paidLastWeek;
  const missingDocs = [
    customer.aadharSubmitted === false ? "Aadhar not submitted" : "",
    customer.passportPhotoSubmitted === false ? "Passport photo not submitted" : "",
  ].filter(Boolean);
  const getStatusBadge = useCallback(() => {
    switch (status) {
      case 'paid':
        return <View style={styles.statusBadgeContainer}><Icon name="checkmark" size={12} color="#666666" /><Text style={styles.statusBadgePaidGrey}> PAID</Text></View>;
      case 'due':
        return <View style={styles.statusBadgeContainer}><Icon name="close" size={12} color="#dc3545" /><Text style={styles.statusBadgeDue}> DUE</Text></View>;
      default:
        return null;
    }
  }, [status]);

  const getBackgroundColor = useCallback(() => {
    if (status === 'due') {
      return '#f8d7da'; // Light red
    }
    if (isNew) {
      return '#e5e7eb'; // Visible grey for customers added today
    }
    switch (status) {
      case 'paid':
        return '#f5f5f5'; // Light grey for paid status
      default:
        return '#FFFFFF'; // Plain white
    }
  }, [status, isNew]);

  const getBorderColor = useCallback(() => {
    if (isNew && status !== 'due') {
      return '#9ca3af';
    }
    switch (status) {
      case 'paid':
        return '#999999'; // Grey border for new payments
      case 'due':
        return '#dc3545'; // Red border
      default:
        return 'transparent';
    }
  }, [status, isNew]);

  const markActionPress = useCallback((event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    lastActionPressAtRef.current = Date.now();
  }, []);

  const openCustomer = useCallback((event?: { stopPropagation?: () => void }) => {
    if (Date.now() - lastActionPressAtRef.current < 900) {
      event?.stopPropagation?.();
      return;
    }
    lightImpact();
    onPress(customer.id);
  }, [customer.id, onPress]);

  return (
    <Pressable
      style={[
        styles.item,
        noTextSelection,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor() === "transparent" ? "#E5E7EB" : getBorderColor(),
          borderWidth: 1,
          borderLeftWidth: 4,
        },
      ]}
      onPress={openCustomer}
    >
      {/* Left: ID + C/O ID + C/O Name */}
      <View style={styles.idContainer}>
        <CustomerIdBadge numericalId={customer.numericalId} id={customer.id} />
        {customer.coId ? (
          <Text style={styles.coIdBadge}>c/o: {customer.coId}</Text>
        ) : null}
        {customer.coName ? (
          <Text style={styles.coNameBadge} numberOfLines={1}>{customer.coName}</Text>
        ) : null}
      </View>

      {/* Center: Name, Phone, Balance, Icons, Location description */}
      <View style={styles.centerContent}>
        <Text
          style={[
            styles.name,
            status === "paid" && styles.namePaid,
            status === "due" && styles.nameDue,
          ]}
          numberOfLines={1}
        >
          {customer.name}
        </Text>
        <Text style={styles.phoneLabel}>ph.no:- {customer.phone || "-"}</Text>
        {loan ? (
          <View style={styles.balanceRow}>
            <Text style={[
              styles.balanceAmount,
              loan.balanceAmount <= 0 && styles.balanceCleared,
            ]}>
              Rs. {Math.round(loan.balanceAmount).toLocaleString("en-IN")}
            </Text>

            {/* Status icons row side-by-side with Balance */}
            <View style={[styles.statusIconsRow, { marginLeft: 6, marginBottom: 0 }]}>
              {/* Last week missed indicator */}
              {didntPayLastWeek ? (
                <View style={styles.statusIconWarn}>
                  <Icon name="alert-circle" size={14} color="#dc3545" />
                </View>
              ) : null}
              {/* Document status icons (only show if not both submitted) */}
              {!(customer.aadharSubmitted && customer.passportPhotoSubmitted) ? (
                <>
                  {/* Aadhar doc icon */}
                  <View style={customer.aadharSubmitted ? styles.statusIconOk : styles.statusIconMissing}>
                    <Icon name="id-card" size={13} color={customer.aadharSubmitted ? "#16a34a" : "#9ca3af"} />
                  </View>
                  {/* Photo doc icon */}
                  <View style={customer.passportPhotoSubmitted ? styles.statusIconOk : styles.statusIconMissing}>
                    <Icon name="camera" size={13} color={customer.passportPhotoSubmitted ? "#16a34a" : "#9ca3af"} />
                  </View>
                </>
              ) : null}
            </View>
          </View>
        ) : null}
        {customer.locationDesc ? (
          <Text style={styles.locationDescText} numberOfLines={1}>[{customer.locationDesc}]</Text>
        ) : null}
        {isNew ? <Text style={styles.statusBadgeNew}>NEW</Text> : null}
        {getStatusBadge()}
      </View>

      {/* Right: Actions Stack */}
      <View style={styles.itemActions}>
        <View style={styles.cardActionGrid}>
          <Pressable
            accessibilityLabel={`Mark ${customer.name} due`}
            style={[styles.cardActionBtn, styles.cardActionDue, !canPay && styles.quickPayBtnDisabled]}
            disabled={!canPay}
            onPressIn={markActionPress}
            onPressOut={markActionPress}
            onPress={(e) => {
              markActionPress(e);
              lightImpact();
              onMarkDue(customer);
            }}
          >
            <Text selectable={false} style={styles.cardActionText}>D</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Cash payment for ${customer.name}`}
            style={[styles.cardActionBtn, styles.cardActionCash, !canPay && styles.quickPayBtnDisabled]}
            disabled={!canPay}
            onPressIn={markActionPress}
            onPressOut={markActionPress}
            onPress={(e) => {
              markActionPress(e);
              lightImpact();
              onQuickPay(customer, "CASH");
            }}
            onLongPress={(e) => {
              markActionPress(e);
              lightImpact();
              onManualPay(customer, "CASH");
            }}
          >
            <Text selectable={false} style={styles.cardActionText}>{isPaying ? "..." : "C"}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Open directions for ${customer.name}`}
            style={[styles.cardActionBtn, styles.cardActionOpen, !hasLocation && styles.iconActionBtnMuted]}
            disabled={isUpdatingLocation}
            onPressIn={markActionPress}
            onPressOut={markActionPress}
            onPress={(e) => {
              markActionPress(e);
              lightImpact();
              if (hasLocation) onOpenDirections(customer);
            }}
            onLongPress={(e) => {
              markActionPress(e);
              if (!hasLocation) onSaveCurrentLocation(customer);
            }}
          >
            {isUpdatingLocation ? (
              <ActivityIndicator size="small" color="#9ca3af" />
            ) : (
              <Icon name="location" size={15} color={colors.white} />
            )}
          </Pressable>
          <Pressable
            accessibilityLabel={`PhonePe payment for ${customer.name}`}
            style={[styles.cardActionBtn, styles.cardActionPhone, !canPay && styles.quickPayBtnDisabled]}
            disabled={!canPay}
            onPressIn={markActionPress}
            onPressOut={markActionPress}
            onPress={(e) => {
              markActionPress(e);
              lightImpact();
              onQuickPay(customer, "PHONE");
            }}
            onLongPress={(e) => {
              markActionPress(e);
              lightImpact();
              onManualPay(customer, "PHONE");
            }}
          >
            <Text selectable={false} style={styles.cardActionText}>P</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
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

export default function CustomerListScreen() {
  const { villageId } = useLocalSearchParams<{ villageId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerFilter>("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [village, setVillage] = useState<Village | null>(null);
  const [form, setForm] = useState<AddCustomerForm>(createEmptyCustomerForm);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const addLocationRequestRef = useRef(0);
  const saveLocationRequestRef = useRef(0);
  const [updatingLocationCustomerId, setUpdatingLocationCustomerId] = useState<string | null>(null);
  const [registrationDate, setRegistrationDate] = useState(formatDateInput(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempRegistrationDate, setTempRegistrationDate] = useState<Date>(new Date());
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>({});
  const [activeLoans, setActiveLoans] = useState<Record<string, Loan>>({});
  const [lastPaymentDates, setLastPaymentDates] = useState<Record<string, { lastPaymentDate: number; paidLastWeek: boolean }>>({});
  const [payingCustomerId, setPayingCustomerId] = useState<string | null>(null);
  const [manualPaymentCustomer, setManualPaymentCustomer] = useState<Customer | null>(null);
  const [manualPaymentAmount, setManualPaymentAmount] = useState("");
  const [manualPaymentMode, setManualPaymentMode] = useState<"CASH" | "PHONE">("CASH");
  const [manualPaymentError, setManualPaymentError] = useState("");
  const [quickCollectOpen, setQuickCollectOpen] = useState(false);
  const [quickCollectSaving, setQuickCollectSaving] = useState(false);
  const [quickCollectValues, setQuickCollectValues] = useState<Record<string, { selected: boolean; amount: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const scrollOffsetRef = useRef(0);
  const [aadharWarning, setAadharWarning] = useState("");
  const [aadharChecking, setAadharChecking] = useState(false);
  const [aadharBlocked, setAadharBlocked] = useState(false);
  const [scanningAadhaar, setScanningAadhaar] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [aadhaarInfoDismissed, setAadhaarInfoDismissed] = useState(false);
  const [aadhaarReview, setAadhaarReview] = useState<AadhaarScanResult | null>(null);
  const [scannedData, setScannedData] = useState<AadhaarScanResult | null>(null);
  const [formErrors, setFormErrors] = useState<{ phone?: string; aadhar?: string; principal?: string }>({});

  const reload = useCallback(async (preserveScroll = false) => {
    if (!user || !villageId) {
      setIsLoading(false);
      return;
    }
    try {
      if (!preserveScroll) {
        setIsLoading(true);
      }
      const [allCustomers, villageDetails] = await Promise.all([
        getCustomers(user.uid, villageId, false),
        getVillageById(villageId),
      ]);
      const sortedList = [...allCustomers].sort((a, b) => a.numericalId - b.numericalId);
      setCustomers(sortedList);
      setVillage(villageDetails);

      const customerIds = sortedList.map((customer) => customer.id);
      const [statuses, loansByCustomer, latestPayments] = await Promise.all([
        getPaymentStatusesForCustomersThisWeek(user.uid, customerIds),
        getActiveLoansByCustomerIds(user.uid, customerIds),
        getLastRegularPaymentDatesForCustomers(user.uid, customerIds),
      ]);
      setPaymentStatuses(statuses);
      setActiveLoans(loansByCustomer);
      setLastPaymentDates(latestPayments);

      // Restore scroll position after data loads
      if (preserveScroll && scrollOffsetRef.current > 0) {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: scrollOffsetRef.current, animated: false });
        });
      }
    } catch {
      Alert.alert("Load failed", "Could not load customers. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user, villageId]);


  // On initial load
  useEffect(() => {
    if (authLoading) return;
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, villageId, user]);

  // On focus (coming back from customer details), preserve scroll position
  useFocusEffect(useCallback(() => {
    if (authLoading || !user || !villageId) return;
    // Reload data but restore scroll position
    reload(true);
  }, [authLoading, reload, user, villageId]));

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 220);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!showAdd || !user) {
      setAadharWarning("");
      setAadharChecking(false);
      setAadharBlocked(false);
      return;
    }

    const normalizedAadhar = normalizeAadhar(form.aadhar);
    if (normalizedAadhar.length < 4) {
      setAadharWarning("");
      setAadharChecking(false);
      setAadharBlocked(false);
      return;
    }

    let cancelled = false;
    setAadharChecking(true);
    const timeout = setTimeout(async () => {
      try {
        if (normalizedAadhar.length === 12) {
          const blocked = await isAadhaarBlocked(normalizedAadhar, user.uid);
          if (cancelled) return;
          if (blocked) {
            setAadharBlocked(true);
            setAadharWarning("This Aadhaar is blocked. Cannot register.");
            return;
          }
        }
        setAadharBlocked(false);
        const existingCustomer = await getCustomerLoanSummary(user.uid, normalizedAadhar);
        if (cancelled) return;
        if (existingCustomer.customer) {
          setAadharWarning(
            `Aadhar already exists for ${existingCustomer.customer.name} (Book No: ${existingCustomer.customer.numericalId})`
          );
        } else {
          setAadharWarning("");
        }
      } finally {
        if (!cancelled) {
          setAadharChecking(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [form.aadhar, showAdd, user]);

  const resetAddCustomerForm = useCallback(() => {
    addLocationRequestRef.current += 1;
    setForm(createEmptyCustomerForm());
    setRegistrationDate(formatDateInput(Date.now()));
    setTempRegistrationDate(new Date());
    setShowDatePicker(false);
    setIsGettingLocation(false);
    setAadharWarning("");
    setAadharChecking(false);
    setAadharBlocked(false);
    setScanningAadhaar(false);
    setScannerOpen(false);
    setShowManualInput(false);
    setShowConfirmation(false);
    setCameraActive(true);
    setAadhaarReview(null);
    setScannedData(null);
    setFormErrors({});
  }, []);

  const openAddCustomer = useCallback(() => {
    resetAddCustomerForm();
    setShowAdd(true);
  }, [resetAddCustomerForm]);

  const closeAddCustomer = useCallback(() => {
    setShowAdd(false);
    resetAddCustomerForm();
  }, [resetAddCustomerForm]);

  const applyAadhaarResult = useCallback(async (result: AadhaarScanResult) => {
    const scannedAadhaar = normalizeAadhar(result.aadhaar ?? "");
    if (scannedAadhaar && scannedAadhaar.length !== 12) {
      showToast("error", "Invalid Aadhaar", "Please enter the 12-digit number manually.");
      return;
    }
    setForm((current) => ({
      ...current,
      name: result.name || current.name,
      aadhar: scannedAadhaar || current.aadhar,
      phone: result.phone || current.phone,
      locationDesc: result.location_desc || current.locationDesc,
    }));
    setAadhaarReview(result);
    if (scannedAadhaar.length === 12) {
      const blocked = await isAadhaarBlocked(scannedAadhaar, user?.uid);
      setAadharBlocked(blocked);
      setAadharWarning(blocked ? "This Aadhaar is blocked. Cannot register." : "");
    }
    showToast("success", "Aadhaar scanned", "Review the filled details before saving.");
  }, [user?.uid]);

  useEffect(() => {
    if (scannerOpen && Platform.OS !== "web" && !cameraPermission?.granted) {
      void requestCameraPermission();
    }
  }, [cameraPermission?.granted, requestCameraPermission, scannerOpen]);

  const handleAadhaarScan = useCallback(async () => {
    lightImpact();
    setShowManualInput(Platform.OS === "web");
    setShowConfirmation(false);
    setCameraActive(true);
    setScannedData(null);
    setScannerOpen(true);
  }, []);

  const closeScanner = useCallback(() => {
    setScannerOpen(false);
    setShowManualInput(false);
    setShowConfirmation(false);
    setCameraActive(true);
    setScannedData(null);
    setScanningAadhaar(false);
  }, []);

  const handleCapture = useCallback(async (photo: { uri: string }) => {
    try {
      setScanningAadhaar(true);
      const { default: TextRecognition } = await import("@react-native-ml-kit/text-recognition");
      const result = await TextRecognition.recognize(photo.uri);
      const fullText = result.text;
      const aadhaarMatch = fullText.match(/\d{4}\s\d{4}\s\d{4}/) ?? fullText.match(/(?:\d[ -]?){12}/);
      const aadhaarNumber = aadhaarMatch ? aadhaarMatch[0].replace(/\s/g, "").replace(/-/g, "") : null;
      const nameMatch = fullText.match(/([A-Z][a-z]+ [A-Z][a-z]+)(?=\s*\n|DOB|Year)/);
      const name = nameMatch ? nameMatch[1] : null;

      if (aadhaarNumber && aadhaarNumber.length === 12) {
        setScannedData({ aadhaar: aadhaarNumber, name });
        setShowConfirmation(true);
        setCameraActive(false);
      } else {
        showToast("error", "Could not read Aadhaar number", "Try again or enter manually.");
        setCameraActive(true);
      }
    } catch (err) {
      console.error("OCR Error:", err);
      showToast("error", "Scan failed", "Please enter Aadhaar manually.");
      setShowManualInput(true);
    } finally {
      setScanningAadhaar(false);
    }
  }, []);

  const takeAadhaarPhoto = useCallback(async () => {
    if (!cameraRef.current || scanningAadhaar) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.82, skipProcessing: true });
    if (photo?.uri) {
      await handleCapture(photo);
    }
  }, [handleCapture, scanningAadhaar]);

  const confirmScannedAadhaar = useCallback(async () => {
    if (!scannedData) return;
    await applyAadhaarResult(scannedData);
    closeScanner();
  }, [applyAadhaarResult, closeScanner, scannedData]);

  const getCurrentLocation = async () => {
    const requestId = addLocationRequestRef.current + 1;
    addLocationRequestRef.current = requestId;
    setIsGettingLocation(true);
    try {
      const coordinates = await requestCurrentCoordinates((quickCoordinates) => {
        if (addLocationRequestRef.current !== requestId) return;
        setForm(prev => ({ ...prev, coordinates: quickCoordinates }));
      });
      if (addLocationRequestRef.current !== requestId) return;
      setForm(prev => ({
        ...prev,
        coordinates,
      }));
    } catch (error) {
      showToast("error", "Location unavailable", getLocationErrorMessage(error));
    } finally {
      if (addLocationRequestRef.current === requestId) {
        setIsGettingLocation(false);
      }
    }
  };

  const useLastKnownLocation = useCallback(async () => {
    const coordinates = await getCachedCoordinates();
    if (!coordinates) {
      showToast("info", "No cached location", "Fetch a location once before using the shortcut.");
      return;
    }
    setForm(prev => ({ ...prev, coordinates }));
  }, []);

  const saveCurrentLocationForCustomer = useCallback(async (customer: Customer) => {
    const requestId = saveLocationRequestRef.current + 1;
    saveLocationRequestRef.current = requestId;
    try {
      setUpdatingLocationCustomerId(customer.id);
      const coordinates = await requestCurrentCoordinates();
      if (saveLocationRequestRef.current !== requestId) return;
      const updatedCustomer: Customer = {
        ...customer,
        ...coordinates,
      };

      await updateCustomer(updatedCustomer);
      if (saveLocationRequestRef.current !== requestId) return;
      setCustomers((current) =>
        current.map((item) => (item.id === customer.id ? updatedCustomer : item))
      );
      Alert.alert("Location saved", `${customer.name}'s current location has been registered.`);
    } catch (error) {
      Alert.alert(
        error instanceof Error && error.message === LOCATION_PERMISSION_DENIED ? "Location denied" : "Location failed",
        error instanceof Error && error.message === LOCATION_PERMISSION_DENIED
          ? "Permission to access location was denied."
          : getLocationErrorMessage(error)
      );
    } finally {
      if (saveLocationRequestRef.current === requestId) {
        setUpdatingLocationCustomerId(null);
      }
    }
  }, []);

  const filtered = useMemo(() => {
    const numericQuery = debouncedQuery.replace(/\D/g, "");
    let result = customers;
    if (statusFilter !== "all") {
      result = result.filter((customer) => {
        const status = paymentStatuses[customer.id] || "none";
        if (statusFilter === "paid") return status === "paid";
        if (statusFilter === "due") return status === "due";
        if (statusFilter === "pending") {
          return !isNewThisWeek(customer.createdAt) && status !== "paid" && status !== "due";
        }
        if (statusFilter === "new") return isNewThisWeek(customer.createdAt);
        if (statusFilter === "docs") return customer.aadharSubmitted !== true || customer.passportPhotoSubmitted !== true;
        return true;
      });
    }
    if (debouncedQuery) {
      result = result.filter((c) => {
        const textMatch = [c.name, c.phone, c.numericalId.toString(), c.coName || "", c.coId?.toString() || ""]
          .join(" ")
          .toLowerCase()
          .includes(debouncedQuery);
        const phoneMatch = numericQuery.length > 0 && (c.phone || "").replace(/\D/g, "").includes(numericQuery);
        return textMatch || phoneMatch;
      });
    }
    return [...result].sort((a, b) => a.numericalId - b.numericalId);
  }, [customers, debouncedQuery, paymentStatuses, statusFilter]);

  const customerStats = useMemo(() => {
    return filtered.reduce(
      (stats, customer) => {
        const status = paymentStatuses[customer.id] || "none";
        const isNew = isNewThisWeek(customer.createdAt);
        const isCreatedToday = isToday(customer.createdAt);
        const isPaid = status === "paid";
        const isDue = status === "due";

        stats.total += 1;
        if (isCreatedToday) stats.today += 1;
        if (isPaid) stats.paid += 1;
        if (isDue) stats.dues += 1;
        if (!isNew && !isPaid && !isDue) stats.remaining += 1;
        return stats;
      },
      { total: 0, today: 0, paid: 0, dues: 0, remaining: 0 }
    );
  }, [filtered, paymentStatuses]);

  const quickCollectCustomers = useMemo(
    () => customers.filter((customer) => {
      const loan = activeLoans[customer.id];
      return !!loan && loan.balanceAmount > 0;
    }),
    [activeLoans, customers]
  );

  const selectedQuickCollectCount = useMemo(
    () => Object.values(quickCollectValues).filter((entry) => entry.selected && Number(entry.amount) > 0).length,
    [quickCollectValues]
  );

  const activeFilterLabel = useMemo(
    () => CUSTOMER_FILTERS.find((filter) => filter.key === statusFilter)?.label ?? "All",
    [statusFilter]
  );

  const openCustomer = useCallback((customerId: string) => {
    router.push(`/profile/${customerId}`);
  }, []);

  const openDirections = useCallback((customer: Customer) => {
    if (!hasCoordinates(customer)) return;
    const destination = `${customer.latitude},${customer.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Maps unavailable", "Unable to open Google Maps directions.");
    });
  }, []);

  const openManualPayment = useCallback((customer: Customer, selectedMode: PaymentMode = "CASH") =>
  {
    const loan = activeLoans[customer.id];
    if (!loan || loan.balanceAmount <= 0) {
      Alert.alert("No active loan", "This customer does not have an active loan to mark paid.");
      return;
    }
    setManualPaymentCustomer(customer);
    setManualPaymentAmount("");
    setManualPaymentMode(selectedMode);
    setManualPaymentError("");
  }, [activeLoans]);

  const handleQuickPay = useCallback((customer: Customer, mode: PaymentMode) => {
    const loan = activeLoans[customer.id];
    if (!loan || loan.balanceAmount <= 0) {
      Alert.alert("No active loan", "This customer does not have an active loan to mark paid.");
      return;
    }
    const suggested = getSuggestedPaymentAmount(loan);
    const modeLabel = mode === "PHONE" ? "PhonePe" : "Cash";
    Alert.alert(
      `${modeLabel} Payment`,
      `Pay Rs.${suggested.toLocaleString("en-IN")} via ${modeLabel} for ${customer.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            if (!user) return;
            try {
              setPayingCustomerId(customer.id);
              await addPayment(loan, suggested, toStartOfDay(Date.now()), mode);
              setPaymentStatuses((current) => ({ ...current, [customer.id]: "paid" }));
              setActiveLoans((current) => ({
                ...current,
                [customer.id]: { ...loan, balanceAmount: Math.max(0, loan.balanceAmount - suggested) },
              }));
            } catch {
              Alert.alert("Payment failed", "Could not save this payment. Please try again.");
            } finally {
              setPayingCustomerId(null);
            }
          },
        },
      ]
    );
  }, [activeLoans, user]);

  const openQuickCollect = useCallback(() => {
    const nextValues: Record<string, { selected: boolean; amount: string }> = {};
    quickCollectCustomers.forEach((customer) => {
      const loan = activeLoans[customer.id];
      nextValues[customer.id] = {
        selected: false,
        amount: getSuggestedPaymentAmount(loan).toString(),
      };
    });
    setQuickCollectValues(nextValues);
    setQuickCollectOpen(true);
  }, [activeLoans, quickCollectCustomers]);

  const toggleQuickCollectAll = useCallback(() => {
    const shouldSelect = selectedQuickCollectCount !== quickCollectCustomers.length;
    setQuickCollectValues((current) => {
      const next = { ...current };
      quickCollectCustomers.forEach((customer) => {
        const loan = activeLoans[customer.id];
        next[customer.id] = {
          selected: shouldSelect,
          amount: next[customer.id]?.amount ?? getSuggestedPaymentAmount(loan).toString(),
        };
      });
      return next;
    });
  }, [activeLoans, quickCollectCustomers, selectedQuickCollectCount]);

  const confirmQuickCollect = useCallback(async () => {
    const entries = quickCollectCustomers
      .map((customer) => {
        const value = quickCollectValues[customer.id];
        const loan = activeLoans[customer.id];
        const amountPaid = Number(value?.amount);
        if (!value?.selected || !loan || !Number.isFinite(amountPaid) || amountPaid <= 0) return null;
        return { loan, amountPaid: Math.min(amountPaid, loan.balanceAmount), paymentDate: toStartOfDay(Date.now()), mode: "CASH" as const };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (entries.length === 0) return;
    try {
      setQuickCollectSaving(true);
      await addPaymentsBatch(entries);
      showToast("success", "Payments recorded", `${entries.length} payments recorded`);
      setQuickCollectOpen(false);
      await reload();
    } catch {
      Alert.alert("Quick collect failed", "Could not record these payments. Please try again.");
    } finally {
      setQuickCollectSaving(false);
    }
  }, [activeLoans, quickCollectCustomers, quickCollectValues, reload]);

  const closeManualPayment = useCallback(() => {
    setManualPaymentCustomer(null);
    setManualPaymentAmount("");
    setManualPaymentMode("CASH");
    setManualPaymentError("");
  }, []);

  const confirmManualPayment = useCallback(async () => {
    if (!user || !manualPaymentCustomer) return;
    const loan = activeLoans[manualPaymentCustomer.id];
    const amount = Number(manualPaymentAmount);
    if (!loan) {
      setManualPaymentError("No active loan found.");
      return;
    }
    const amountError = validatePositiveAmount(manualPaymentAmount, "Payment amount");
    if (amountError) {
      setManualPaymentError(amountError);
      return;
    }
    if (amount > loan.balanceAmount) {
      setManualPaymentError(`Amount cannot exceed Rs.${Math.round(loan.balanceAmount)}.`);
      return;
    }

    try {
      setPayingCustomerId(manualPaymentCustomer.id);
      await addPayment(loan, amount, toStartOfDay(Date.now()), manualPaymentMode);
      setPaymentStatuses((current) => ({ ...current, [manualPaymentCustomer.id]: "paid" }));
      setActiveLoans((current) => ({
        ...current,
        [manualPaymentCustomer.id]: {
          ...loan,
          balanceAmount: Math.max(0, loan.balanceAmount - amount),
        },
      }));
      closeManualPayment();
    } catch {
      Alert.alert("Payment failed", "Could not save this payment. Please try again.");
    } finally {
      setPayingCustomerId(null);
    }
  }, [activeLoans, closeManualPayment, manualPaymentAmount, manualPaymentCustomer, manualPaymentMode, user]);

  const confirmManualDue = useCallback(async () => {
    if (!manualPaymentCustomer) return;
    const loan = activeLoans[manualPaymentCustomer.id];
    if (!loan) {
      setManualPaymentError("No active loan found.");
      return;
    }
    try {
      setPayingCustomerId(manualPaymentCustomer.id);
      await markDue(loan, toStartOfDay(Date.now()));
      setPaymentStatuses((current) => ({ ...current, [manualPaymentCustomer.id]: "due" }));
      closeManualPayment();
    } catch {
      Alert.alert("Due failed", "Could not mark this customer as due.");
    } finally {
      setPayingCustomerId(null);
    }
  }, [activeLoans, closeManualPayment, manualPaymentCustomer]);

  const markCustomerDue = useCallback(async (customer: Customer) => {
    const loan = activeLoans[customer.id];
    if (!loan || loan.balanceAmount <= 0) {
      Alert.alert("No active loan", "This customer does not have an active loan to mark due.");
      return;
    }
    try {
      setPayingCustomerId(customer.id);
      await markDue(loan, toStartOfDay(Date.now()));
      setPaymentStatuses((current) => ({ ...current, [customer.id]: "due" }));
      showToast("success", "Due marked", `${customer.name} has been marked due.`);
    } catch {
      Alert.alert("Due failed", "Could not mark this customer as due.");
    } finally {
      setPayingCustomerId(null);
    }
  }, [activeLoans]);

  const renderCustomer = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerItem 
        customer={item} 
        onPress={openCustomer} 
        onOpenDirections={openDirections}
        onQuickPay={handleQuickPay}
        onManualPay={openManualPayment}
        onMarkDue={markCustomerDue}
        onSaveCurrentLocation={saveCurrentLocationForCustomer}
        status={paymentStatuses[item.id] || 'none'} 
        isNew={isNewThisWeek(item.createdAt)}
        loan={activeLoans[item.id]}
        lastPaymentDate={lastPaymentDates[item.id]?.lastPaymentDate}
        paidLastWeek={lastPaymentDates[item.id]?.paidLastWeek}
        isPaying={payingCustomerId === item.id}
        isUpdatingLocation={updatingLocationCustomerId === item.id}
      />
    ),
    [activeLoans, lastPaymentDates, markCustomerDue, openCustomer, openDirections, openManualPayment, handleQuickPay, paymentStatuses, payingCustomerId, saveCurrentLocationForCustomer, updatingLocationCustomerId]
  );

  return (
    <AnimatedScreen style={styles.root}>
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['top']}>
        <View style={styles.content}>
          {/* Header with back button */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Icon name="arrow-back" size={20} color={colors.white} />
            </Pressable>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>{village?.name || 'Customers'}</Text>
              <Text style={styles.headerSub}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>

          <View style={styles.searchShell}>
            <Icon name="people" size={18} color="rgba(255,255,255,0.72)" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, mobile, book no..."
              style={[styles.search, { color: colors.white }]}
              placeholderTextColor="rgba(255,255,255,0.62)"
            />
          </View>
          <View style={styles.compactFilterRow}>
            <Pressable style={styles.compactFilterBtn} onPress={() => setFilterMenuOpen(true)}>
              <Icon name="filter-outline" size={16} color={colors.blue2} />
              <Text style={styles.compactFilterText}>Filter: {activeFilterLabel}</Text>
            </Pressable>
            {statusFilter !== "all" && (
              <Pressable style={styles.clearFilterBtn} onPress={() => setStatusFilter("all")}>
                <Icon name="close" size={14} color={colors.white} />
              </Pressable>
            )}
          </View>
          <View style={styles.routeSummary}>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Total Customers</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.total}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Today Customers</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.today}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Paid</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.paid}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Total Dues</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.dues}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Remaining</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.remaining}</Text>
            </View>
          </View>
          <FlatList
            ref={flatListRef}
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={renderCustomer}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={30}
            maxToRenderPerBatch={20}
            windowSize={10}
            removeClippedSubviews={false}
            onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={100}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.white} />
                  <Text style={styles.loadingText}>Loading customers...</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Icon name="people" size={48} color={colors.white} />
                  <Text style={styles.emptyText}>No customers yet</Text>
                  <Text style={styles.emptySubText}>Tap + to add the first customer</Text>
                </View>
              )
            }
          />
          
          <Pressable style={styles.quickCollectFab} onPress={openQuickCollect}>
            <Text style={styles.quickCollectFabText}>Quick Collect</Text>
          </Pressable>

          <Pressable style={styles.fab} onPress={openAddCustomer}>
            <Icon name="add" size={26} color={colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={quickCollectOpen} animationType="slide" onRequestClose={() => setQuickCollectOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Quick Collect</Text>
            <Pressable onPress={() => setQuickCollectOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>x</Text>
            </Pressable>
          </View>
          <View style={styles.formContainer}>
            <Pressable style={styles.selectAllBtn} onPress={toggleQuickCollectAll}>
              <Text style={styles.selectAllText}>
                {selectedQuickCollectCount === quickCollectCustomers.length ? "Clear All" : "Select All"}
              </Text>
            </Pressable>
            <FlatList
              data={quickCollectCustomers}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.quickCollectList}
              renderItem={({ item }) => {
                const value = quickCollectValues[item.id] ?? { selected: false, amount: "" };
                const loan = activeLoans[item.id];
                return (
                  <View style={styles.quickCollectRow}>
                    <Pressable
                      style={[styles.checkbox, value.selected && styles.checkboxOn]}
                      onPress={() =>
                        setQuickCollectValues((current) => ({
                          ...current,
                          [item.id]: { selected: !value.selected, amount: value.amount || getSuggestedPaymentAmount(loan).toString() },
                        }))
                      }
                    >
                      {value.selected ? <Icon name="checkmark" size={15} color={colors.white} /> : null}
                    </Pressable>
                    <View style={styles.quickCollectInfo}>
                      <Text style={styles.quickCollectName}>{item.name}</Text>
                      <Text style={styles.quickCollectMeta}>Balance Rs.{Math.round(loan?.balanceAmount ?? 0)}</Text>
                    </View>
                    <TextInput
                      value={value.amount}
                      onChangeText={(amount) =>
                        setQuickCollectValues((current) => ({
                          ...current,
                          [item.id]: { selected: value.selected, amount: amount.replace(/[^\d.]/g, "") },
                        }))
                      }
                      keyboardType="numeric"
                      style={styles.quickCollectInput}
                    />
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>No active loan payments to collect.</Text>}
            />
            <Pressable
              style={[styles.save, (quickCollectSaving || selectedQuickCollectCount === 0) && styles.saveDisabled]}
              disabled={quickCollectSaving || selectedQuickCollectCount === 0}
              onPress={confirmQuickCollect}
            >
              <Text style={styles.saveTxt}>
                {quickCollectSaving ? "Recording..." : `Record ${selectedQuickCollectCount} Payments`}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={filterMenuOpen} transparent animationType="fade" onRequestClose={() => setFilterMenuOpen(false)}>
        <View style={styles.filterOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterMenuOpen(false)} />
          <View style={styles.filterSheet}>
            <Text style={styles.filterSheetTitle}>Filter customers</Text>
            <View style={styles.filterSheetGrid}>
              {CUSTOMER_FILTERS.map((filter) => {
                const active = statusFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    style={[styles.filterOption, active && styles.filterOptionOn]}
                    onPress={() => {
                      setStatusFilter(filter.key);
                      setFilterMenuOpen(false);
                    }}
                  >
                    <Text style={[styles.filterOptionText, active && styles.filterOptionTextOn]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={scannerOpen && Platform.OS !== "web"} animationType="slide" onRequestClose={closeScanner}>
        <SafeAreaView style={styles.scannerModal}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan Aadhaar</Text>
            <Pressable style={styles.scannerCloseBtn} onPress={closeScanner}>
              <Icon name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          {Platform.OS === "web" ? (
            <AadhaarManualInput
              onSubmit={async (data) => {
                await applyAadhaarResult(data);
                closeScanner();
              }}
            />
          ) : showManualInput ? (
            <AadhaarManualInput
              onSubmit={async (data) => {
                await applyAadhaarResult(data);
                closeScanner();
              }}
            />
          ) : showConfirmation && scannedData ? (
            <View style={styles.scanConfirmation}>
              <Icon name="checkmark-circle-outline" size={42} color="#1B4332" />
              <Text style={styles.scanConfirmationTitle}>Confirm Aadhaar Details</Text>
              <Text style={styles.scanConfirmationValue}>{formatAadhaarDisplay(scannedData.aadhaar)}</Text>
              {scannedData.name ? <Text style={styles.scanConfirmationName}>{scannedData.name}</Text> : null}
              <Pressable style={styles.confirmScanBtn} onPress={confirmScannedAadhaar}>
                <Text style={styles.confirmScanText}>Confirm & Use This</Text>
              </Pressable>
              <Pressable
                style={styles.scanAgainBtn}
                onPress={() => {
                  setShowConfirmation(false);
                  setScannedData(null);
                  setCameraActive(true);
                }}
              >
                <Text style={styles.scanAgainText}>Scan Again</Text>
              </Pressable>
            </View>
          ) : !cameraPermission?.granted ? (
            <View style={styles.scannerCenter}>
              <Text style={styles.scannerFallbackText}>Camera access is needed to scan Aadhaar.</Text>
              <Pressable style={styles.confirmScanBtn} onPress={requestCameraPermission}>
                <Text style={styles.confirmScanText}>Grant Permission</Text>
              </Pressable>
              <Pressable style={styles.scanAgainBtn} onPress={() => setShowManualInput(true)}>
                <Text style={styles.scanAgainText}>Enter Manually Instead</Text>
              </Pressable>
            </View>
          ) : cameraActive ? (
            <CameraView
              ref={cameraRef}
              style={styles.cameraView}
              facing="back"
            >
              <View style={styles.scanFrame}>
                <Text style={styles.scanFrameText}>Place the Aadhaar card inside the frame</Text>
              </View>
              <Pressable style={[styles.captureBtn, scanningAadhaar && styles.saveDisabled]} onPress={takeAadhaarPhoto} disabled={scanningAadhaar}>
                {scanningAadhaar ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.captureBtnText}>Capture</Text>}
              </Pressable>
            </CameraView>
          ) : (
            <View style={styles.scannerCenter}>
              <ActivityIndicator size="large" color={colors.white} />
            </View>
          )}
          {Platform.OS !== "web" && !showManualInput && !showConfirmation ? (
          <Pressable style={styles.manualFallbackBtn} onPress={() => setShowManualInput(true)}>
            <Text style={styles.manualFallbackText}>Enter manually</Text>
          </Pressable>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal visible={showAdd} animationType="slide" onRequestClose={closeAddCustomer}>
        <SafeAreaView style={[styles.modal, { paddingTop: insets.top, backgroundColor: colors.background }]} edges={['top']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Customer Registration</Text>
              <Pressable
                accessibilityLabel="Scan Aadhaar"
                onPress={handleAadhaarScan}
                disabled={scanningAadhaar}
                style={[styles.scanHeaderBtn, scanningAadhaar && styles.saveDisabled]}
              >
                {scanningAadhaar ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Icon name="id-card-outline" size={15} color={colors.white} />
                    <Text style={styles.scanHeaderText}>Scan Aadhaar</Text>
                  </>
                )}
              </Pressable>
              <Pressable onPress={closeAddCustomer} style={styles.closeBtn}>
                <Text style={[styles.closeBtnText, { color: colors.gray }]}>✕</Text>
              </Pressable>
            </View>
            {scannerOpen && Platform.OS === "web" ? (
              <View style={styles.webScannerSheet}>
                <AadhaarManualInput
                  inline
                  onSubmit={async (data) => {
                    await applyAadhaarResult(data);
                    closeScanner();
                  }}
                />
                <Pressable style={styles.scanAgainBtn} onPress={closeScanner}>
                  <Text style={styles.scanAgainText}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
            
            <View style={styles.formContainer}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScrollContent}>
                {!aadhaarInfoDismissed ? (
                  <View style={styles.privacyBanner}>
                    <Icon name="shield-checkmark-outline" size={18} color={colors.primary} />
                    <Text style={styles.privacyText}>Scanning only reads Name, Aadhaar number, and address. No data is sent to any server.</Text>
                    <Pressable onPress={() => setAadhaarInfoDismissed(true)} style={styles.privacyOkBtn}>
                      <Text style={styles.privacyOkText}>OK</Text>
                    </Pressable>
                  </View>
                ) : null}
                {aadhaarReview ? (
                  <View style={styles.reviewCard}>
                    <Text style={styles.reviewTitle}>Review scanned details before saving</Text>
                    <Text style={styles.reviewText}>Name: {aadhaarReview.name || "Not detected"}</Text>
                    <Text style={styles.reviewText}>Aadhaar: {aadhaarReview.aadhaar || "Not detected"}</Text>
                    <Text style={styles.reviewText}>Phone: {aadhaarReview.phone || "Not detected"}</Text>
                    <Text style={styles.reviewText}>Address: {aadhaarReview.location_desc || "Not detected"}</Text>
                  </View>
                ) : null}
                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
                    <TextInput
                      placeholder="Enter customer name"
                      placeholderTextColor={colors.textMuted}
                      value={form.name}
                      onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                      style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Phone *</Text>
                    <TextInput
                      placeholder="Phone number"
                      placeholderTextColor={colors.gray}
                      value={form.phone}
                      onChangeText={(t) => {
                        setForm((f) => ({ ...f, phone: t.replace(/\D/g, "").slice(0, 10) }));
                        setFormErrors((current) => ({ ...current, phone: validateIndianPhone(t) }));
                      }}
                      style={[styles.input, { backgroundColor: colors.white, borderColor: colors.border, color: colors.text }]}
                      keyboardType="phone-pad"
                    />
                    {formErrors.phone ? <Text style={styles.aadharWarning}>{formErrors.phone}</Text> : null}
                  </View>
                </View>

                <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Aadhar Number</Text>
                    <TextInput
                      placeholder="Aadhar ID"
                      placeholderTextColor={colors.textMuted}
                      value={form.aadhar}
                      onChangeText={(t) => {
                        const normalized = normalizeAadhar(t).slice(0, 12);
                        setForm((f) => ({ ...f, aadhar: normalized }));
                        setFormErrors((current) => ({ ...current, aadhar: validateAadhaar(normalized) }));
                      }}
                      style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: aadharBlocked ? colors.error : colors.border, color: colors.text }]}
                      keyboardType="numeric"
                      maxLength={12}
                    />
                    {aadharChecking ? (
                      <Text style={styles.aadharHint}>Checking Aadhar...</Text>
                    ) : formErrors.aadhar ? (
                      <Text style={styles.aadharWarning}>{formErrors.aadhar}</Text>
                    ) : aadharWarning ? (
                      <Text style={styles.aadharWarning}>{aadharWarning}</Text>
                    ) : null}
                  </View>

                  <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Co-Applicant ID</Text>
                    <TextInput
                      placeholder="Co-applicant ID"
                      placeholderTextColor={colors.textMuted}
                      value={form.coId}
                      onChangeText={(t) => setForm((f) => ({ ...f, coId: t }))}
                      style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>Location Description</Text>
                <View style={styles.locationRow}>
                  <TextInput
                    placeholder="Enter address/location"
                    placeholderTextColor={colors.textMuted}
                    value={form.locationDesc}
                    onChangeText={(t) => setForm((f) => ({ ...f, locationDesc: t }))}
                    style={[styles.input, styles.textArea, { flex: 1, backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                    multiline
                    numberOfLines={2}
                  />
                  <Pressable 
                    style={[styles.locationBtn, isGettingLocation && styles.locationBtnDisabled]} 
                    onPress={getCurrentLocation}
                    disabled={isGettingLocation}
                  >
                    {isGettingLocation ? <View style={styles.locationPulse} /> : <Icon name="location" size={18} color={colors.white} />}
                  </Pressable>
                </View>
                <Pressable style={styles.useLastLocationBtn} onPress={useLastKnownLocation}>
                  <Text style={styles.useLastLocationText}>Use Last Location</Text>
                </Pressable>
                {form.coordinates && (
                  <Text style={styles.locationText}>
                    <Icon name="location" size={12} color="#666" /> Location captured: {form.coordinates.latitude.toFixed(6)}, {form.coordinates.longitude.toFixed(6)}
                  </Text>
                )}

                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Co-Applicant Name</Text>
                    <TextInput
                      placeholder="Co-applicant name (optional)"
                      placeholderTextColor={colors.textMuted}
                      value={form.coName}
                      onChangeText={(t) => setForm((f) => ({ ...f, coName: t }))}
                      style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Principal Amount *</Text>
                    <TextInput
                      placeholder="Enter loan amount"
                      placeholderTextColor={colors.textMuted}
                      value={form.principal}
                      onChangeText={(t) => {
                        setForm((f) => ({ ...f, principal: t }));
                        setFormErrors((current) => ({ ...current, principal: validatePositiveAmount(t, "Loan amount") }));
                      }}
                      style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                      keyboardType="numeric"
                    />
                    {formErrors.principal ? <Text style={styles.aadharWarning}>{formErrors.principal}</Text> : null}
                  </View>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>How was money given to customer?</Text>
                <View style={styles.modeRow}>
                  {(["CASH", "PHONE"] as const).map((disbursementMode) => (
                    <Pressable
                      key={disbursementMode}
                      style={[
                        styles.modeBtn,
                        form.disbursementMode === disbursementMode && styles.modeBtnOn,
                        form.disbursementMode === disbursementMode && disbursementMode === "PHONE" && styles.modeBtnPhoneOn,
                      ]}
                      onPress={() => setForm((f) => ({ ...f, disbursementMode }))}
                    >
                      <Text style={[styles.modeText, form.disbursementMode === disbursementMode && styles.modeTextOn]}>
                        {disbursementMode === "CASH" ? "Cash" : "PhonePe"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.label, { color: colors.text }]}>Submitted Documents</Text>
                <Pressable
                  style={styles.checkRow}
                  onPress={() => setForm((f) => ({ ...f, aadharSubmitted: !f.aadharSubmitted }))}
                >
                  <View style={[styles.checkbox, form.aadharSubmitted && styles.checkboxOn]}>
                    {form.aadharSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                  </View>
                  <Text style={[styles.checkLabel, { color: colors.text }]}>Did the customer submit the Aadhar?</Text>
                </Pressable>
                <Pressable
                  style={styles.checkRow}
                  onPress={() => setForm((f) => ({ ...f, passportPhotoSubmitted: !f.passportPhotoSubmitted }))}
                >
                  <View style={[styles.checkbox, form.passportPhotoSubmitted && styles.checkboxOn]}>
                    {form.passportPhotoSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                  </View>
                  <Text style={[styles.checkLabel, { color: colors.text }]}>Did customer submit passport size photo?</Text>
                </Pressable>

                <Text style={[styles.label, { color: colors.text }]}>Registration Date *</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={registrationDate}
                    onChange={(e) => setRegistrationDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#ccc',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      marginBottom: 8,
                    }}
                  />
                ) : (
                  <>
                    <View style={styles.dateInputContainer}>
                      <TextInput
                        placeholder="Registration Date (YYYY-MM-DD)"
                        value={registrationDate}
                        onChangeText={setRegistrationDate}
                        style={[styles.input, styles.dateInput]}
                        autoCapitalize="none"
                      />
                      <Pressable style={styles.datePickerBtn} onPress={() => {
                        setTempRegistrationDate(new Date(parseDateInput(registrationDate) ?? Date.now()));
                        setShowDatePicker(true);
                      }}>
                        <Text style={styles.datePickerBtnText}>📅</Text>
                      </Pressable>
                    </View>
                    {parseDateInput(registrationDate) && (
                      <Text style={styles.dayDisplay}>
                        {formatDateWithDay(parseDateInput(registrationDate)!)}
                      </Text>
                    )}
                  </>
                )}
                {showDatePicker && (
                  <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                    <DateTimePicker
                      value={tempRegistrationDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
                      themeVariant="light"
                      onChange={(event, selected) => {
                        if (selected) {
                          setTempRegistrationDate(selected);
                          if (Platform.OS === "ios") {
                            setRegistrationDate(formatDateInput(selected.getTime()));
                          }
                        }
                        if (Platform.OS === "ios") {
                          if (event.type === "dismissed") {
                            setShowDatePicker(false);
                          }
                        } else {
                          setRegistrationDate(formatDateInput(selected.getTime()));
                          setShowDatePicker(false);
                        }
                      }}
                    />
                    {Platform.OS === "ios" && (
                      <Pressable style={styles.pickerDoneBtn} onPress={() => {
                        setRegistrationDate(formatDateInput(tempRegistrationDate.getTime()));
                        setShowDatePicker(false);
                      }}>
                        <Text style={styles.pickerDoneBtnText}>Done</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                <View style={styles.buttonContainer}>
                  <Pressable
                    style={[styles.save, (!form.name || !form.phone || !form.principal || aadharBlocked) ? styles.saveDisabled : null]}
                    onPress={async () => {
                      if (!user || !village || !form.name || !form.phone || !form.principal || aadharBlocked) return;
                      const nextErrors = {
                        phone: validateIndianPhone(form.phone),
                        aadhar: validateAadhaar(form.aadhar),
                        principal: validatePositiveAmount(form.principal, "Loan amount"),
                      };
                      setFormErrors(nextErrors);
                      if (nextErrors.phone || nextErrors.aadhar || nextErrors.principal) {
                        showToast("error", "Check customer details", "Fix the highlighted fields before saving.");
                        return;
                      }
                      const parsedDate = parseDateInput(registrationDate);
                      if (!parsedDate) {
                        showToast("error", "Invalid date", "Please enter a valid registration date.");
                        return;
                      }
                      
                      // Check if customer already exists by Aadhar
                      const normalizedAadhar = normalizeAadhar(form.aadhar);
                      if (normalizedAadhar) {
                        if (await isAadhaarBlocked(normalizedAadhar, user.uid)) {
                          setAadharBlocked(true);
                          setAadharWarning("This Aadhaar is blocked. Cannot register.");
                          Alert.alert("Aadhaar Blocked", "This Aadhaar card has been blocked. Registration cannot proceed.");
                          return;
                        }
                        const existingCustomer = await getCustomerLoanSummary(user.uid, normalizedAadhar);
                        if (existingCustomer.customer) {
                          Alert.alert(
                            'Duplicate Aadhar Detected',
                            `A customer with this Aadhar number already exists in our records.\n\nExisting Customer: ${existingCustomer.customer.name}\nPhone: ${existingCustomer.customer.phone}\nBook No: ${existingCustomer.customer.numericalId}\n\nPlease verify the Aadhar number or contact the existing customer.`,
                            [{ text: 'OK', style: 'default' }]
                          );
                          return;
                        }
                      }
                      
                      const createdCustomer = await addCustomerWithLoan(
                        user.uid,
                        village.id,
                        village.dayOfWeek,
                        village.shift,
                        {
                          name: form.name,
                          phone: form.phone,
                          aadhar: normalizedAadhar,
                          locationDesc: form.locationDesc,
                          latitude: form.coordinates?.latitude,
                          longitude: form.coordinates?.longitude,
                          aadharSubmitted: form.aadharSubmitted,
                          passportPhotoSubmitted: form.passportPhotoSubmitted,
                          coName: form.coName || undefined,
                          coId: form.coId ? Number(form.coId) : undefined,
                        },
                        Number(form.principal || 0),
                        parsedDate,
                        form.disbursementMode
                      );
                      setShowAdd(false);
                      resetAddCustomerForm();
                      await reload();
                      showToast("success", "Customer registered", `${createdCustomer.name} has been created successfully.`);
                    }}
                    disabled={!form.name || !form.phone || !form.principal || aadharBlocked}
                  >
                    <Text style={styles.saveTxt}>Register Customer</Text>
                  </Pressable>
                  
                  <Pressable onPress={closeAddCustomer} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancel</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!manualPaymentCustomer} transparent animationType="slide" onRequestClose={closeManualPayment}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.manualPayModal, { backgroundColor: colors.card }]}>
            <Text style={[styles.manualPayTitle, { color: colors.text }]}>
              {manualPaymentMode === "PHONE" ? "PhonePe" : "Cash"} Payment
            </Text>
            <Text style={[styles.manualPaySubtitle, { color: colors.textSecondary }]}>{manualPaymentCustomer?.name}</Text>
            <TextInput
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              value={manualPaymentAmount}
              onChangeText={(value) => {
                setManualPaymentAmount(value);
                setManualPaymentError("");
              }}
              style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              keyboardType="numeric"
              autoFocus
            />
            {manualPaymentError ? <Text style={styles.aadharWarning}>{manualPaymentError}</Text> : null}
            <Text style={[styles.manualPaySubtitle, { color: colors.textSecondary }]}>
              Confirm Rs.{Number(manualPaymentAmount || 0).toLocaleString("en-IN")} payment via {manualPaymentMode === "PHONE" ? "PhonePe" : "Cash"}?
            </Text>
            <View style={styles.manualPayActions}>
              <Pressable style={[styles.cancelBtn, styles.dueInlineBtn]} onPress={confirmManualDue}>
                <Text style={styles.dueInlineText}>DUE</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={closeManualPayment}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.save} onPress={confirmManualPayment}>
                <Text style={styles.saveTxt}>Save Payment</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, width: "100%", maxWidth: 430, alignSelf: "center", paddingTop: 8, paddingHorizontal: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.26)" },
  backBtnText: { color: colors.white, fontSize: 20, fontWeight: "700" },
  headerTextWrap: { flex: 1 },
  headerTitle: { color: colors.white, fontSize: 22, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  searchShell: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.35)", borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, marginBottom: 10 },
  search: { flex: 1, paddingVertical: 13, fontSize: 14 },
  compactFilterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  compactFilterBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)" },
  compactFilterText: { color: colors.blue2, fontSize: 12, fontWeight: "900" },
  clearFilterBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  filterOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  filterSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 12 },
  filterSheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  filterSheetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterOption: { minWidth: "30%", flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: "center", backgroundColor: colors.surfaceTint },
  filterOptionOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  filterOptionText: { color: colors.gray, fontSize: 13, fontWeight: "900" },
  filterOptionTextOn: { color: colors.white },
  scannerModal: { flex: 1, backgroundColor: colors.ink },
  scannerHeader: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.white },
  scannerTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  scannerCloseBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.grayLighter },
  cameraView: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: "72%", aspectRatio: 1, borderRadius: 24, borderWidth: 3, borderColor: colors.teal, alignItems: "center", justifyContent: "flex-end", padding: 14, backgroundColor: "rgba(0,0,0,0.18)" },
  scanFrameText: { color: colors.white, fontSize: 14, fontWeight: "800", textAlign: "center" },
  scannerCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  scannerFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scannerFallbackText: { color: colors.white, fontSize: 16, lineHeight: 22, textAlign: "center", fontWeight: "700" },
  manualFallbackBtn: { minHeight: 52, margin: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  manualFallbackText: { color: colors.blue1, fontSize: 15, fontWeight: "900" },
  captureBtn: { position: "absolute", bottom: 26, minWidth: 130, minHeight: 52, borderRadius: 999, backgroundColor: "#1B4332", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  captureBtnText: { color: colors.white, fontSize: 16, fontWeight: "900" },
  scanConfirmation: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.white },
  scanConfirmationTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  scanConfirmationValue: { color: "#1B4332", fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  scanConfirmationName: { color: colors.gray, fontSize: 15, fontWeight: "700", textAlign: "center" },
  confirmScanBtn: { minWidth: 190, minHeight: 48, borderRadius: 14, backgroundColor: "#1B4332", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 8 },
  confirmScanText: { color: colors.white, fontSize: 15, fontWeight: "900" },
  scanAgainBtn: { minWidth: 190, minHeight: 48, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: "#D1D5DB" },
  scanAgainText: { color: "#1B4332", fontSize: 15, fontWeight: "900" },
  manualInputPanel: { flex: 1, backgroundColor: colors.white, padding: 22, justifyContent: "center", gap: 12 },
  manualInputPanelInline: { backgroundColor: colors.white, padding: 16, gap: 12 },
  webScannerSheet: { margin: 16, borderRadius: 16, overflow: "hidden", backgroundColor: colors.white, borderWidth: 1, borderColor: "#D1D5DB", paddingBottom: 14, gap: 2 },
  manualAadhaarInput: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: "#D1D5DB", paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  manualInputError: { color: "#b91c1c", fontSize: 12, fontWeight: "700" },
  routeSummary: { flexDirection: "row", gap: 6, marginBottom: 8 },
  routeSummaryCard: { flex: 1, minHeight: 44, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  routeSummaryLabel: { color: "rgba(255,255,255,0.72)", fontSize: 8, fontWeight: "800", textTransform: "uppercase", textAlign: "center" },
  routeSummaryValue: { color: colors.white, fontSize: 14, fontWeight: "900", marginTop: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: 20 },
  item: { backgroundColor: colors.white, borderRadius: 16, padding: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4, borderLeftWidth: 4, borderLeftColor: colors.teal },
  idContainer: { alignItems: "center", gap: 3, minWidth: 64, maxWidth: 84 },
  coIdBadge: { fontSize: 9, textAlign: "center", backgroundColor: "#fff3e0", color: "#f57c00", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, fontWeight: "700" },
  coNameBadge: { fontSize: 8, color: "#6B7280", fontWeight: "700", marginTop: 2, textAlign: "center", width: "100%" },
  centerContent: { flex: 1, paddingLeft: 2 },
  name: { fontWeight: "900", fontSize: 15, color: "#111827" },
  namePaid: { color: "#16803a" },
  nameDue: { color: "#dc3545" },
  phoneLabel: { fontSize: 11, color: "#4B5563", fontWeight: "600", marginTop: 2 },
  balanceRow: { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 4 },
  balanceLabel: { fontSize: 11, color: "#4B5563", fontWeight: "700" },
  balanceAmount: { fontSize: 12, color: colors.blue2, fontWeight: "800" },
  balanceCleared: { color: colors.success },
  locationDescText: { fontSize: 11, color: "#6B7280", fontWeight: "700", marginTop: 3, fontStyle: "italic" },
  statusBadgeContainer: { flexDirection: "row", alignItems: "center", marginTop: 3, alignSelf: "flex-start" },
  statusBadgePaidGrey: { fontSize: 9, color: "#666666", fontWeight: "700", backgroundColor: "#f5f5f5", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: "#999999" },
  statusBadgeDue: { fontSize: 9, color: "#dc3545", fontWeight: "700", backgroundColor: "#f8d7da", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start" },
  statusBadgeNew: { fontSize: 9, color: "#374151", fontWeight: "700", marginTop: 3, backgroundColor: "#f3f4f6", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: "#9ca3af" },
  itemActions: { alignItems: "center", gap: 6, width: 74 },
  statusIconsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  statusIconOk: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
  statusIconMissing: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  statusIconWarn: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" },
  actionBtnsRow: { flexDirection: "column", alignItems: "center", gap: 5 },
  cardActionGrid: { width: 70, flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: "center" },
  cardActionBtn: { width: 31, height: 31, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cardActionDue: { backgroundColor: "#C62828", borderColor: "#C62828" },
  cardActionCash: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  cardActionOpen: { backgroundColor: "#1976D2", borderColor: "#1976D2" },
  cardActionPhone: { backgroundColor: "#5F259F", borderColor: "#5F259F" },
  cardActionText: { color: colors.white, fontWeight: "900", fontSize: 13 },
  iconActionBtn: { width: 44, height: 32, borderRadius: 10, backgroundColor: colors.sky, borderWidth: 1, borderColor: "#bfdbfe", justifyContent: "center", alignItems: "center" },
  iconActionBtnMuted: { backgroundColor: "#f3f4f6", borderColor: "#e5e7eb" },
  payButtonsRow: { flexDirection: "row", gap: 5, width: 150 },
  cashPayBtn: { flex: 1, minHeight: 32, borderRadius: 10, backgroundColor: "#1565C0", justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  phonePePayBtn: { flex: 1, minHeight: 32, borderRadius: 10, backgroundColor: "#5F259F", justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  dueCardBtn: { flex: 1, minHeight: 32, borderRadius: 10, backgroundColor: "#C62828", justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  quickPayBtnDisabled: { backgroundColor: "#d1d5db" },
  quickPayText: { color: colors.white, fontWeight: "900", fontSize: 9 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptySubText: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { color: colors.white, fontSize: 14, opacity: 0.8 },
  loadingMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  fab: { 
    position: 'absolute', 
    right: 16, 
    bottom: 16, 
    width: 54, 
    height: 54, 
    borderRadius: 18, 
    backgroundColor: colors.amber, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: { color: colors.white, fontSize: 24, fontWeight: '300' },
  quickCollectFab: {
    position: "absolute",
    left: 16,
    bottom: 16,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: colors.blue2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  quickCollectFabText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  modal: { flex: 1, backgroundColor: "#f7f9fc" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: "#e0e0e0", gap: 8 },
  modalTitle: { fontSize: 24, fontWeight: "700", color: "#333", flex: 1 },
  scanHeaderBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.blue1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  scanHeaderText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#f0f0f0", justifyContent: "center", alignItems: "center" },
  closeBtnText: { fontSize: 18, color: "#666", fontWeight: "600" },
  formContainer: { flex: 1, padding: 20 },
  selectAllBtn: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#1565C0", paddingHorizontal: 14, paddingVertical: 9, marginBottom: 12 },
  selectAllText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  quickCollectList: { flexGrow: 1, paddingBottom: 16 },
  quickCollectRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.white, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#e0e0e0" },
  quickCollectInfo: { flex: 1 },
  quickCollectName: { color: "#111827", fontSize: 14, fontWeight: "900" },
  quickCollectMeta: { color: "#666", fontSize: 11, fontWeight: "700", marginTop: 2 },
  quickCollectInput: { width: 86, borderRadius: 10, borderWidth: 1, borderColor: "#d2d8e1", color: "#111827", paddingHorizontal: 10, paddingVertical: 9, fontSize: 14 },
  formScrollContent: { paddingBottom: 20 },
  privacyBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  privacyText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  privacyOkBtn: { borderRadius: 999, backgroundColor: colors.blue1, paddingHorizontal: 12, paddingVertical: 7 },
  privacyOkText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  reviewCard: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderLeftColor: colors.teal, borderLeftWidth: 4, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14, gap: 4 },
  reviewTitle: { color: colors.ink, fontSize: 13, fontWeight: "900", marginBottom: 2 },
  reviewText: { color: colors.gray, fontSize: 12, fontWeight: "600" },
  formRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  formColumn: { flex: 1 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 6 },
  aadharHint: { color: "#666", fontSize: 12, marginTop: -4, marginBottom: 8 },
  aadharWarning: { color: "#b91c1c", fontSize: 12, fontWeight: "600", marginTop: -4, marginBottom: 8 },
  input: { backgroundColor: colors.white, borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: "#e0e0e0", marginBottom: 8 },
  scanInputRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  scanInput: { flex: 1 },
  scanBtn: { minWidth: 70, minHeight: 50, borderRadius: 12, backgroundColor: "#6C63FF", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  scanBtnText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  dateInputContainer: { flexDirection: "row", gap: 8, alignItems: "center" },
  dateInput: { flex: 1 },
  datePickerBtn: { 
    width: 50, 
    height: 50, 
    borderRadius: 12, 
    backgroundColor: colors.blue2, 
    justifyContent: "center", 
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.blue2,
  },
  datePickerBtnText: { fontSize: 20, color: colors.white },
  textArea: { height: 70, textAlignVertical: "top" },
  locationRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  locationBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: colors.blue2, justifyContent: "center", alignItems: "center", marginTop: 8 },
  locationBtnDisabled: { backgroundColor: "#ccc" },
  locationBtnText: { fontSize: 20, color: colors.white },
  locationPulse: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#00D4AA", borderWidth: 4, borderColor: "rgba(0,212,170,0.3)" },
  useLastLocationBtn: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: "#2A2A3E", paddingHorizontal: 12, paddingVertical: 8, marginTop: -4, marginBottom: 8, backgroundColor: "#222238" },
  useLastLocationText: { color: "#00D4AA", fontSize: 12, fontWeight: "800" },
  locationText: { fontSize: 12, color: "#666", marginBottom: 8, fontStyle: "italic" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, marginBottom: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  checkLabel: { flex: 1, color: "#333", fontSize: 14, fontWeight: "600" },
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
  dateBtn: { borderWidth: 1, borderColor: "#d2d8e1", borderRadius: 10, padding: 10, alignItems: "center", marginTop: 8 },
  dateBtnText: { color: colors.blue2, fontWeight: "600" },
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
  buttonContainer: { marginTop: 20, gap: 12 },
  save: { backgroundColor: colors.blue2, borderRadius: 12, padding: 16, alignItems: "center" },
  saveDisabled: { backgroundColor: "#ccc" },
  saveTxt: { color: colors.white, fontWeight: "700", fontSize: 16 },
  cancelBtn: { backgroundColor: colors.white, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#e0e0e0" },
  cancelTxt: { color: "#666", fontWeight: "600", fontSize: 16 },
  cancel: { textAlign: "center", marginTop: 12, color: "#666" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  manualPayModal: { backgroundColor: colors.white, padding: 18, paddingBottom: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  manualPayTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  manualPaySubtitle: { color: colors.gray, fontSize: 13, fontWeight: "700", marginTop: -6 },
  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: "#d2d8e1", borderRadius: 12, padding: 12, alignItems: "center", backgroundColor: colors.white },
  modeBtnOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  modeBtnPhoneOn: { backgroundColor: "#5F259F", borderColor: "#5F259F" },
  modeText: { color: colors.gray, fontWeight: "800" },
  modeTextOn: { color: colors.white },
  manualPayActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  dueInlineBtn: { borderColor: "#fecaca", backgroundColor: "#fee2e2" },
  dueInlineText: { color: "#C62828", fontWeight: "900", fontSize: 14 },
});
