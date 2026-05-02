import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
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
import { addCustomerWithLoan, getCustomers, getVillageById } from "../../src/repository";
import { Customer, Village } from "../../src/types";
import { colors } from "../../src/theme";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const CustomerRow = memo(function CustomerRow({
  customer,
  onOpen,
}: {
  customer: Customer;
  onOpen: (customerId: string) => void;
}) {
  return (
    <Pressable style={styles.item} onPress={() => onOpen(customer.id)}>
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
      </View>
      <Pressable style={styles.quickCallBtn} onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
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
  const { user } = useAuth();
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

  const reload = async () => {
    if (!user || !villageId) return;
    const [list, villageDetails] = await Promise.all([getCustomers(user.uid, villageId), getVillageById(villageId)]);
    setCustomers(list);
    setVillage(villageDetails);
  };
  useEffect(() => {
    reload();
  }, [user, villageId]);

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
    if (!normalizedQuery) return customers;
    return customers.filter((c) =>
      [c.name, c.phone, c.numericalId.toString(), c.coName || "", c.coId?.toString() || ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [customers, query]);

  const openCustomer = useCallback((customerId: string) => {
    router.push(`/profile/${customerId}`);
  }, []);

  const renderCustomer = useCallback(
    ({ item }: { item: Customer }) => <CustomerRow customer={item} onOpen={openCustomer} />,
    [openCustomer]
  );

  return (
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['top']}>
        <View style={styles.content}>
          <TextInput 
            value={query} 
            onChangeText={setQuery} 
            placeholder="Search customers..." 
            style={styles.search}
            placeholderTextColor="rgba(255,255,255,0.6)"
          />
          
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={renderCustomer}
            initialNumToRender={10}
            maxToRenderPerBatch={5}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== "ios"}
            getItemLayout={(data, index) => (
              { length: 70, offset: 70 * index, index }
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No customers found</Text>
              </View>
            }
          />
          
          <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addTxt}>ADD CUSTOMER</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <SafeAreaView style={[styles.modal, { paddingTop: insets.top }]} edges={['top']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Customer Registration</Text>
              <Pressable onPress={() => setShowAdd(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
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
                    <Text style={styles.label}>Phone *</Text>
                    <TextInput
                      placeholder="Phone number"
                      placeholderTextColor="#999"
                      value={form.phone}
                      onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
                      style={styles.input}
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
                      const createdCustomer = await addCustomerWithLoan(
                        user.uid,
                        village.id,
                        village.dayOfWeek,
                        village.shift,
                        {
                          name: form.name,
                          phone: form.phone,
                          aadhar: form.aadhar,
                          locationDesc: form.locationDesc,
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
  search: { backgroundColor: "rgba(255,255,255,0.15)", borderColor: colors.white, borderWidth: 1, borderRadius: 22, color: colors.white, padding: 12, marginBottom: 10 },
  item: { backgroundColor: colors.white, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 36, height: 36, textAlign: "center", textAlignVertical: "center", borderRadius: 18, backgroundColor: "#eaf2ff", color: colors.blue2, fontWeight: "700" },
  idContainer: { alignItems: "center", gap: 4 },
  coIdBadge: { fontSize: 10, textAlign: "center", backgroundColor: "#fff3e0", color: "#f57c00", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontWeight: "600" },
  name: { fontWeight: "700", fontSize: 16, color: "#333" },
  phone: { color: "#777" },
  coName: { color: "#666", fontSize: 12, fontStyle: "italic", marginTop: 2 },
  quickCallBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#4CAF50", justifyContent: "center", alignItems: "center" },
  quickCallText: { fontSize: 18, color: colors.white },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  emptyText: { color: colors.white, fontSize: 16 },
  addBtn: { backgroundColor: colors.white, borderRadius: 28, padding: 16, alignItems: "center", marginVertical: 10 },
  addTxt: { color: colors.blue2, fontWeight: "800" },
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
