import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, router } from "expo-router";
import React, { memo, useEffect, useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Alert,
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
} from "react-native";
import * as Location from "expo-location";
import { useAuth } from "../../src/auth-context";
import {
  addPayment,
  deleteCustomer,
  deletePayment,
  getActiveLoan,
  getCustomerById,
  getPaymentsForCustomer,
  markDue,
  renewLoan,
  updateCustomer,
  updateLoan,
  updatePayment
} from "../../src/repository";
import { Customer, Loan, PaymentMode, PaymentType } from "../../src/types";
import { colors } from "../../src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const PaymentHistory = memo(function PaymentHistory({ 
  payments, 
  onEdit, 
  onDelete 
}: { 
  payments: any[];
  onEdit?: (payment: any) => void;
  onDelete?: (payment: any) => void;
}) {
  if (payments.length === 0) {
    return (
      <View style={styles.emptyHistoryContainer}>
        <Text style={styles.emptyHistoryIcon}>📋</Text>
        <Text style={styles.emptyHistoryTitle}>No Transactions</Text>
        <Text style={styles.emptyHistorySubtitle}>Payment history will appear here</Text>
      </View>
    );
  }

  return (
    <>
      {payments.map((p) => (
        <View key={p.id} style={styles.paymentCard}>
          <View style={styles.paymentHeader}>
            <View style={styles.paymentDateContainer}>
              <Text style={styles.paymentDate}>
                {new Date(p.paymentDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              <Text style={styles.paymentYear}>
                {new Date(p.paymentDate).getFullYear()}
              </Text>
            </View>
            <View style={styles.paymentAmountContainer}>
              <Text style={styles.paymentAmount}>Rs.{p.amountPaid.toFixed(2)}</Text>
              <View style={[styles.paymentTypeBadge, {
                backgroundColor: (p.paymentType as PaymentType) === "DUE" ? colors.missedRed : colors.paidGreen,
              }]}>
                <Text style={styles.paymentTypeText}>
                  {(p.paymentType as PaymentType) === "DUE" ? "DUE" : p.paymentType}
                </Text>
              </View>
            </View>
          </View>
          {p.paymentMode === "CASH" && (
            <Text style={styles.paymentMode}>Cash Payment</Text>
          )}
          {p.paymentMode === "PHONE" && (
            <Text style={styles.paymentMode}>Phone Payment</Text>
          )}
          {/* Edit/Delete buttons for regular payments only */}
          {p.paymentType === "REGULAR" && onEdit && onDelete && (
            <View style={styles.paymentActions}>
              <Pressable style={styles.editPaymentBtn} onPress={() => onEdit(p)}>
                <Text style={styles.editPaymentBtnText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.deletePaymentBtn} onPress={() => onDelete(p)}>
                <Text style={styles.deletePaymentBtnText}>Delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </>
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

export default function ProfileScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [renewAmount, setRenewAmount] = useState("");
  const [paymentDateInput, setPaymentDateInput] = useState(formatDateInput(Date.now()));
  const [dueDateInput, setDueDateInput] = useState(formatDateInput(Date.now()));
  const [paymentDateError, setPaymentDateError] = useState("");
  const [dueDateError, setDueDateError] = useState("");
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [tempPaymentDate, setTempPaymentDate] = useState<Date>(new Date());
  const [tempDueDate, setTempDueDate] = useState<Date>(new Date());
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    aadhar: "",
    locationDesc: "",
    coName: "",
    coId: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

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
  
  // Loan edit state
  const [editLoanOpen, setEditLoanOpen] = useState(false);
  const [editLoanAmount, setEditLoanAmount] = useState("");
  const [editLoanDate, setEditLoanDate] = useState(formatDateInput(Date.now()));
  const [editLoanDateError, setEditLoanDateError] = useState("");
  const [showEditLoanDatePicker, setShowEditLoanDatePicker] = useState(false);
  const [tempEditLoanDate, setTempEditLoanDate] = useState<Date>(new Date());

  const makePhoneCall = (phoneNumber: string) => {
    const phoneUrl = `tel:${phoneNumber}`;
    Linking.openURL(phoneUrl).catch(() => {
      alert('Unable to make phone call');
    });
  };

  const openEditModal = () => {
    if (!customer) return;
    setEditForm({
      name: customer.name,
      phone: customer.phone,
      aadhar: customer.aadhar,
      locationDesc: customer.locationDesc || "",
      coName: customer.coName || "",
      coId: customer.coId?.toString() || "",
      latitude: customer.latitude ?? null,
      longitude: customer.longitude ?? null,
    });
    setEditOpen(true);
  };

  // Function to open Google Maps with customer location
  const openGoogleMaps = () => {
    if (!customer?.latitude || !customer?.longitude) {
      alert('Customer location not available');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}`;
    Linking.openURL(url).catch(() => {
      alert('Unable to open maps');
    });
  };

  // Function to update customer location in edit modal
  const updateEditLocation = async () => {
    setIsUpdatingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setEditForm(prev => ({
        ...prev,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }));
    } catch (error) {
      alert('Failed to get location');
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const updateCustomerDetails = async () => {
    if (!customer || !user) return;
    
    const updatedCustomer: Customer = {
      id: customer.id,
      numericalId: customer.numericalId,
      name: editForm.name,
      phone: editForm.phone,
      aadhar: editForm.aadhar,
      locationDesc: editForm.locationDesc,
      latitude: editForm.latitude ?? customer.latitude,
      longitude: editForm.longitude ?? customer.longitude,
      coName: editForm.coName || undefined,
      coId: editForm.coId ? Number(editForm.coId) : undefined,
      villageId: customer.villageId,
      userId: customer.userId,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
    };
    
    await updateCustomer(updatedCustomer);
    setEditOpen(false);
    await reload();
  };

  const reload = async () => {
    if (!user || !customerId) return;
    const [c, l, p] = await Promise.all([
      getCustomerById(customerId),
      getActiveLoan(user.uid, customerId),
      getPaymentsForCustomer(user.uid, customerId),
    ]);
    setCustomer(c);
    setLoan(l || null);
    setPayments(p);
  };
  useEffect(() => {
    reload();
  }, [user, customerId]);

  const civilScore = useMemo(() => {
    if (!payments.length) return 750;
    const regular = payments.filter((p) => p.paymentType === "REGULAR");
    const good = regular.filter((p) => p.amountPaid > 0).length;
    const score = 300 + Math.round(600 * (good / Math.max(regular.length, 1)));
    return Math.max(300, Math.min(900, score));
  }, [payments]);

  const confirmPayment = async () => {
    Keyboard.dismiss();
    const parsedDate = parseDateInput(paymentDateInput);
    if (!parsedDate) {
      setPaymentDateError("Enter date as YYYY-MM-DD");
      return;
    }
    setPaymentDateError("");
    await addPayment(loan, Number(amount || 0), toStartOfDay(parsedDate), mode);
    setPayOpen(false);
    setAmount("");
    await reload();
  };

  const closePaymentModal = () => {
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
    await markDue(loan, toStartOfDay(parsedDate));
    setDueOpen(false);
    await reload();
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
    if (!editingPayment) return;
    
    const parsedDate = parseDateInput(editPaymentDate);
    if (!parsedDate) {
      setEditPaymentError("Enter date as YYYY-MM-DD");
      return;
    }
    setEditPaymentError("");
    
    await updatePayment(
      editingPayment,
      Number(editPaymentAmount || 0),
      toStartOfDay(parsedDate),
      editPaymentMode
    );
    
    closeEditPaymentModal();
    await reload();
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

  // Loan edit handlers
  const openEditLoanModal = () => {
    if (!loan) return;
    setEditLoanAmount(loan.principalAmount.toString());
    setEditLoanDate(formatDateInput(loan.startDate));
    setEditLoanDateError("");
    setTempEditLoanDate(new Date(loan.startDate));
    setEditLoanOpen(true);
  };

  const closeEditLoanModal = () => {
    setEditLoanOpen(false);
    setEditLoanAmount("");
    setEditLoanDate(formatDateInput(Date.now()));
    setEditLoanDateError("");
    setShowEditLoanDatePicker(false);
  };

  const confirmEditLoan = async () => {
    if (!loan || !user) return;
    
    const parsedDate = parseDateInput(editLoanDate);
    if (!parsedDate) {
      setEditLoanDateError("Enter date as YYYY-MM-DD");
      return;
    }
    setEditLoanDateError("");
    
    await updateLoan(
      loan,
      Number(editLoanAmount || 0),
      parsedDate
    );
    
    closeEditLoanModal();
    await reload();
  };

  const confirmDeletePayment = async () => {
    if (!deletingPayment) return;
    await deletePayment(deletingPayment);
    closeDeletePaymentConfirm();
    await reload();
  };

  return (
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Text style={styles.title}>{customer?.name || "Profile"}</Text>
            <Text style={styles.card}>Civil Score: {civilScore}</Text>
            <Text style={styles.card}>Current Balance: Rs.{loan?.balanceAmount?.toFixed(2) ?? "0.00"}</Text>
            {!!customer && (
              <View style={styles.infoContainer}>
                <Text style={styles.info}>
                  BOOK NO: {customer.numericalId} | <Pressable onPress={() => makePhoneCall(customer.phone)}><Text style={styles.phoneLink}>Phone: {customer.phone}</Text></Pressable> | Aadhar: {customer.aadhar}
                </Text>
                {(customer.coName || customer.coId) && (
                  <Text style={styles.info}>
                    C/O: {customer.coName || 'N/A'} {customer.coId ? `(ID: ${customer.coId})` : ''}
                  </Text>
                )}
                {customer.locationDesc && (
                  <Text style={styles.info}>
                    📍 Location: {customer.locationDesc}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.actionGrid}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.paidGreen }]}
                onPress={() => {
                  setPaymentDateInput(formatDateInput(Date.now()));
                  setPaymentDateError("");
                  setPayOpen(true);
                }}
              >
                <Text style={styles.actionIcon}>💵</Text>
                <Text style={styles.actionLabel}>Pay</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.missedRed }]}
                onPress={() => {
                  setDueDateInput(formatDateInput(Date.now()));
                  setDueDateError("");
                  setDueOpen(true);
                }}
              >
                <Text style={styles.actionIcon}>⚠️</Text>
                <Text style={styles.actionLabel}>Due</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.amber }]} onPress={() => setRenewOpen(true)}>
                <Text style={styles.actionIcon}>🔄</Text>
                <Text style={styles.actionLabel}>Renew</Text>
              </Pressable>
              {loan && (
                <Pressable style={[styles.actionBtn, { backgroundColor: colors.blue3 }]} onPress={openEditLoanModal}>
                  <Text style={styles.actionIcon}>✏️</Text>
                  <Text style={styles.actionLabel}>Edit</Text>
                </Pressable>
              )}
            </View>
            
            <View style={styles.iconBar}>
              <Pressable style={styles.iconBtn} onPress={openEditModal}>
                <Text style={styles.iconBtnIcon}>👤</Text>
              </Pressable>
              <Pressable 
                style={[styles.iconBtn, !customer?.latitude && styles.iconBtnDisabled]} 
                onPress={openGoogleMaps}
                disabled={!customer?.latitude}
              >
                <Text style={styles.iconBtnIcon}>📍</Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => setDeleteCustomerConfirmOpen(true)}>
                <Text style={[styles.iconBtnIcon, { color: colors.missedRed }]}>🗑️</Text>
              </Pressable>
            </View>
            <Text style={styles.history}>Transaction History</Text>
            <PaymentHistory 
              payments={payments} 
              onEdit={openEditPaymentModal}
              onDelete={openDeletePaymentConfirm}
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={payOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Record Payment</Text>
            <TextInput placeholder="Amount" value={amount} onChangeText={setAmount} style={styles.input} keyboardType="numeric" />
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
                  value={paymentDateInput}
                  onChangeText={setPaymentDateInput}
                  style={styles.input}
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
                      setPaymentDateInput(formatDateInput(selected.getTime()));
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
            <View style={styles.row}>
              {(["CASH", "PHONE"] as const).map((m) => (
                <Pressable key={m} onPress={() => setMode(m)} style={[styles.chip, mode === m && styles.chipOn]}>
                  <Text style={mode === m ? styles.chipOnText : styles.chipText}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.primary}
              onPress={confirmPayment}
            >
              <Text style={styles.primaryText}>Confirm</Text>
            </Pressable>
            <Pressable
              style={styles.cancelModalBtn}
              onPress={closePaymentModal}
            >
              <Text style={styles.cancelModalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={dueOpen} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Mark as Due</Text>
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
                  value={dueDateInput}
                  onChangeText={setDueDateInput}
                  style={styles.input}
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
                      setDueDateInput(formatDateInput(selected.getTime()));
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
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Renew Loan</Text>
            <TextInput placeholder="New Principal Amount" value={renewAmount} onChangeText={setRenewAmount} style={styles.input} keyboardType="numeric" />
            <Pressable
              style={styles.primary}
              onPress={async () => {
                if (!loan) return;
                await renewLoan(loan, Number(renewAmount || 0), Date.now());
                setRenewOpen(false);
                setRenewAmount("");
                await reload();
              }}
            >
              <Text style={styles.primaryText}>Renew Now</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Loan Modal */}
      <Modal visible={editLoanOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Loan</Text>
            
            <Text style={styles.inputLabel}>Loan Amount (Principal)</Text>
            <TextInput 
              placeholder="Loan Amount" 
              value={editLoanAmount} 
              onChangeText={setEditLoanAmount} 
              style={styles.input} 
              keyboardType="numeric" 
            />
            
            <Text style={styles.inputLabel}>Loan Start Date</Text>
            {Platform.OS === "web" ? (
              <input
                type="date"
                value={editLoanDate}
                onChange={(e) => setEditLoanDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  marginBottom: 8,
                  fontSize: 16,
                }}
              />
            ) : (
              <>
                <TextInput
                  placeholder="YYYY-MM-DD"
                  value={editLoanDate}
                  onChangeText={setEditLoanDate}
                  style={styles.input}
                />
                {editLoanDate && parseDateInput(editLoanDate) && (
                  <Text style={styles.datePreview}>
                    {formatDateWithDay(parseDateInput(editLoanDate)!)}
                  </Text>
                )}
                <Pressable style={styles.dateBtn} onPress={() => {
                  setTempEditLoanDate(new Date(parseDateInput(editLoanDate) ?? Date.now()));
                  setShowEditLoanDatePicker(true);
                }}>
                  <Text style={styles.dateBtnText}>Pick Date</Text>
                </Pressable>
              </>
            )}
            {editLoanDateError ? <Text style={styles.errorText}>{editLoanDateError}</Text> : null}
            
            {showEditLoanDatePicker && Platform.OS !== "web" && (
              <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                <DateTimePicker
                  value={tempEditLoanDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, date) => {
                    if (date) {
                      setTempEditLoanDate(date);
                      if (Platform.OS !== "ios") {
                        setEditLoanDate(formatDateInput(date.getTime()));
                        setShowEditLoanDatePicker(false);
                      }
                    }
                  }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    style={styles.pickerDoneBtn}
                    onPress={() => {
                      setEditLoanDate(formatDateInput(tempEditLoanDate.getTime()));
                      setShowEditLoanDatePicker(false);
                    }}
                  >
                    <Text style={styles.pickerDoneBtnText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <Pressable style={styles.primary} onPress={confirmEditLoan}>
                <Text style={styles.primaryText}>Save Changes</Text>
              </Pressable>
              <Pressable style={styles.cancelModalBtn} onPress={closeEditLoanModal}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Customer Details</Text>
            
            <TextInput
              placeholder="Customer Name"
              value={editForm.name}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, name: text }))}
              style={styles.input}
            />
            
            <TextInput
              placeholder="Phone Number"
              value={editForm.phone}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, phone: text }))}
              style={styles.input}
              keyboardType="phone-pad"
            />
            
            <TextInput
              placeholder="Aadhar Number"
              value={editForm.aadhar}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, aadhar: text }))}
              style={styles.input}
            />
            
            <TextInput
              placeholder="Location Description"
              value={editForm.locationDesc}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, locationDesc: text }))}
              style={styles.input}
            />

            {/* Location Update Section */}
            <View style={styles.locationUpdateSection}>
              <Text style={styles.locationLabel}>Current Location:</Text>
              {editForm.latitude && editForm.longitude ? (
                <Text style={styles.locationCoords}>
                  📍 {editForm.latitude.toFixed(6)}, {editForm.longitude.toFixed(6)}
                </Text>
              ) : (
                <Text style={styles.locationNotSet}>No location set</Text>
              )}
              <Pressable 
                style={[styles.updateLocationBtn, isUpdatingLocation && styles.updateLocationBtnDisabled]} 
                onPress={updateEditLocation}
                disabled={isUpdatingLocation}
              >
                <Text style={styles.updateLocationBtnText}>
                  {isUpdatingLocation ? 'Getting Location...' : editForm.latitude ? '📍 Update Location' : '📍 Set Location'}
                </Text>
              </Pressable>
            </View>
            
            <TextInput
              placeholder="C/O Name"
              value={editForm.coName}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, coName: text }))}
              style={styles.input}
            />
            
            <TextInput
              placeholder="C/O ID"
              value={editForm.coId}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, coId: text }))}
              style={styles.input}
              keyboardType="numeric"
            />
            
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelModalBtn} onPress={() => setEditOpen(false)}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={updateCustomerDetails}>
                <Text style={styles.primaryText}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal visible={editPaymentOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Payment</Text>
            <TextInput 
              placeholder="Amount" 
              value={editPaymentAmount} 
              onChangeText={setEditPaymentAmount} 
              style={styles.input} 
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
              <Pressable style={styles.primary} onPress={confirmEditPayment}>
                <Text style={styles.primaryText}>Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Payment Confirmation Modal */}
      <Modal visible={deletePaymentConfirmOpen} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { maxHeight: 200 }]}>
            <Text style={styles.modalTitle}>Delete Payment</Text>
            <Text style={{ marginBottom: 20, textAlign: "center" }}>
              Are you sure you want to delete this payment of Rs.{deletingPayment?.amountPaid?.toFixed(2)}?
              This will restore the loan balance.
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
              Are you sure you want to delete {customer?.name}?
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
                  if (!customer) return;
                  setIsDeletingCustomer(true);
                  try {
                    await deleteCustomer(customer.id);
                    setDeleteCustomerConfirmOpen(false);
                    router.back();
                  } catch (error) {
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  content: { width: "100%", maxWidth: Math.min(Dimensions.get("window").width - 32, 370), alignSelf: "center", gap: 12 },
  title: { color: colors.white, fontSize: 26, fontWeight: "700" },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 14, color: colors.blue2, fontWeight: "700" },
  info: { color: colors.white, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 12 },
  infoContainer: { gap: 8 },
  phoneLink: { color: "#4FC3F7", textDecorationLine: "underline" },
  row: { flexDirection: "row", gap: 10 },
  action: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
  actionTxt: { color: colors.white, fontWeight: "800" },
  
  // New clean action grid
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  actionBtn: { flex: 1, minWidth: 70, padding: 12, borderRadius: 12, alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 24 },
  actionLabel: { color: colors.white, fontSize: 12, fontWeight: '600' },
  
  // Icon bar for secondary actions
  iconBar: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginVertical: 12 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  iconBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
  iconBtnIcon: { fontSize: 24 },
  
  outline: { borderWidth: 1, borderColor: colors.white, borderRadius: 14, padding: 12, alignItems: "center" },
  outlineText: { color: colors.white, fontWeight: "700" },
  delete: { color: "#ffd6d6", textAlign: "center" },
  editBtn: { backgroundColor: colors.white, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 2, borderColor: colors.amber },
  editBtnText: { color: colors.blue2, fontWeight: "700" },
  editLoanBtn: { borderWidth: 1, borderColor: colors.amber, borderRadius: 14, padding: 12, alignItems: "center", backgroundColor: colors.amber },
  editLoanBtnText: { color: colors.white, fontWeight: "700" },
  inputLabel: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 4 },
  datePreview: { fontSize: 12, color: "#666", fontStyle: "italic", marginBottom: 8 },
  history: { color: colors.white, fontSize: 18, fontWeight: "700" },
  emptyHistoryContainer: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 40, alignItems: "center", marginVertical: 20 },
  emptyHistoryIcon: { fontSize: 48, marginBottom: 16 },
  emptyHistoryTitle: { fontSize: 18, fontWeight: "700", color: colors.white, marginBottom: 8 },
  emptyHistorySubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  paymentCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12 },
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
  chipText: { color: "#555" },
  chipOnText: { color: colors.blue2, fontWeight: "700" },
  primary: { backgroundColor: colors.blue2, borderRadius: 12, padding: 14, alignItems: "center" },
  primaryText: { color: colors.white, fontWeight: "700" },
  errorText: { color: "#b91c1c", fontSize: 12, marginTop: -4 },
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
  locationUpdateSection: { backgroundColor: "#f8f9fa", borderRadius: 12, padding: 16, marginVertical: 8, borderWidth: 1, borderColor: "#e0e0e0" },
  locationLabel: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  locationCoords: { fontSize: 14, color: "#28a745", marginBottom: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  locationNotSet: { fontSize: 14, color: "#999", marginBottom: 12, fontStyle: "italic" },
  updateLocationBtn: { backgroundColor: colors.blue2, borderRadius: 10, padding: 12, alignItems: "center" },
  updateLocationBtnDisabled: { backgroundColor: "#ccc" },
  updateLocationBtnText: { color: colors.white, fontWeight: "700", fontSize: 14 },
});
