import { LinearGradient } from "expo-linear-gradient";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import { Image } from "expo-image";

import {
  ActivityIndicator,
  Alert as RNAlert,
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
import { db } from "../../src/firebase";
import { collection, query as firestoreQuery, where, getDocs, doc, setDoc } from "firebase/firestore";
import { addNestedTransaction, addNestedTransactionsBatch } from "../../src/repository";
import { CustomerIdBadge } from "../../src/components/CustomerIdBadge";
import Icon from "../../src/Icon";
import { colors } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import { useLanguage } from "../../src/language-context";
import { translateTelugu } from "../../src/exports";
import { lightImpact } from "../../src/interactions";
import { showToast } from "../../src/notify";
import { getCachedCoordinates, LOCATION_PERMISSION_DENIED, LOCATION_TIMEOUT, requestCurrentCoordinates } from "../../src/location";
import { addCustomerWithLoan, addPayment, addPaymentsBatch, checkAndAutoMarkDues, getActiveLoansByCustomerIds, getCustomers, getClosedCustomers, closeCustomer, reopenCustomer, getPaymentStatusesForCustomersThisWeek, getVillageById, getCustomerByAadhar, getLastRegularPaymentDatesForCustomers, isAadhaarBlocked, markDue, updateCustomer, isNumericalIdTaken, getNextNumericalId, renewLoan, saveNestedBF } from "../../src/repository";
import { Customer, Loan, PaymentMode, Village } from "../../src/types";
import { calculateDisbursedAmount, weekStart } from "../../src/business-logic";
import { validateAadhaar, validateIndianPhone, validatePositiveAmount } from "../../src/validation";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

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

type AddCustomerForm = {
  numericalId: string;
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
  chequeSubmitted: boolean;
};

function createEmptyCustomerForm(): AddCustomerForm {
  return {
    numericalId: "",
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
    chequeSubmitted: false,
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

// Helper to check if date is within the current calendar week
function isNewThisWeek(timestamp: number): boolean {
  return timestamp >= weekStart(Date.now());
}

// Get customer payment status for today
type PaymentStatus = 'paid' | 'due' | 'none';
type CustomerFilter = "all" | "pending" | "paid" | "due" | "new" | "renewed_today" | "renewed_week" | "docs" | "closed";
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
  { key: "renewed_today", label: "Renewed Today" },
  { key: "renewed_week", label: "Renewed This Week" },
  { key: "docs", label: "Docs" },
  { key: "closed", label: "Closed" },
];

function normalizeAadhar(aadhar?: string) {
  return (aadhar ?? "").replace(/\D/g, "").trim();
}

function hasCoordinates(customer: Customer) {
  return typeof customer.latitude === "number" && typeof customer.longitude === "number";
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
  onCloseRenew,
  onShowQr,
  onWhatsApp,
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
  onCloseRenew?: (customer: Customer, loan: Loan) => void;
  onShowQr?: (customer: Customer, loan: Loan) => void;
  onWhatsApp: (customer: Customer, loan?: Loan, status?: PaymentStatus) => void;
  status: PaymentStatus;
  isNew?: boolean;
  loan?: Loan;
  lastPaymentDate?: number;
  paidLastWeek?: boolean;
  isPaying?: boolean;
  isUpdatingLocation?: boolean;
}) {
  const { language } = useLanguage();
  const lastActionPressAtRef = useRef(0);
  const hasLocation = hasCoordinates(customer);
  const canPay = !!loan && loan.balanceAmount > 0 && !isPaying;
  const isFullyPaid = !!loan && loan.balanceAmount <= 0 && loan.status !== "RENEWED";
  const didntPayLastWeek = !!loan && loan.status === "ACTIVE" && loan.startDate < weekStart(Date.now()) && !paidLastWeek;
  
  const rowTone = useMemo(() => {
    if (status === "paid") {
      return { label: "✓", bg: "#E4F3EA", border: "#BFE0CC", divider: "#CBE7D4", accent: "#1E7A4C", badgeText: "#FFFFFF" };
    }
    if (status === "due") {
      return { label: "✗", bg: "#FBEAEA", border: "#F0C7C7", divider: "#F2D2D2", accent: "#B03A3A", badgeText: "#FFFFFF" };
    }
    if (isNew) {
      return { label: "", bg: "#FCF2E3", border: "#F0DBB0", divider: "#F2E2BE", accent: "#D4AF6A", badgeText: "#12294A" };
    }
    return { label: "", bg: "#FFFFFF", border: "#E1E6ED", divider: "#EEF1F5", accent: "#12294A", badgeText: "#FFFFFF" };
  }, [isNew, status]);

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

  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tapCountRef = useRef<number>(0);

  const handlePayPress = useCallback((e?: { stopPropagation?: () => void }) => {
    markActionPress(e);
    tapCountRef.current += 1;

    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    tapTimerRef.current = setTimeout(() => {
      const count = tapCountRef.current;
      tapCountRef.current = 0;
      tapTimerRef.current = null;

      if (count === 2) {
        lightImpact();
        showToast("info", "Cash Pay Selected", `Recording Cash pay for ${customer.name}`);
        onQuickPay(customer, "CASH");
      } else if (count >= 3) {
        lightImpact();
        showToast("info", "PhonePe Selected", `Recording PhonePe pay for ${customer.name}`);
        onQuickPay(customer, "PHONE");
      } else if (count === 1) {
        showToast("info", "Pay Button", "Double-tap for Cash pay • Triple-tap for PhonePe • Hold for Options");
      }
    }, 300);
  }, [customer, markActionPress, onQuickPay]);

  const handlePayLongPress = useCallback((e?: { stopPropagation?: () => void }) => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    tapCountRef.current = 0;
    markActionPress(e);
    lightImpact();
    onManualPay(customer, "CASH");
  }, [customer, markActionPress, onManualPay]);

  return (
    <Pressable
      style={[
        styles.item,
        noTextSelection,
        {
          backgroundColor: rowTone.bg,
          borderColor: rowTone.border,
          borderLeftColor: rowTone.accent,
        },
      ]}
      onPress={openCustomer}
    >
      <View style={styles.leftCol}>
        <CustomerIdBadge 
          numericalId={customer.numericalId} 
          id={customer.id} 
          style={[styles.premiumBadge, { backgroundColor: rowTone.accent }]}
          textStyle={[styles.premiumBadgeText, { color: rowTone.badgeText }]}
        />
        {!!customer.coName && (
          <Text style={styles.coNameUnder} numberOfLines={2}>
            {language === "te" ? translateTelugu(customer.coName) : customer.coName}
          </Text>
        )}
      </View>

      <View style={styles.centerCol}>
        <View style={styles.customerNameRow}>
          <Text style={styles.cardName} numberOfLines={2}>
            {language === "te" ? translateTelugu(customer.name) : customer.name}
          </Text>
          {rowTone.label ? (
            <Text style={[styles.rowStatusPill, { backgroundColor: rowTone.accent, color: rowTone.badgeText }]}>
              {rowTone.label}
            </Text>
          ) : null}
        </View>

        <View style={styles.phoneIconRow}>
          {customer.phone ? (
            <>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  lightImpact();
                  Linking.openURL(`tel:${customer.phone}`).catch(() => undefined);
                }}
                style={styles.callLink}
              >
                <Icon name="call" size={11} color="#9AA6B2" />
                <Text style={styles.cardPhone}>{customer.phone}</Text>
              </Pressable>
              
              {loan && loan.balanceAmount > 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    lightImpact();
                    onShowQr && onShowQr(customer, loan);
                  }}
                  style={styles.upiPill}
                >
                  <Icon name="qr-code" size={9} color="#9A6B1E" />
                  <Text style={styles.upiPillText}>UPI QR</Text>
                </Pressable>
              )}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  lightImpact();
                  onWhatsApp(customer, loan, status);
                }}
                style={styles.waBubble}
              >
                <Icon name="logo-whatsapp" size={13} color="#25D366" />
              </Pressable>
            </>
          ) : (
            <Text style={styles.cardPhone}>—</Text>
          )}
        </View>

        {loan ? (
          <View style={styles.amountStatusRow}>
            {/* Balance amount */}
            <Text style={styles.cardAmount}>
              Rs.{Math.round(loan.balanceAmount).toLocaleString("en-IN")}
            </Text>
            {loan.balanceAmount > 0 && (
              <Text style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4 }}>
                ({Math.round(getSuggestedPaymentAmount(loan))}/-)
              </Text>
            )}
            {didntPayLastWeek && (
              <Icon name="warning" size={12} color="#B03A3A" style={{ marginLeft: 1 }} />
            )}
            {/* Doc badges inline - only when a doc is missing */}
            {(!customer.aadharSubmitted || !customer.passportPhotoSubmitted || (customer.chequeRequired && !customer.chequeSubmitted)) && (
              <View style={styles.docStatusGroup}>
                {!customer.aadharSubmitted && (
                  <View style={styles.docMiniSquare}>
                    <Icon name="id-card" size={11} color="#dc3545" />
                  </View>
                )}
                {!customer.passportPhotoSubmitted && (
                  <View style={styles.docMiniSquare}>
                    <Icon name="person" size={11} color="#4B5563" />
                  </View>
                )}
                {customer.chequeRequired && !customer.chequeSubmitted && (
                  <View style={styles.docMiniSquare}>
                    <Icon name="card-outline" size={11} color="#B45309" />
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}

        <Pressable
          disabled={isUpdatingLocation || (!hasLocation && !onSaveCurrentLocation)}
          style={[styles.locationPill, hasLocation ? styles.locationPillSaved : styles.locationPillEmpty]}
          onPress={(e) => {
            markActionPress(e);
            lightImpact();
            if (hasLocation) {
              onOpenDirections(customer);
            } else if (onSaveCurrentLocation) {
              onSaveCurrentLocation(customer);
            }
          }}
          onLongPress={(e) => {
            markActionPress(e);
            if (!hasLocation && onSaveCurrentLocation) {
              onSaveCurrentLocation(customer);
            }
          }}
        >
          {isUpdatingLocation ? (
            <ActivityIndicator size="small" color={hasLocation ? "#D4AF6A" : "#9AA6B2"} />
          ) : (
            <Icon name="location" size={10} color={hasLocation ? "#D4AF6A" : "#9AA6B2"} />
          )}
          <Text style={[styles.addressDesc, hasLocation ? styles.addressDescSaved : null]} numberOfLines={1}>
            {customer.locationDesc || "Loc Description"}
          </Text>
        </Pressable>
      </View>

      {/* Right vertical line divider */}
      <View style={[styles.divider, { backgroundColor: rowTone.divider }]} />

      {/* Column 3: Right Actions — Pay Button + Dedicated DUE Button */}
      <View style={styles.rightCol}>
        {isFullyPaid && onCloseRenew ? (
          <Pressable
            accessibilityLabel={`Close or Renew ${customer.name}`}
            style={[styles.actionRow]}
            onPress={(e) => {
              markActionPress(e);
              lightImpact();
              onCloseRenew(customer, loan!);
            }}
          >
            <View style={[styles.singlePayBtn, { backgroundColor: "#1565C0" }]}>
              <Text style={styles.singlePayBtnText}>Renew</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.rightActionsCol}>
            <Pressable
              accessibilityLabel={`Pay for ${customer.name}`}
              style={[styles.singlePayBtn, !canPay && styles.actionRowDisabled]}
              disabled={!canPay}
              onPress={handlePayPress}
              onLongPress={handlePayLongPress}
              delayLongPress={400}
            >
              <Text style={styles.singlePayBtnText}>Pay</Text>
            </Pressable>

            {onMarkDue && (
              <Pressable
                accessibilityLabel={`Mark ${customer.name} due`}
                style={[styles.dueSquareBtn, !canPay && styles.actionRowDisabled]}
                disabled={!canPay}
                onPress={(e) => {
                  markActionPress(e);
                  lightImpact();
                  onMarkDue(customer);
                }}
              >
                <Text style={styles.dueSquareBtnText}>DUE</Text>
              </Pressable>
            )}
          </View>
        )}
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
  const { user, userProfile, loading: authLoading } = useAuth();
  const isOwner = !userProfile || userProfile.role !== "nested";
  const effectiveOwnerId = isOwner ? user?.uid : userProfile?.parentUid;
  const { colors } = useTheme();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [closedCustomers, setClosedCustomers] = useState<Customer[]>([]);
  const [closedCustomerLoans, setClosedCustomerLoans] = useState<Record<string, Loan>>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerFilter>("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedQrCustomer, setSelectedQrCustomer] = useState<{ customer: Customer; loan: Loan } | null>(null);
  const [qrCustomAmount, setQrCustomAmount] = useState<string>("");
  const [agentUpiId, setAgentUpiId] = useState("karthikeyafinance@ybl");
  const [village, setVillage] = useState<Village | null>(null);
  const [form, setForm] = useState<AddCustomerForm>(createEmptyCustomerForm);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const addLocationRequestRef = useRef(0);
  const saveLocationRequestRef = useRef(0);
  const [updatingLocationCustomerId, setUpdatingLocationCustomerId] = useState<string | null>(null);
  const [registrationDate, setRegistrationDate] = useState(formatDateInput(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempRegistrationDate, setTempRegistrationDate] = useState<Date>(new Date());
  const processingPaymentsRef = useRef<Set<string>>(new Set());
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
  const [isRegistering, setIsRegistering] = useState(false);
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
  const [formErrors, setFormErrors] = useState<{ phone?: string; aadhar?: string; principal?: string; numericalId?: string }>({});
  const [nestedAccounts, setNestedAccounts] = useState<{ nestedUid: string; label: string; nestedEmail: string }[]>([]);
  const cashToHand = useMemo(() => calculateDisbursedAmount(Number(form.principal || 0)), [form.principal]);

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
        ...extra
      });
    } catch (e) {
      console.error("Failed to write debug log", e);
    }
  }, []);

  const reload = useCallback(async (preserveScroll = false, forceRefresh = false) => {
    await logDebug("reload start", {
      userUid: user?.uid || null,
      userProfileRole: userProfile?.role || null,
      userProfileParentUid: userProfile?.parentUid || null,
      isOwner,
      effectiveOwnerId,
      villageId,
      authLoading
    });

    if (!user || !villageId || !effectiveOwnerId) {
      await logDebug("reload early exit", {
        hasUser: !!user,
        hasVillageId: !!villageId,
        hasEffectiveOwnerId: !!effectiveOwnerId
      });
      setIsLoading(false);
      return;
    }
    try {
      if (!preserveScroll) {
        setIsLoading(true);
      }
      await logDebug("calling getCustomers", { effectiveOwnerId, villageId });
      let allCustomers = await getCustomers(effectiveOwnerId, villageId, !forceRefresh);
      await logDebug("calling getVillageById", { villageId });
      const villageDetails = await getVillageById(villageId);
      await logDebug("data loaded success", {
        customersCount: allCustomers.length,
        villageName: villageDetails?.name || null
      });
      
      if (!isOwner) {
        // Fetch nested customers registered by this nested user
        const qNestedCust = firestoreQuery(
          collection(db, "nestedCustomers"),
          where("nestedUserId", "==", user.uid),
          where("villageId", "==", villageId)
        );
        const nestedCustSnap = await getDocs(qNestedCust);
        const nestedCusts = nestedCustSnap.docs.map(doc => {
          const data = doc.data() as any;
          return {
            ...data,
            isTemp: true,
            numericalId: data.numericalId || 999999,
          };
        });
        allCustomers = [...allCustomers, ...nestedCusts];
      }

      const sortedList = [...allCustomers].sort((a, b) => (a.numericalId || 999999) - (b.numericalId || 999999));
      setCustomers(sortedList);
      setVillage(villageDetails);

      const customerIds = sortedList.map((customer) => customer.id);
      const loansByCustomer = await getActiveLoansByCustomerIds(effectiveOwnerId, customerIds, undefined, forceRefresh);

      // Mock active loans for temporary customers so they can collect payments for them
      if (!isOwner) {
        sortedList.forEach((c: any) => {
          if (c.isTemp && !loansByCustomer[c.id]) {
            const principal = Number(c.principal || 10000);
            const interest = principal * 0.20;
            const totalPayable = principal + interest;
            loansByCustomer[c.id] = {
              id: `temp_loan_${c.id}`,
              customerId: c.id,
              principalAmount: principal,
              interestAmount: interest,
              totalPayable,
              balanceAmount: totalPayable,
              userId: effectiveOwnerId,
              startDate: c.createdAt,
              status: "ACTIVE",
              disbursement_mode: c.disbursementMode || "CASH",
              isTemp: true,
            } as any;
          }
        });
      }

      // Auto-mark dues for completed, unpaid weeks across all active loans
      if (isOwner) {
        try {
          await checkAndAutoMarkDues(effectiveOwnerId, Object.values(loansByCustomer));
        } catch {
          // Non-critical: ignore auto-due failures silently
        }
      }

      const [statuses, latestPayments] = await Promise.all([
        getPaymentStatusesForCustomersThisWeek(effectiveOwnerId, customerIds),
        getLastRegularPaymentDatesForCustomers(effectiveOwnerId, customerIds),
      ]);

      // If nested, fetch their pending transactions and adjust local state
      if (!isOwner && customerIds.length > 0) {
        const qTxns = firestoreQuery(
          collection(db, "nestedTransactions"),
          where("nestedUid", "==", user.uid),
          where("exported", "==", false)
        );
        const txnsSnap = await getDocs(qTxns);
        const txns = txnsSnap.docs.map(doc => doc.data() as any);
        
        txns.forEach((txn) => {
          const cid = txn.customerId;
          if (customerIds.includes(cid)) {
            statuses[cid] = "paid";
            latestPayments[cid] = txn.date;
            
            const loan = loansByCustomer[cid];
            if (loan) {
              loan.balanceAmount = Math.max(0, loan.balanceAmount - txn.amount);
              if (loan.balanceAmount <= 0) {
                loan.status = "CLOSED";
              }
            }
          }
        });
      }

      setActiveLoans(loansByCustomer);
      setPaymentStatuses(statuses);
      setLastPaymentDates(latestPayments);

      // Also fetch closed customers for this village
      try {
        const closedList = await getClosedCustomers(effectiveOwnerId, villageId);
        setClosedCustomers(closedList);
        const closedIds = closedList.map((c) => c.id);
        if (closedIds.length > 0) {
          const closedLoans = await getActiveLoansByCustomerIds(effectiveOwnerId, closedIds);
          setClosedCustomerLoans(closedLoans);
        }
      } catch {
        // Non-critical
      }

      // Restore scroll position after data loads
      if (preserveScroll && scrollOffsetRef.current > 0) {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: scrollOffsetRef.current, animated: false });
        });
      }
    } catch (err: any) {
      await logDebug("reload failed error", {
        errorName: err?.name || null,
        errorMessage: err?.message || null,
        errorStack: err?.stack || null
      });
      Alert.alert("Load failed", "Could not load customers. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user, villageId, effectiveOwnerId, isOwner, logDebug]);


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

  // On initial load and dependency updates
  useEffect(() => {
    if (authLoading || !user || !villageId || !effectiveOwnerId) return;
    reload(false, false);
  }, [authLoading, villageId, user, effectiveOwnerId, reload]);

  // Load nested accounts so owner can assign BF when registering customers
  useEffect(() => {
    if (!isOwner || !user?.uid) return;
    import("firebase/firestore").then(({ getDocs: gd, query: q, collection: col, where: wh }) => {
      gd(q(col(db, "nestedAccounts"), wh("ownerUid", "==", user.uid))).then((snap) => {
        setNestedAccounts(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return { nestedUid: data.nestedUid, label: data.label || data.nestedEmail, nestedEmail: data.nestedEmail };
          })
        );
      });
    });
  }, [isOwner, user?.uid]);

  // On focus (coming back from customer details), preserve scroll position
  useFocusEffect(useCallback(() => {
    if (authLoading || !user || !villageId) return;
    // Reload data but restore scroll position
    reload(true, false);
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
        const existingCustomer = await getCustomerByAadhar(user.uid, normalizedAadhar);
        if (cancelled) return;
        if (existingCustomer) {
          setAadharWarning(
            `Aadhar already exists for ${existingCustomer.name} (Book No: ${existingCustomer.numericalId})`
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

  const openAddCustomer = useCallback(async () => {
    resetAddCustomerForm();
    setShowAdd(true);
    if (user && village && effectiveOwnerId) {
      try {
        const nextId = await getNextNumericalId(effectiveOwnerId, village.id);
        setForm((f) => ({ ...f, numericalId: String(nextId) }));
      } catch (err) {
        console.error("Error fetching next ID:", err);
      }
    }
  }, [resetAddCustomerForm, user, village, effectiveOwnerId]);

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
        if (statusFilter === "renewed_today") {
          const l = activeLoans[customer.id];
          return !!l && isToday(l.startDate);
        }
        if (statusFilter === "renewed_week") {
          const l = activeLoans[customer.id];
          return !!l && isNewThisWeek(l.startDate);
        }
        if (statusFilter === "docs") return customer.aadharSubmitted !== true || customer.passportPhotoSubmitted !== true || (customer.chequeRequired === true && customer.chequeSubmitted !== true);
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
    if (statusFilter === "closed") {
      result = closedCustomers;
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
    }
    return [...result].sort((a, b) => a.numericalId - b.numericalId);
  }, [customers, closedCustomers, debouncedQuery, paymentStatuses, statusFilter]);

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

  const handleWhatsApp = useCallback((customer: Customer, loan?: Loan, status?: PaymentStatus) => {
    if (!customer.phone) return;
    const rawPhone = customer.phone.replace(/\D/g, '');
    const fullPhone = rawPhone.startsWith('91') ? rawPhone : `91${rawPhone}`;
    const bookNo = String(customer.numericalId).padStart(2, '0');
    const balance = loan ? Math.round(loan.balanceAmount) : 0;
    const suggested = Math.round(getSuggestedPaymentAmount(loan));
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let message = '';
    if (status === 'paid') {
      message = `✅ *Payment Received*\nName: ${customer.name}\nBook No: ${bookNo}\nBalance Remaining: Rs.${balance.toLocaleString('en-IN')}\nDate: ${today}\n\nThank you! 🙏\n— Karthikeya Finance`;
    } else if (status === 'due') {
      message = `⚠️ *Payment Due*\nDear ${customer.name},\nYour weekly installment (Book: ${bookNo}) of Rs.${suggested.toLocaleString('en-IN')} is pending.\nPlease arrange payment at your earliest.\n\n— Karthikeya Finance`;
    } else {
      message = `📢 *Payment Reminder*\nDear ${customer.name},\nFriendly reminder for your weekly installment.\nBook: ${bookNo} | Amount: Rs.${suggested.toLocaleString('en-IN')}\n\n— Karthikeya Finance`;
    }

    const waUrl = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;
    Linking.openURL(waUrl).catch(() => {
      Linking.openURL(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`).catch(() => undefined);
    });
  }, []);

  const handleCloseCustomer = useCallback(async (customer: Customer) => {
    if (!user) return;
    try {
      await closeCustomer(customer.id, user.uid);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      setClosedCustomers((prev) => [...prev, { ...customer, isActive: false }]);
      showToast("success", "Customer closed", `${customer.name} has been closed and removed from active list.`);
    } catch {
      showToast("error", "Close failed", "Could not close this customer.");
    }
  }, [user]);

  const handleReopenCustomer = useCallback(async (customer: Customer) => {
    if (!user) return;
    try {
      await reopenCustomer(customer.id, user.uid);
      setClosedCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      setCustomers((prev) => [...prev, { ...customer, isActive: true }].sort((a, b) => a.numericalId - b.numericalId));
      showToast("success", "Customer reopened", `${customer.name} has been restored to active list.`);
    } catch {
      showToast("error", "Reopen failed", "Could not reopen this customer.");
    }
  }, [user]);

  const promptCloseOrRenew = useCallback((customer: Customer, loan: Loan) => {
    if (Platform.OS === "web") {
      const choice = window.confirm(
        `${customer.name} has fully paid their loan.\n\nClick OK to Renew\nClick Cancel to Close`
      );
      if (choice) {
        router.push(`/profile/${customer.id}?renew=true`);
      } else {
        handleCloseCustomer(customer);
      }
    } else {
      Alert.alert(
        "Loan Fully Paid",
        `${customer.name} has paid all their balance. What would you like to do?`,
        [
          { text: "Close Account", style: "destructive", onPress: () => handleCloseCustomer(customer) },
          { text: "Renew Loan", onPress: () => router.push(`/profile/${customer.id}?renew=true`) },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  }, [handleCloseCustomer]);

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

  const handleQuickPay = useCallback(async (customer: Customer, mode: PaymentMode) => {
    if (processingPaymentsRef.current.has(customer.id)) return;

    const loan = activeLoans[customer.id];
    if (!loan || loan.balanceAmount <= 0) {
      Alert.alert("No active loan", "This customer does not have an active loan to mark paid.");
      return;
    }
    const suggested = getSuggestedPaymentAmount(loan);
    if (!user) return;

    const proceed = async () => {
      try {
        setPayingCustomerId(customer.id);
        if (!isOwner) {
          await addNestedTransaction({
            ownerUid: effectiveOwnerId!,
            nestedUid: user.uid,
            nestedEmail: user.email || "",
            customerId: customer.id,
            customerName: customer.name,
            amount: suggested,
            type: "payment",
            date: Date.now(),
            notes: `Quick pay sug: ${suggested}`,
          });
        } else {
          await addPayment(loan, suggested, Date.now(), mode);
        }
        setPaymentStatuses((current) => ({ ...current, [customer.id]: "paid" }));
        const newBalance = Math.max(0, loan.balanceAmount - suggested);
        setActiveLoans((current) => ({
          ...current,
          [customer.id]: { ...loan, balanceAmount: newBalance },
        }));
        showToast(
          "success",
          "✅ Payment Registered!",
          `Paid Rs.${suggested.toLocaleString("en-IN")} via ${mode === "PHONE" ? "PhonePe" : "Cash"} for ${customer.name}`
        );
        setPayingCustomerId(null);
        if (newBalance <= 0 && isOwner) {
          promptCloseOrRenew(customer, loan);
        }
      } catch (err: any) {
        console.error("Quick pay failed:", err);
        const errMsg = err?.message || String(err);
        showToast("error", "Payment failed", errMsg);
      } finally {
        processingPaymentsRef.current.delete(customer.id);
        setPayingCustomerId(null);
      }
    };

    processingPaymentsRef.current.add(customer.id);

    if (paymentStatuses[customer.id] === "paid") {
      const msg = `${customer.name} has already paid this week. Do you want to register an additional payment of Rs.${suggested.toLocaleString("en-IN")}?`;
      if (Platform.OS === "web") {
        if (window.confirm(msg)) {
          await proceed();
        } else {
          processingPaymentsRef.current.delete(customer.id);
        }
      } else {
        Alert.alert(
          "Already Paid",
          msg,
          [
            { text: "Cancel", style: "cancel", onPress: () => processingPaymentsRef.current.delete(customer.id) },
            { text: "Confirm", onPress: proceed }
          ]
        );
      }
    } else {
      await proceed();
    }
  }, [activeLoans, user, paymentStatuses, promptCloseOrRenew]);

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
        return { loan, amountPaid: Math.min(amountPaid, loan.balanceAmount), paymentDate: Date.now(), mode: "CASH" as const };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (entries.length === 0) return;
    // Compute which customers will reach zero balance (before API to avoid stale state)
    const fullyPaidIds = new Set(
      entries
        .filter((e) => e.loan.balanceAmount - e.amountPaid <= 0)
        .map((e) => e.loan.customerId)
    );
    try {
      setQuickCollectSaving(true);
      if (!isOwner) {
        const nestedEntries = entries.map(e => ({
          ownerUid: effectiveOwnerId!,
          nestedUid: user.uid,
          nestedEmail: user.email || "",
          customerId: e.loan.customerId,
          customerName: quickCollectCustomers.find(c => c.id === e.loan.customerId)?.name || "Unknown",
          amount: e.amountPaid,
          type: "payment",
          date: e.paymentDate,
          notes: `Batch pay`,
        }));
        await addNestedTransactionsBatch(nestedEntries);
      } else {
        await addPaymentsBatch(entries);
      }
      showToast("success", "Payments recorded", `${entries.length} payments recorded`);
      setQuickCollectOpen(false);
      await reload();
      // Prompt for fully paid customers
      if (isOwner) {
        if (fullyPaidIds.size === 1) {
          const id = [...fullyPaidIds][0];
          const c = quickCollectCustomers.find((c2) => c2.id === id);
          if (c) {
            const loan = activeLoans[c.id];
            if (loan) promptCloseOrRenew(c, loan);
          }
        } else if (fullyPaidIds.size > 1) {
          Alert.alert(
            'Fully Paid',
            `${fullyPaidIds.size} customers have fully paid their loans. Use the Close or Renew button on their cards to proceed.`,
            [{ text: 'OK' }]
          );
        }
      }
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
    if (processingPaymentsRef.current.has(manualPaymentCustomer.id)) return;

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

    const proceed = async () => {
      try {
        setPayingCustomerId(manualPaymentCustomer.id);
        if (!isOwner) {
          await addNestedTransaction({
            ownerUid: effectiveOwnerId!,
            nestedUid: user.uid,
            nestedEmail: user.email || "",
            customerId: manualPaymentCustomer.id,
            customerName: manualPaymentCustomer.name,
            amount: amount,
            type: "payment",
            date: Date.now(),
            notes: `Manual pay mode: ${manualPaymentMode}`,
          });
        } else {
          await addPayment(loan, amount, Date.now(), manualPaymentMode);
        }
        setPaymentStatuses((current) => ({ ...current, [manualPaymentCustomer.id]: "paid" }));
        const newBal = Math.max(0, loan.balanceAmount - amount);
        setActiveLoans((current) => ({
          ...current,
          [manualPaymentCustomer.id]: {
            ...loan,
            balanceAmount: newBal,
          },
        }));
        const capturedCustomer = manualPaymentCustomer;
        closeManualPayment();
        if (newBal <= 0 && capturedCustomer && isOwner) {
          promptCloseOrRenew(capturedCustomer, loan);
        }
      } catch {
        Alert.alert("Payment failed", "Could not save this payment. Please try again.");
      } finally {
        processingPaymentsRef.current.delete(manualPaymentCustomer.id);
        setPayingCustomerId(null);
      }
    };

    processingPaymentsRef.current.add(manualPaymentCustomer.id);

    if (paymentStatuses[manualPaymentCustomer.id] === "paid") {
      const msg = `${manualPaymentCustomer.name} has already paid this week. Do you want to register an additional payment of Rs.${amount.toLocaleString("en-IN")}?`;
      if (Platform.OS === "web") {
        if (window.confirm(msg)) {
          await proceed();
        } else {
          processingPaymentsRef.current.delete(manualPaymentCustomer.id);
        }
      } else {
        Alert.alert(
          "Already Paid",
          msg,
          [
            { text: "Cancel", style: "cancel", onPress: () => processingPaymentsRef.current.delete(manualPaymentCustomer.id) },
            { text: "Confirm", onPress: proceed }
          ]
        );
      }
    } else {
      await proceed();
    }
  }, [activeLoans, closeManualPayment, manualPaymentAmount, manualPaymentCustomer, manualPaymentMode, user, paymentStatuses]);

  const confirmManualDue = useCallback(async () => {
    if (!manualPaymentCustomer) return;
    const loan = activeLoans[manualPaymentCustomer.id];
    if (!loan) {
      setManualPaymentError("No active loan found.");
      return;
    }
    try {
      setPayingCustomerId(manualPaymentCustomer.id);
      await markDue(loan, Date.now());
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
      if (!isOwner) {
        await addNestedTransaction({
          ownerUid: effectiveOwnerId!,
          nestedUid: user.uid,
          nestedEmail: user.email || "",
          customerId: customer.id,
          customerName: customer.name,
          amount: 0,
          type: "DUE",
          date: Date.now(),
          notes: "Marked due (nested)",
        });
      } else {
        await markDue(loan, Date.now());
      }
      setPaymentStatuses((current) => ({ ...current, [customer.id]: "due" }));
      showToast("success", "Due marked", `${customer.name} has been marked due.`);
    } catch {
      Alert.alert("Due failed", "Could not mark this customer as due.");
    } finally {
      setPayingCustomerId(null);
    }
  }, [activeLoans, isOwner, user, effectiveOwnerId]);

  const renderCustomer = useCallback(
    ({ item }: { item: Customer }) => {
      if (statusFilter === "closed") {
        const closedLoan = closedCustomerLoans[item.id];
        return (
          <Pressable
            style={[styles.item, noTextSelection, { backgroundColor: "#F0F0F0" }]}
            onPress={() => openCustomer(item.id)}
          >
            <View style={styles.leftCol}>
              <CustomerIdBadge numericalId={item.numericalId} id={item.id} style={{ ...styles.premiumBadge, backgroundColor: "#6B7280" }} textStyle={styles.premiumBadgeText} />
              {!!item.coName && (
                <Text style={[styles.coNameUnder, { color: "#6B7280" }]} numberOfLines={2}>
                  {item.coName}
                </Text>
              )}
            </View>
            <View style={styles.centerCol}>
              <Text style={[styles.cardName, { color: "#6B7280" }]} numberOfLines={2}>
                {item.name} <Text style={{ fontSize: 10, color: "#9CA3AF" }}>[Closed]</Text>
              </Text>
              <Text style={styles.cardPhone}>{item.phone || "\u2014"}</Text>
              {closedLoan ? (
                <Text style={[styles.cardAmount, { color: "#9CA3AF" }]}>Last Balance: Rs.{Math.round(closedLoan.balanceAmount).toLocaleString("en-IN")}</Text>
              ) : null}
            </View>
            <View style={styles.divider} />
            <View style={styles.rightCol}>
              <Pressable style={[styles.actionRow, { justifyContent: "center" }]} onPress={() => router.push(`/profile/${item.id}`)}>
                <View style={[styles.actionIconSquare, { backgroundColor: "#1565C0", width: 42, height: 34 }]}>
                  <Icon name="refresh" size={14} color={colors.white} />
                </View>
              </Pressable>
              <Pressable style={[styles.actionRow, { justifyContent: "center" }]} onPress={() => handleReopenCustomer(item)}>
                <View style={[styles.actionIconSquare, { backgroundColor: "#059669", width: 42, height: 34 }]}>
                  <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "bold" }}>\u21A9</Text>
                </View>
              </Pressable>
            </View>
          </Pressable>
        );
      }
      return (
        <CustomerItem 
          customer={item} 
          onPress={openCustomer} 
          onOpenDirections={openDirections}
          onQuickPay={handleQuickPay}
          onManualPay={openManualPayment}
          onMarkDue={markCustomerDue}
          onSaveCurrentLocation={isOwner ? saveCurrentLocationForCustomer : undefined}
          onCloseRenew={promptCloseOrRenew}
          onShowQr={(c, l) => {
            setSelectedQrCustomer({ customer: c, loan: l });
            setQrCustomAmount(Math.round(getSuggestedPaymentAmount(l)).toString());
          }}
          onWhatsApp={handleWhatsApp}
          status={paymentStatuses[item.id] || 'none'} 
          isNew={isNewThisWeek(item.createdAt)}
          loan={activeLoans[item.id]}
          lastPaymentDate={lastPaymentDates[item.id]?.lastPaymentDate}
          paidLastWeek={lastPaymentDates[item.id]?.paidLastWeek}
          isPaying={payingCustomerId === item.id}
          isUpdatingLocation={updatingLocationCustomerId === item.id}
        />
      );
    },
    [activeLoans, lastPaymentDates, markCustomerDue, openCustomer, openDirections, openManualPayment, handleQuickPay, paymentStatuses, payingCustomerId, promptCloseOrRenew, saveCurrentLocationForCustomer, updatingLocationCustomerId, statusFilter, closedCustomerLoans, handleReopenCustomer, handleWhatsApp]
  );

  return (
    <AnimatedScreen style={styles.root}>
    <LinearGradient colors={[colors.background, colors.backgroundSecondary]} style={styles.root}>
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['top']}>
        <View style={styles.content}>
          <View style={styles.routeHeader}>
          {/* Header with back button */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Icon name="arrow-back" size={18} color="#D4AF6A" />
            </Pressable>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>{village?.name || 'Customers'}</Text>
                <Text style={styles.versionPill}>v2</Text>
              </View>
              <Text style={styles.headerSub}>
                {filtered.length} customer{filtered.length !== 1 ? 's' : ''} | R: {userProfile?.role || 'null'} | M: {(userProfile?.parentUid || 'null').substring(0, 5)}
              </Text>
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
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routeSummaryScroller} contentContainerStyle={styles.routeSummary}>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Total Cust.</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.total}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Today Cust.</Text>
              <Text style={styles.routeSummaryValue}>{customerStats.today}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Paid</Text>
              <Text style={[styles.routeSummaryValue, styles.routeSummaryValuePaid]}>{customerStats.paid}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Total Dues</Text>
              <Text style={[styles.routeSummaryValue, styles.routeSummaryValueDue]}>{customerStats.dues}</Text>
            </View>
            <View style={styles.routeSummaryCard}>
              <Text style={styles.routeSummaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Remaining</Text>
              <Text style={[styles.routeSummaryValue, styles.routeSummaryValueRemaining]}>{customerStats.remaining}</Text>
            </View>
          </ScrollView>

          <View style={styles.customerLegend}>
            {[
              ["#E4F3EA", "#1E7A4C", "Paid"],
              ["#FBEAEA", "#B03A3A", "Due"],
              ["#FCF2E3", "#D4AF6A", "New"],
              ["#FFFFFF", "#E1E6ED", "Regular"],
            ].map(([bg, border, label]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: bg, borderColor: border }]} />
                <Text style={styles.legendItemText}>{label}</Text>
              </View>
            ))}
          </View>
          <FlatList
            ref={flatListRef}
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={renderCustomer}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              statusFilter === "closed" && filtered.length > 0 ? (
                <Pressable
                  style={styles.reopenAllSection}
                  onPress={() => {
                    filtered.forEach((c) => {
                      handleReopenCustomer(c);
                    });
                  }}
                >
                  <Icon name="refresh" size={16} color={colors.white} />
                  <Text style={styles.reopenAllText}>Reopen All Shown</Text>
                </Pressable>
              ) : null
            }
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
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
                      <Text style={styles.quickCollectName}>{language === "te" ? translateTelugu(item.name) : item.name}</Text>
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
        <SafeAreaView style={styles.modal} edges={['top']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Customer{"\n"}Registration</Text>
              <Pressable onPress={closeAddCustomer} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
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

                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Name <Text style={styles.requiredAsterisk}>*</Text></Text>
                    <TextInput
                      placeholder="Enter customer name"
                      placeholderTextColor="#9AA6B2"
                      value={form.name}
                      onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Phone <Text style={styles.requiredAsterisk}>*</Text></Text>
                    <TextInput
                      placeholder="Phone number"
                      placeholderTextColor="#9AA6B2"
                      value={form.phone}
                      onChangeText={(t) => {
                        setForm((f) => ({ ...f, phone: t.replace(/\D/g, "").slice(0, 10) }));
                        setFormErrors((current) => ({ ...current, phone: validateIndianPhone(t) }));
                      }}
                      style={styles.input}
                      keyboardType="phone-pad"
                    />
                    {formErrors.phone ? <Text style={styles.aadharWarning}>{formErrors.phone}</Text> : null}
                  </View>
                </View>

                <View style={styles.formColumn}>
                    <Text style={styles.label}>Aadhar Number</Text>
                    <TextInput
                      placeholder="Aadhar ID"
                      placeholderTextColor="#9AA6B2"
                      value={form.aadhar}
                      onChangeText={(t) => {
                        const normalized = normalizeAadhar(t).slice(0, 12);
                        setForm((f) => ({ ...f, aadhar: normalized }));
                        setFormErrors((current) => ({ ...current, aadhar: validateAadhaar(normalized) }));
                      }}
                      style={[styles.input, aadharBlocked ? { borderColor: colors.error } : null]}
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
                      <Text style={styles.label}>Book No / ID <Text style={styles.requiredAsterisk}>*</Text></Text>
                      <TextInput
                        placeholder="e.g. 15"
                        placeholderTextColor="#9AA6B2"
                        value={form.numericalId}
                        onChangeText={(t) => {
                          const sanitized = t.replace(/\D/g, "");
                          setForm((f) => ({ ...f, numericalId: sanitized }));
                          setFormErrors((current) => ({
                            ...current,
                            numericalId: sanitized ? undefined : "Book No is required",
                          }));
                        }}
                        style={[styles.input, formErrors.numericalId ? { borderColor: colors.error } : null]}
                        keyboardType="numeric"
                      />
                      {formErrors.numericalId ? <Text style={styles.aadharWarning}>{formErrors.numericalId}</Text> : null}
                    </View>
                    <View style={styles.formColumn}>
                      <Text style={styles.label}>Co-Applicant ID</Text>
                      <TextInput
                        placeholder="Co-applicant ID"
                        placeholderTextColor="#9AA6B2"
                        value={form.coId}
                        onChangeText={(t) => setForm((f) => ({ ...f, coId: t }))}
                        style={styles.input}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                <Text style={styles.label}>Location Description</Text>
                <View style={styles.locationRow}>
                  <TextInput
                    placeholder="Enter address/location"
                    placeholderTextColor="#9AA6B2"
                    value={form.locationDesc}
                    onChangeText={(t) => setForm((f) => ({ ...f, locationDesc: t }))}
                    style={[styles.input, styles.textArea, { flex: 1 }]}
                    multiline
                    numberOfLines={2}
                  />
                  <Pressable 
                    style={[styles.locationBtn, isGettingLocation && styles.locationBtnDisabled]} 
                    onPress={getCurrentLocation}
                    disabled={isGettingLocation}
                  >
                    {isGettingLocation ? <View style={styles.locationPulse} /> : <Icon name="location" size={18} color="#D4AF6A" />}
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
                    <Text style={styles.label}>Co-Applicant Name</Text>
                    <TextInput
                      placeholder="Co-applicant name (optional)"
                      placeholderTextColor="#9AA6B2"
                      value={form.coName}
                      onChangeText={(t) => setForm((f) => ({ ...f, coName: t }))}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Principal Amount <Text style={styles.requiredAsterisk}>*</Text></Text>
                    <TextInput
                      placeholder="Enter loan amount"
                      placeholderTextColor="#9AA6B2"
                      value={form.principal}
                      onChangeText={(t) => {
                        setForm((f) => ({ ...f, principal: t }));
                        setFormErrors((current) => ({ ...current, principal: validatePositiveAmount(t, "Loan amount") }));
                      }}
                      style={styles.input}
                      keyboardType="numeric"
                    />
                    {formErrors.principal ? <Text style={styles.aadharWarning}>{formErrors.principal}</Text> : null}
                  </View>
                </View>

                <Text style={styles.label}>How was money given to customer?</Text>
                {Number(form.principal || 0) > 0 ? (
                  <View style={styles.cashToHandCard}>
                    <Text style={styles.cashToHandLabel}>Cash to hand</Text>
                    <Text style={styles.cashToHandValue}>{"\u20B9"}{cashToHand.toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
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



                <Text style={styles.label}>Submitted Documents</Text>
                <Pressable
                  style={styles.checkRow}
                  onPress={() => setForm((f) => ({ ...f, aadharSubmitted: !f.aadharSubmitted }))}
                >
                  <View style={[styles.checkbox, form.aadharSubmitted && styles.checkboxOn]}>
                    {form.aadharSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                  </View>
                  <Text style={styles.checkLabel}>Did the customer submit the Aadhar?</Text>
                </Pressable>
                <Pressable
                  style={styles.checkRow}
                  onPress={() => setForm((f) => ({ ...f, passportPhotoSubmitted: !f.passportPhotoSubmitted }))}
                >
                  <View style={[styles.checkbox, form.passportPhotoSubmitted && styles.checkboxOn]}>
                    {form.passportPhotoSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                  </View>
                  <Text style={styles.checkLabel}>Did customer submit passport size photo?</Text>
                </Pressable>
                {Number(form.principal || 0) >= 10000 && (
                  <Pressable
                    style={styles.checkRow}
                    onPress={() => setForm((f) => ({ ...f, chequeSubmitted: !f.chequeSubmitted }))}
                  >
                    <View style={[styles.checkbox, form.chequeSubmitted && styles.checkboxOn]}>
                      {form.chequeSubmitted ? <Icon name="checkmark" size={14} color={colors.white} /> : null}
                    </View>
                    <Text style={styles.checkLabel}>Did customer submit Bank Cheque? (Req. for 10K+)</Text>
                  </Pressable>
                )}

                <Text style={styles.label}>Registration Date <Text style={styles.requiredAsterisk}>*</Text></Text>
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
                    style={[styles.save, (!form.name || !form.phone || !form.principal || !form.numericalId || aadharBlocked || isRegistering) ? styles.saveDisabled : null]}
                    onPress={async () => {
                      if (!user || !village || !form.name || !form.phone || !form.principal || !form.numericalId || aadharBlocked || isRegistering) return;
                      const customId = Number(form.numericalId);
                      if (isNaN(customId) || customId <= 0) {
                        setFormErrors((f) => ({ ...f, numericalId: "Valid ID is required" }));
                        showToast("error", "Invalid Book No", "Please enter a valid positive ID.");
                        return;
                      }

                      const nextErrors = {
                        phone: validateIndianPhone(form.phone),
                        aadhar: validateAadhaar(form.aadhar),
                        principal: validatePositiveAmount(form.principal, "Loan amount"),
                        numericalId: undefined,
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
                      
                      const normalizedAadhar = normalizeAadhar(form.aadhar);
                      try {
                        setIsRegistering(true);
                        const [idTaken, blocked, existingCustomer] = await Promise.all([
                          isNumericalIdTaken(effectiveOwnerId, village.id, customId),
                          normalizedAadhar ? isAadhaarBlocked(normalizedAadhar, effectiveOwnerId) : Promise.resolve(false),
                          normalizedAadhar ? getCustomerByAadhar(effectiveOwnerId, normalizedAadhar) : Promise.resolve(null),
                        ]);

                        if (idTaken) {
                          setFormErrors((f) => ({ ...f, numericalId: "ID is already taken" }));
                          Alert.alert(
                            "Book No Taken",
                            `ID ${customId} is already assigned to a customer or blocked in this village. Please enter a different ID.`
                          );
                          return;
                        }
                        if (blocked) {
                          setAadharBlocked(true);
                          setAadharWarning("This Aadhaar is blocked. Cannot register.");
                          Alert.alert("Aadhaar Blocked", "This Aadhaar card has been blocked. Registration cannot proceed.");
                          return;
                        }
                        if (existingCustomer) {
                          Alert.alert(
                            'Duplicate Aadhar Detected',
                            `A customer with this Aadhar number already exists in our records.\n\nExisting Customer: ${existingCustomer.name}\nPhone: ${existingCustomer.phone}\nBook No: ${existingCustomer.numericalId}\n\nPlease verify the Aadhar number or contact the existing customer.`,
                            [{ text: 'OK', style: 'default' }]
                          );
                          return;
                        }

                        if (!isOwner) {
                          const tempId = `temp_cust_${Date.now()}`;
                          const nestedCustDoc = {
                            id: tempId,
                            numericalId: customId,
                            name: form.name,
                            phone: form.phone,
                            aadhar: normalizedAadhar,
                            coName: form.coName || "",
                            coId: form.coId ? Number(form.coId) : null,
                            locationDesc: form.locationDesc,
                            latitude: form.coordinates?.latitude || null,
                            longitude: form.coordinates?.longitude || null,
                            villageId: village.id,
                            masterUserId: effectiveOwnerId,
                            nestedUserId: user.uid,
                            createdAt: Date.now(),
                            isActive: true,
                            isTemp: true,
                            principal: Number(form.principal || 0),
                            disbursementMode: form.disbursementMode || "CASH",
                          };
                          await setDoc(doc(db, "nestedCustomers", tempId), nestedCustDoc);

                          const mockLoan = {
                            id: `temp_loan_${tempId}`,
                            customerId: tempId,
                            principalAmount: Number(form.principal || 0),
                            interestAmount: Number(form.principal || 0) * 0.2,
                            totalPayable: Number(form.principal || 0) * 1.2,
                            balanceAmount: Number(form.principal || 0) * 1.2,
                            userId: effectiveOwnerId,
                            startDate: nestedCustDoc.createdAt,
                            status: "ACTIVE",
                            disbursement_mode: form.disbursementMode || "CASH",
                            isTemp: true,
                          } as any;

                          setCustomers((prev) => [...prev, nestedCustDoc as any].sort((a, b) => (a.numericalId || 999999) - (b.numericalId || 999999)));
                          setActiveLoans((prev) => ({ ...prev, [tempId]: mockLoan }));
                          setPaymentStatuses((prev) => ({ ...prev, [tempId]: "none" }));
                          setLastPaymentDates((prev) => ({ ...prev, [tempId]: { lastPaymentDate: 0, paidLastWeek: false } }));
                          setShowAdd(false);
                          resetAddCustomerForm();
                          showToast("success", "Customer registered", `${nestedCustDoc.name} registered (nested).`);
                        } else {
                          const { customer: createdCustomer, loan: createdLoan } = await addCustomerWithLoan(
                            user.uid,
                            village.id,
                            village.dayOfWeek,
                            village.shift,
                            {
                              numericalId: customId,
                              name: form.name,
                              phone: form.phone,
                              aadhar: normalizedAadhar,
                              locationDesc: form.locationDesc,
                              latitude: form.coordinates?.latitude,
                              longitude: form.coordinates?.longitude,
                              aadharSubmitted: form.aadharSubmitted,
                              passportPhotoSubmitted: form.passportPhotoSubmitted,
                              chequeRequired: Number(form.principal || 0) >= 10000,
                              chequeSubmitted: Number(form.principal || 0) >= 10000 ? form.chequeSubmitted : false,
                              coName: form.coName || undefined,
                              coId: form.coId ? Number(form.coId) : undefined,
                            },
                            Number(form.principal || 0),
                            parsedDate,
                            form.disbursementMode,
                            village.name
                          );

                          setCustomers((prev) => [...prev, createdCustomer].sort((a, b) => a.numericalId - b.numericalId));
                          setActiveLoans((prev) => ({ ...prev, [createdCustomer.id]: createdLoan }));
                          setPaymentStatuses((prev) => ({ ...prev, [createdCustomer.id]: "none" }));
                          setLastPaymentDates((prev) => ({ ...prev, [createdCustomer.id]: { lastPaymentDate: 0, paidLastWeek: false } }));



                          setShowAdd(false);
                          resetAddCustomerForm();
                          showToast("success", "Customer registered", `${createdCustomer.name} has been created successfully.`);
                        }
                      } catch (error: any) {
                        console.error("Registration failed:", error);
                        showToast("error", "Registration failed", error?.message || "Could not register customer. Please try again.");
                      } finally {
                        setIsRegistering(false);
                      }
                    }}
                    disabled={!form.name || !form.phone || !form.principal || aadharBlocked || isRegistering}
                  >
                    <Text style={styles.saveTxt}>{isRegistering ? "Registering..." : "Register Customer"}</Text>
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
            <Text style={[styles.manualPaySubtitle, { color: colors.textSecondary }]}>{manualPaymentCustomer?.name ? (language === "te" ? translateTelugu(manualPaymentCustomer.name) : manualPaymentCustomer.name) : ""}</Text>
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

                  {/* Log / Mark Paid Buttons directly inside modal */}
                  <View style={styles.qrPayButtonsRow}>
                    <Pressable
                      style={[styles.qrPayBtn, { backgroundColor: "#1E7A4C" }]}
                      onPress={async () => {
                        const targetLoan = selectedQrCustomer.loan;
                        setSelectedQrCustomer(null);
                        try {
                          await addPayment(targetLoan, activeQrAmount, Date.now(), "CASH");
                          showToast("success", "Payment Recorded", `Rs. ${activeQrAmount} Cash payment saved.`);
                          reload();
                        } catch (err: any) {
                          showToast("error", "Payment Failed", err?.message || "Could not save payment.");
                        }
                      }}
                    >
                      <Text style={styles.qrPayBtnText}>Paid Cash (Rs.{activeQrAmount})</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.qrPayBtn, { backgroundColor: "#5F259F" }]}
                      onPress={async () => {
                        const targetLoan = selectedQrCustomer.loan;
                        setSelectedQrCustomer(null);
                        try {
                          await addPayment(targetLoan, activeQrAmount, Date.now(), "PHONE");
                          showToast("success", "Payment Recorded", `Rs. ${activeQrAmount} PhonePe payment saved.`);
                          reload();
                        } catch (err: any) {
                          showToast("error", "Payment Failed", err?.message || "Could not save payment.");
                        }
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
  content: { flex: 1, width: "100%", maxWidth: 430, alignSelf: "center", paddingHorizontal: 0 },
  routeHeader: { backgroundColor: "#12294A", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 10 },
  backBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: "#1E3A63", justifyContent: "center", alignItems: "center", borderWidth: 0 },
  backBtnText: { color: colors.white, fontSize: 20, fontWeight: "700" },
  headerTextWrap: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: "900", flexShrink: 1 },
  versionPill: { overflow: "hidden", borderRadius: 5, backgroundColor: "#1E3A63", color: "#D4AF6A", fontSize: 10, fontWeight: "900", paddingHorizontal: 4, paddingVertical: 1 },
  headerSub: { color: "#9FB2C9", fontSize: 11.5, marginTop: 2 },
  searchShell: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#1E3A63", borderWidth: 0, borderRadius: 10, paddingHorizontal: 13, marginBottom: 12 },
  search: { flex: 1, paddingVertical: 11, fontSize: 13 },
  compactFilterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactFilterBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.white, borderWidth: 0 },
  compactFilterText: { color: colors.blue2, fontSize: 12.5, fontWeight: "900" },
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
  reopenAllSection: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  reopenAllText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  routeSummary: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  routeSummaryScroller: { flexGrow: 0, height: 78, maxHeight: 78 },
  routeSummaryCard: { minWidth: 76, minHeight: 58, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1E6ED" },
  routeSummaryLabel: { color: "#9AA6B2", fontSize: 9, fontWeight: "900", textTransform: "uppercase", textAlign: "center" },
  routeSummaryValue: { color: "#12294A", fontSize: 16, fontWeight: "900", marginTop: 3 },
  routeSummaryValuePaid: { color: "#1E7A4C" },
  routeSummaryValueDue: { color: "#B03A3A" },
  routeSummaryValueRemaining: { color: "#9A6B1E" },
  customerLegend: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2, borderWidth: 1 },
  legendItemText: { color: "#4B5A6D", fontSize: 10, fontWeight: "700" },
  // Progress bar
  progressWrap: { marginHorizontal: 14, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  progressTrack: { flexDirection: "row", height: 8, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 7 },
  progressSegPaid: { backgroundColor: "#1E7A4C" },
  progressSegDue:  { backgroundColor: "#B03A3A" },
  progressSegRem:  { backgroundColor: "rgba(255,255,255,0.18)" },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressMsg: { color: "rgba(255,255,255,0.82)", fontSize: 11, fontWeight: "800" },
  progressRightGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressAmt: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "700" },
  progressPct: { fontSize: 13, fontWeight: "900" },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: 14, paddingBottom: 116 },
  item: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowOpacity: 0,
    elevation: 0,
  },
  leftCol: {
    alignItems: "center",
    justifyContent: "center",
    width: 58,
  },
  premiumBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0,
  },
  premiumBadgeText: {
    fontSize: 13,
    fontWeight: "900",
  },
  coPill: {
    marginTop: 3,
    backgroundColor: "#FFF2E6",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "center",
  },
  coPillText: {
    color: "#D97706",
    fontSize: 8,
    fontWeight: "800",
  },
  coNameUnder: {
    fontSize: 8.5,
    lineHeight: 10,
    color: "#1F2937",
    fontWeight: "800",
    marginTop: 2,
    textAlign: "center",
    width: "100%",
  },
  centerCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: 1,
  },
  customerNameRow: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  cardName: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "900",
    color: "#12294A",
  },
  coNameRow: { flexDirection: "row", alignItems: "center", minWidth: 0, marginTop: -1 },
  coNameText: { flexShrink: 1, color: "#4B5A6D", fontSize: 9.5, lineHeight: 13, fontWeight: "800" },
  rowStatusPill: { overflow: "hidden", fontSize: 11, fontWeight: "900", width: 18, height: 18, borderRadius: 9, textAlign: "center", lineHeight: 18 },
  phoneIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  phoneCircleBadge: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "#1E7A4C",
    justifyContent: "center",
    alignItems: "center",
  },
  cardPhone: {
    fontSize: 10.5,
    color: "#6B7A8D",
    fontWeight: "800",
  },
  callLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  upiPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(212,175,106,0.16)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  upiPillText: { color: "#9A6B1E", fontSize: 8.5, fontWeight: "900" },
  waBubble: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(37,211,102,0.12)", borderWidth: 1, borderColor: "rgba(37,211,102,0.25)" },
  amountStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 0,
  },
  balanceLabelText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "700",
  },
  cardAmount: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#12294A",
  },
  balanceCleared: {
    color: "#16a34a",
  },
  docStatusGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  docMiniSquare: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FCF9",
    borderColor: "#E8F2E8",
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    marginTop: 3,
    gap: 6,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 5,
  },
  locationPill: { alignSelf: "flex-start", maxWidth: "100%", marginTop: 2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1 },
  locationPillSaved: { backgroundColor: "#12294A", borderColor: "#12294A" },
  locationPillEmpty: { backgroundColor: "#FFFFFF", borderColor: "#E1E6ED" },
  locationIconSquare: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 0,
    backgroundColor: "#12294A",
    justifyContent: "center",
    alignItems: "center",
  },
  locationIconSquareMuted: {
    opacity: 0.5,
  },
  addressDesc: {
    fontSize: 9.5,
    color: "#4B5A6D",
    fontWeight: "800",
    lineHeight: 12,
    flexShrink: 1,
  },
  addressDescSaved: { color: "#FFFFFF" },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 2,
  },
  rightCol: {
    width: 52,
    gap: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  actionRowDisabled: {
    opacity: 0.38,
  },
  rightActionsCol: {
    gap: 4,
    alignItems: "center",
  },
  dueSquareBtn: {
    backgroundColor: "#B03A3A",
    borderRadius: 20,
    width: 48,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dueSquareBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  singlePayBtn: {
    backgroundColor: "#1E7A4C",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 28,
    shadowColor: "#1E7A4C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  singlePayBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
  },
  actionIconSquare: {
    width: 42,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  rupeeChar: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  phonepeLogoChar: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  actionLabel: {
    fontSize: 10,
    color: "#4B5563",
    fontWeight: "700",
    flex: 1,
  },
  statusBadgeContainer: { flexDirection: "row", alignItems: "center", marginTop: 2, alignSelf: "flex-start" },
  statusBadgePaidGrey: { fontSize: 8, color: "#666666", fontWeight: "700", backgroundColor: "#f5f5f5", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start" },
  statusBadgeDue: { fontSize: 8, color: "#dc3545", fontWeight: "700", backgroundColor: "#f8d7da", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start" },
  statusBadgeNew: { fontSize: 8, color: "#4F46E5", fontWeight: "700", backgroundColor: "#EEF2FF", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start" },
  statusBadgeMissed: { fontSize: 8, color: "#dc3545", fontWeight: "700", backgroundColor: "#f8d7da", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: "#f5c6cb" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 2 },
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
    zIndex: 20,
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
    zIndex: 20,
  },
  quickCollectFabText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  modal: { flex: 1, backgroundColor: "#f7f9fc" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20.8, paddingVertical: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 0.5, borderBottomColor: "#EEF1F5", gap: 8 },
  modalTitle: { fontSize: 19, fontWeight: "700", color: "#12294A", flex: 1 },
  scanHeaderBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.blue1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  scanHeaderText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F4F6F9", justifyContent: "center", alignItems: "center" },
  closeBtnText: { fontSize: 16, color: "#6B7A8D", fontWeight: "600" },
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
  cashToHandCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  cashToHandLabel: { color: "#047857", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  cashToHandValue: { color: "#064E3B", fontSize: 18, fontWeight: "900" },
  privacyBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  privacyText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  privacyOkBtn: { borderRadius: 999, backgroundColor: colors.blue1, paddingHorizontal: 12, paddingVertical: 7 },
  privacyOkText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  reviewCard: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderLeftColor: colors.teal, borderLeftWidth: 4, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14, gap: 4 },
  reviewTitle: { color: colors.ink, fontSize: 13, fontWeight: "900", marginBottom: 2 },
  reviewText: { color: colors.gray, fontSize: 12, fontWeight: "600" },
  formRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  formColumn: { flex: 1 },
  label: { fontSize: 12.5, fontWeight: "600", color: "#12294A", marginBottom: 6 },
  requiredAsterisk: { color: "#B03A3A" },
  aadharHint: { color: "#666", fontSize: 12, marginTop: -4, marginBottom: 8 },
  aadharWarning: { color: "#b91c1c", fontSize: 12, fontWeight: "600", marginTop: -4, marginBottom: 8 },
  input: { backgroundColor: "#F9FAFC", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13.5, borderWidth: 1, borderColor: "#E1E6ED", color: "#12294A", marginBottom: 8 },
  scanInputRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  scanInput: { flex: 1 },
  scanBtn: { minWidth: 70, minHeight: 50, borderRadius: 12, backgroundColor: "#12294A", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  scanBtnText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  dateInputContainer: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 16 },
  dateInput: { flex: 1 },
  datePickerBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 9, 
    backgroundColor: "#F9FAFC", 
    justifyContent: "center", 
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E1E6ED",
  },
  datePickerBtnText: { fontSize: 15, color: "#9AA6B2" },
  textArea: { height: 70, textAlignVertical: "top" },
  locationRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 16 },
  locationBtn: { width: 44, height: 44, borderRadius: 9, backgroundColor: "#12294A", justifyContent: "center", alignItems: "center", marginTop: 0 },
  locationBtnDisabled: { backgroundColor: "#ccc" },
  locationBtnText: { fontSize: 20, color: colors.white },
  locationPulse: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#1E7A4C", borderWidth: 4, borderColor: "rgba(30,122,76,0.22)" },
  useLastLocationBtn: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16, backgroundColor: "#D4AF6A22" },
  useLastLocationText: { color: "#9A6B1E", fontSize: 12.5, fontWeight: "600" },
  locationText: { fontSize: 12, color: "#666", marginBottom: 8, fontStyle: "italic" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#12294A", borderColor: "#12294A" },
  checkLabel: { flex: 1, color: "#12294A", fontSize: 13 },
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
  buttonContainer: { marginTop: 20, gap: 12, marginBottom: 20 },
  save: { backgroundColor: "#12294A", borderRadius: 10, padding: 13, alignItems: "center" },
  saveDisabled: { backgroundColor: "#D9DEE5" },
  saveTxt: { color: "#FFFFFF", fontWeight: "600", fontSize: 14.5 },
  saveTxtDisabled: { color: "#8A97A6" },
  cancelBtn: { backgroundColor: "#FFFFFF", borderRadius: 10, padding: 13, alignItems: "center", borderWidth: 1, borderColor: "#E1E6ED" },
  cancelTxt: { color: "#4B5A6D", fontWeight: "600", fontSize: 14.5 },
  cancel: { textAlign: "center", marginTop: 12, color: "#666" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  manualPayModal: { backgroundColor: colors.white, padding: 18, paddingBottom: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  manualPayTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  manualPaySubtitle: { color: colors.gray, fontSize: 13, fontWeight: "700", marginTop: -6 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: "#E1E6ED", borderRadius: 9, padding: 12, alignItems: "center", backgroundColor: "#FFFFFF" },
  modeBtnOn: { backgroundColor: "#12294A", borderColor: "#12294A" },
  modeBtnPhoneOn: { backgroundColor: "#12294A", borderColor: "#12294A" },
  modeText: { color: "#4B5A6D", fontWeight: "600" },
  modeTextOn: { color: "#FFFFFF" },
  manualPayActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  dueInlineBtn: { borderColor: "#fecaca", backgroundColor: "#fee2e2" },
  dueInlineText: { color: "#C62828", fontWeight: "900", fontSize: 14 },
  // BF section styles
  bfSection: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 8 },
  bfHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  bfTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  bfHint: { fontSize: 12, lineHeight: 17 },
  
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
