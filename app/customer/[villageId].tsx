import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import * as Location from "expo-location";
import { useAuth } from "../../src/auth-context";
import { useTheme } from "../../src/theme-context";
import { colors } from "../../src/theme";
import { addCustomerWithLoan, getCustomers, getPaymentStatusesForCustomersToday, getVillageById, getCustomerLoanSummary } from "../../src/repository";
import { Customer, Village } from "../../src/types";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// Helper to check if date is today
function isToday(timestamp: number): boolean {
  const date = new Date(timestamp);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}

// Get customer payment status for today
type PaymentStatus = 'paid' | 'due' | 'none';

function normalizeAadhar(aadhar?: string) {
  return (aadhar ?? "").replace(/\D/g, "").trim();
}

const CustomerItem = React.memo(function CustomerItem({ customer, onPress, status, isNew }: { customer: Customer; onPress: () => void; status: PaymentStatus; isNew?: boolean }) {
  const getStatusBadge = useCallback(() => {
    switch (status) {
      case 'paid':
        return <Text style={styles.statusBadgePaidGrey}>✓ PAID</Text>;
      case 'due':
        return <Text style={styles.statusBadgeDue}>✗ DUE</Text>;
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

  return (
    <Pressable 
      style={[styles.item, { backgroundColor: getBackgroundColor(), borderColor: getBorderColor(), borderWidth: status !== 'none' || isNew ? 2 : 0 }]} 
      onPress={onPress}
    >
      <View style={styles.idContainer}>
        <Text style={styles.badge}>{customer.numericalId}</Text>
        {customer.coId && (
          <Text style={styles.coIdBadge}>C/O: {customer.coId}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{customer.name}</Text>
        <Text style={styles.phone}>{customer.phone}</Text>
        {customer.coName && (
          <Text style={styles.coName}>{customer.coName}</Text>
        )}
        {isNew && (
          <Text style={styles.statusBadgeNew}>NEW</Text>
        )}
        {getStatusBadge()}
      </View>
      <Pressable 
        style={styles.quickCallBtn} 
        onPress={(e) => {
          e.stopPropagation();
          Linking.openURL(`tel:${customer.phone}`);
        }}
      >
        <Text style={styles.quickCallText}>CALL</Text>
      </Pressable>
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
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [village, setVillage] = useState<Village | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", aadhar: "", locationDesc: "", coName: "", coId: "", principal: "", coordinates: null as { latitude: number; longitude: number } | null });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [registrationDate, setRegistrationDate] = useState(formatDateInput(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempRegistrationDate, setTempRegistrationDate] = useState<Date>(new Date());
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [aadharWarning, setAadharWarning] = useState("");
  const [aadharChecking, setAadharChecking] = useState(false);

  const reload = async () => {
    if (!user || !villageId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [list, villageDetails] = await Promise.all([getCustomers(user.uid, villageId), getVillageById(villageId)]);
    // Sort customers by numericalId
    const sortedList = list.sort((a, b) => a.numericalId - b.numericalId);
    setCustomers(sortedList);
    setVillage(villageDetails);
    
    const statuses = await getPaymentStatusesForCustomersToday(user.uid, sortedList.map((customer) => customer.id));
    setPaymentStatuses(statuses);
    setIsLoading(false);
  };
  useEffect(() => {
    // Wait for Firebase Auth to resolve before fetching
    if (authLoading) return;
    reload();
  }, [user, villageId, authLoading]);

  useEffect(() => {
    if (!showAdd || !user) {
      setAadharWarning("");
      setAadharChecking(false);
      return;
    }

    const normalizedAadhar = normalizeAadhar(form.aadhar);
    if (normalizedAadhar.length < 4) {
      setAadharWarning("");
      setAadharChecking(false);
      return;
    }

    let cancelled = false;
    setAadharChecking(true);
    const timeout = setTimeout(async () => {
      try {
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

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setForm(prev => ({
        ...prev,
        coordinates: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        }
      }));
    } catch (error) {
      alert('Failed to get location');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let result = customers;
    if (normalizedQuery) {
      result = customers.filter((c) =>
        [c.name, c.phone, c.numericalId.toString(), c.coName || "", c.coId?.toString() || ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    }
    // Always sort by numericalId
    return result.sort((a, b) => a.numericalId - b.numericalId);
  }, [customers, query]);

  const openCustomer = useCallback((customerId: string) => {
    router.push(`/profile/${customerId}`);
  }, []);

  const renderCustomer = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerItem 
        customer={item} 
        onPress={() => openCustomer(item.id)} 
        status={paymentStatuses[item.id] || 'none'} 
        isNew={isToday(item.createdAt)}
      />
    ),
    [openCustomer, paymentStatuses]
  );

  return (
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['top']}>
        <View style={styles.content}>
          {/* Header with back button */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>←</Text>
            </Pressable>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>{village?.name || 'Customers'}</Text>
              <Text style={styles.headerSub}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>

          <TextInput 
            value={query} 
            onChangeText={setQuery} 
            placeholder="Search customers..." 
            style={[styles.search, { backgroundColor: isDark ? colors.grayLight : 'rgba(255,255,255,0.15)', color: colors.text }]}
            placeholderTextColor={isDark ? colors.gray : "rgba(255,255,255,0.6)"}
          />
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={renderCustomer}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={15}
            windowSize={10}
            removeClippedSubviews={true}
            getItemLayout={(data, index) => (
              { length: 64, offset: 64 * index, index }
            )}
            updateCellsBatchingPeriod={50}
            disableVirtualization={false}
            legacyImplementation={false}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.white} />
                  <Text style={styles.loadingText}>Loading customers...</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyText}>No customers yet</Text>
                  <Text style={styles.emptySubText}>Tap + to add the first customer</Text>
                </View>
              )
            }
          />
          
          <Pressable style={styles.fab} onPress={() => setShowAdd(true)}>
            <Text style={styles.fabIcon}>+</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <SafeAreaView style={[styles.modal, { paddingTop: insets.top, backgroundColor: colors.background }]} edges={['top']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.modalHeader, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Customer Registration</Text>
              <Pressable onPress={() => setShowAdd(false)} style={styles.closeBtn}>
                <Text style={[styles.closeBtnText, { color: colors.gray }]}>✕</Text>
              </Pressable>
            </View>
            
            <View style={styles.formContainer}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScrollContent}>
                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Name *</Text>
                    <TextInput
                      placeholder="Enter customer name"
                      placeholderTextColor="#999"
                      value={form.name}
                      onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={[styles.label, { color: colors.text }]}>Phone *</Text>
                    <TextInput
                      placeholder="Phone number"
                      placeholderTextColor={colors.gray}
                      value={form.phone}
                      onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
                      style={[styles.input, { backgroundColor: colors.white, borderColor: colors.border, color: colors.text }]}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Aadhar Number</Text>
                    <TextInput
                      placeholder="Aadhar ID"
                      placeholderTextColor="#999"
                      value={form.aadhar}
                      onChangeText={(t) => setForm((f) => ({ ...f, aadhar: t }))}
                      style={styles.input}
                      keyboardType="numeric"
                    />
                    {aadharChecking ? (
                      <Text style={styles.aadharHint}>Checking Aadhar...</Text>
                    ) : aadharWarning ? (
                      <Text style={styles.aadharWarning}>{aadharWarning}</Text>
                    ) : null}
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Co-Applicant ID</Text>
                    <TextInput
                      placeholder="Co-applicant ID"
                      placeholderTextColor="#999"
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
                    placeholderTextColor="#999"
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
                    <Text style={styles.locationBtnText}>
                      {isGettingLocation ? "..." : "📍"}
                    </Text>
                  </Pressable>
                </View>
                {form.coordinates && (
                  <Text style={styles.locationText}>
                    📍 Location captured: {form.coordinates.latitude.toFixed(6)}, {form.coordinates.longitude.toFixed(6)}
                  </Text>
                )}

                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Co-Applicant Name</Text>
                    <TextInput
                      placeholder="Co-applicant name (optional)"
                      placeholderTextColor="#999"
                      value={form.coName}
                      onChangeText={(t) => setForm((f) => ({ ...f, coName: t }))}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.label}>Principal Amount *</Text>
                    <TextInput
                      placeholder="Enter loan amount"
                      placeholderTextColor="#999"
                      value={form.principal}
                      onChangeText={(t) => setForm((f) => ({ ...f, principal: t }))}
                      style={styles.input}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Text style={styles.label}>Registration Date *</Text>
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
                    style={[styles.save, !form.name || !form.phone || !form.principal ? styles.saveDisabled : null]}
                    onPress={async () => {
                      if (!user || !village || !form.name || !form.phone || !form.principal) return;
                      const parsedDate = parseDateInput(registrationDate);
                      if (!parsedDate) {
                        alert('Please enter a valid registration date');
                        return;
                      }
                      
                      // Check if customer already exists by Aadhar
                      const normalizedAadhar = normalizeAadhar(form.aadhar);
                      if (normalizedAadhar) {
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
                          coName: form.coName || undefined,
                          coId: form.coId ? Number(form.coId) : undefined,
                        },
                        Number(form.principal || 0),
                        parsedDate
                      );
                      setShowAdd(false);
                      setCustomers((current) => [...current, createdCustomer]);
                      setForm({ name: "", phone: "", aadhar: "", locationDesc: "", coName: "", coId: "", principal: "", coordinates: null });
                      setRegistrationDate(formatDateInput(Date.now()));
                      Alert.alert('✅ Success', `Customer "${createdCustomer.name}" has been created successfully!`);
                    }}
                    disabled={!form.name || !form.phone || !form.principal}
                  >
                    <Text style={styles.saveTxt}>Register Customer</Text>
                  </Pressable>
                  
                  <Pressable onPress={() => setShowAdd(false)} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancel</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, width: "100%", maxWidth: Math.min(Dimensions.get("window").width - 32, 370), alignSelf: "center", paddingTop: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  backBtnText: { color: colors.white, fontSize: 20, fontWeight: "700" },
  headerTextWrap: { flex: 1 },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: "700" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  search: { backgroundColor: "rgba(255,255,255,0.15)", borderColor: colors.white, borderWidth: 1, borderRadius: 22, color: colors.white, padding: 12, marginBottom: 10 },
  list: { flex: 1 },
  listContent: { paddingBottom: 20 },
  item: { backgroundColor: colors.white, borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { width: 32, height: 32, textAlign: "center", textAlignVertical: "center", borderRadius: 16, backgroundColor: "#eaf2ff", color: colors.blue2, fontSize: 13, fontWeight: "700" },
  idContainer: { alignItems: "center", gap: 4 },
  coIdBadge: { fontSize: 10, textAlign: "center", backgroundColor: "#fff3e0", color: "#f57c00", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontWeight: "600" },
  name: { fontWeight: "600", fontSize: 15, color: "#333" },
  phone: { color: "#777", fontSize: 13 },
  coName: { color: "#666", fontSize: 11, fontStyle: "italic", marginTop: 1 },
  statusBadgePaid: { fontSize: 10, color: "#28a745", fontWeight: "700", marginTop: 4, backgroundColor: "#d4edda", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start" },
  statusBadgePaidGrey: { fontSize: 10, color: "#666666", fontWeight: "700", marginTop: 4, backgroundColor: "#f5f5f5", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: "#999999" },
  statusBadgeDue: { fontSize: 10, color: "#dc3545", fontWeight: "700", marginTop: 4, backgroundColor: "#f8d7da", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start" },
  statusBadgeNew: { fontSize: 10, color: "#374151", fontWeight: "700", marginTop: 4, backgroundColor: "#f3f4f6", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: "#9ca3af" },
  quickCallBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#4CAF50", justifyContent: "center", alignItems: "center" },
  quickCallText: { fontSize: 16, color: colors.white },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptySubText: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { color: colors.white, fontSize: 14, opacity: 0.8 },
  fab: { 
    position: 'absolute', 
    right: 16, 
    bottom: 16, 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    backgroundColor: colors.blue2, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  fabIcon: { color: colors.white, fontSize: 24, fontWeight: '300' },
  modal: { flex: 1, backgroundColor: "#f7f9fc" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  modalTitle: { fontSize: 24, fontWeight: "700", color: "#333", flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#f0f0f0", justifyContent: "center", alignItems: "center" },
  closeBtnText: { fontSize: 18, color: "#666", fontWeight: "600" },
  formContainer: { flex: 1, padding: 20 },
  formScrollContent: { paddingBottom: 20 },
  formRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  formColumn: { flex: 1 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 6 },
  aadharHint: { color: "#666", fontSize: 12, marginTop: -4, marginBottom: 8 },
  aadharWarning: { color: "#b91c1c", fontSize: 12, fontWeight: "600", marginTop: -4, marginBottom: 8 },
  input: { backgroundColor: colors.white, borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: "#e0e0e0", marginBottom: 8 },
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
  locationText: { fontSize: 12, color: "#666", marginBottom: 8, fontStyle: "italic" },
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
});
