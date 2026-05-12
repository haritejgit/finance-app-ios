import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "../src/auth-context";
import { db } from "../src/firebase";
import { colors, gradient } from "../src/theme";
import { useTheme } from "../src/theme-context";
import Icon from "../src/Icon";
import { Customer, Loan, Payment, Village } from "../src/types";

const BUSINESS_START_DATE = new Date(2026, 3, 1).getTime();

let XLSX: any = null;
async function loadXLSX() {
  if (!XLSX) {
    XLSX = await import("xlsx-js-style");
  }
  return XLSX;
}

function toMillis(value: any) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function money(value: any) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatSheetDate(ts: number) {
  const d = new Date(ts);
  return `${`${d.getDate()}`.padStart(2, "0")}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${d.getFullYear()}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { isDark, toggleDarkMode } = useTheme();
  const [isExporting, setIsExporting] = useState(false);

  const exportWholeData = async () => {
    if (!user || isExporting) return;

    try {
      setIsExporting(true);
      const XLSX = await loadXLSX();
      const fetchUserCollection = async <T,>(name: string): Promise<T[]> => {
        const snap = await getDocs(query(collection(db, name), where("userId", "==", user.uid)));
        return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) })) as T[];
      };

      const [villages, customers, loansRaw, paymentsRaw] = await Promise.all([
        fetchUserCollection<Village>("villages"),
        fetchUserCollection<Customer>("customers"),
        fetchUserCollection<Loan>("loans"),
        fetchUserCollection<Payment>("payments"),
      ]);

      const activeCustomers = customers.filter((customer) => customer.isActive !== false);
      const loans = loansRaw.map((loan) => ({
        ...loan,
        startDate: toMillis(loan.startDate),
        principalAmount: money(loan.principalAmount),
        totalPayable: money(loan.totalPayable),
      }));
      const payments = paymentsRaw.map((payment) => ({
        ...payment,
        paymentDate: toMillis(payment.paymentDate),
        amountPaid: money(payment.amountPaid),
      }));

      if (activeCustomers.length === 0 || villages.length === 0) {
        Alert.alert("No Data Found", "No customers or villages found for this account.");
        return;
      }

      const BLACK = "000000";
      const WHITE = "FFFFFF";
      const BLUE = "1565C0";
      const ORANGE = "C55A11";
      const RED = "FF0000";
      const GRAY = "C0C0C0";
      const baseAlignment = { horizontal: "center", vertical: "center", wrapText: true };
      const headerStyle = {
        font: { bold: true, color: { rgb: BLACK } },
        fill: { patternType: "solid", fgColor: { rgb: GRAY } },
        alignment: baseAlignment,
      };
      const standardStyle = { alignment: baseAlignment };
      const dueStyle = {
        font: { bold: true, color: { rgb: WHITE } },
        fill: { patternType: "solid", fgColor: { rgb: RED } },
        alignment: baseAlignment,
      };
      const orangeStyle = { font: { bold: true, color: { rgb: ORANGE } }, alignment: baseAlignment };
      const redTextStyle = { font: { bold: true, color: { rgb: RED } }, alignment: baseAlignment };

      const wb = XLSX.utils.book_new();
      const orderedDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const orderedShifts = ["Morning", "Evening"];
      const allDates = [
        ...loans.map((loan) => loan.startDate),
        ...payments.map((payment) => payment.paymentDate),
        ...activeCustomers.map((customer) => toMillis(customer.createdAt)),
      ].filter((ts) => ts > 0);
      const minDate = Math.max(BUSINESS_START_DATE, startOfDay(Math.min(...allDates, Date.now())));
      const maxDate = startOfDay(Math.max(...allDates, Date.now()));
      const weekDates: number[] = [];
      for (let cursor = minDate; cursor <= maxDate; cursor += 7 * 24 * 60 * 60 * 1000) {
        weekDates.push(cursor);
      }

      const makeSheetName = (dayName: string, shiftName: string) =>
        `${dayName} ${shiftName}`.replace(/[\\/?*[\]:]/g, "").slice(0, 31);

      for (const dayName of orderedDays) {
        for (const shiftName of orderedShifts) {
          const shiftVillages = villages.filter((village) => village.dayOfWeek === dayName && village.shift === shiftName);
          const shiftCustomers = activeCustomers.filter((customer) => shiftVillages.some((village) => village.id === customer.villageId));
          if (shiftCustomers.length === 0) continue;

          const sheetData: any[][] = [
            [`${dayName} ${shiftName}`],
            ["ID", "C/O", "Name", "Village, Phone Number and Aadhar", ...weekDates.map(formatSheetDate)],
          ];
          const cellStyles = new Map<string, any>();
          const setStyle = (rowIndex: number, colIndex: number, style: any) => {
            cellStyles.set(XLSX.utils.encode_cell({ r: rowIndex, c: colIndex }), style);
          };
          setStyle(0, 0, { font: { bold: true, color: { rgb: BLACK }, sz: 12 }, alignment: baseAlignment });
          for (let col = 0; col < 4 + weekDates.length; col += 1) setStyle(1, col, headerStyle);

          const weeklyCollected = new Array(weekDates.length).fill(0);
          const weeklyDisbursed = new Array(weekDates.length).fill(0);
          const sortedVillages = [...shiftVillages].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

          sortedVillages.forEach((village) => {
            const villageCustomers = shiftCustomers
              .filter((customer) => customer.villageId === village.id)
              .sort((a, b) => (a.numericalId ?? Number.MAX_SAFE_INTEGER) - (b.numericalId ?? Number.MAX_SAFE_INTEGER));
            if (villageCustomers.length === 0) return;

            const villageHeaderRow = sheetData.length;
            sheetData.push([`Village: ${village.name}`]);
            for (let col = 0; col < 4 + weekDates.length; col += 1) {
              setStyle(villageHeaderRow, col, {
                font: col === 0 ? { bold: true, color: { rgb: WHITE }, sz: 11 } : undefined,
                fill: { patternType: "solid", fgColor: { rgb: BLUE } },
                alignment: baseAlignment,
              });
            }

            villageCustomers.forEach((customer) => {
              const rowIndex = sheetData.length;
              const customerLoans = loans.filter((loan) => loan.customerId === customer.id);
              const customerPayments = payments.filter((payment) =>
                customerLoans.some((loan) => loan.id === payment.loanId) || payment.customerId === customer.id
              );
              const row: any[] = [
                customer.numericalId ?? "",
                customer.coId?.toString() ?? customer.coName ?? "",
                customer.name ?? "",
                `${village.name}\n${customer.phone ?? ""}\n${customer.aadhar ?? ""}`,
              ];
              for (let col = 0; col < 4; col += 1) setStyle(rowIndex, col, standardStyle);

              weekDates.forEach((weekDate, weekIndex) => {
                const endOfWeek = weekDate + 7 * 24 * 60 * 60 * 1000 - 1;
                const colIndex = 4 + weekIndex;
                const weekPayments = customerPayments.filter((payment) => payment.paymentDate >= weekDate && payment.paymentDate <= endOfWeek);
                const loanStartingThisWeek = customerLoans.find((loan) => {
                  const loanStartDay = startOfDay(loan.startDate);
                  return loanStartDay >= weekDate && loanStartDay <= endOfWeek;
                });

                if (loanStartingThisWeek) {
                  const renewalPayment = weekPayments.find((payment) => payment.paymentType === "RENEWAL_CLOSURE");
                  const displayedAmount = money(loanStartingThisWeek.totalPayable);
                  const principalAmount = money(loanStartingThisWeek.principalAmount);
                  weeklyDisbursed[weekIndex] += principalAmount;
                  if (renewalPayment) {
                    const previousBalance = money(renewalPayment.amountPaid);
                    weeklyCollected[weekIndex] += previousBalance;
                    row.push(`${Math.trunc(previousBalance)}\n${Math.trunc(displayedAmount)}`);
                  } else {
                    row.push(Math.trunc(displayedAmount));
                  }
                  setStyle(rowIndex, colIndex, orangeStyle);
                  return;
                }

                const regularPayment = weekPayments
                  .filter((payment) => payment.paymentType === "REGULAR")
                  .reduce((sum, payment) => sum + money(payment.amountPaid), 0);
                if (regularPayment > 0) {
                  weeklyCollected[weekIndex] += regularPayment;
                  row.push(regularPayment);
                  setStyle(rowIndex, colIndex, standardStyle);
                } else if (weekPayments.some((payment) => payment.paymentType === "DUE")) {
                  row.push("Due");
                  setStyle(rowIndex, colIndex, dueStyle);
                } else {
                  row.push("");
                  setStyle(rowIndex, colIndex, standardStyle);
                }
              });
              sheetData.push(row);
            });
          });

          sheetData.push([]);
          const collectedRowIndex = sheetData.length;
          sheetData.push(["", "", "", "TOTAL COLLECTED", ...weeklyCollected]);
          const disbursedRowIndex = sheetData.length;
          sheetData.push(["", "", "", "TOTAL DISBURSED", ...weeklyDisbursed.map((amount) => amount - (amount / 100) * 2)]);
          weekDates.forEach((_, index) => {
            setStyle(collectedRowIndex, 4 + index, orangeStyle);
            setStyle(disbursedRowIndex, 4 + index, redTextStyle);
          });
          setStyle(collectedRowIndex, 3, orangeStyle);
          setStyle(disbursedRowIndex, 3, redTextStyle);

          const ws = XLSX.utils.aoa_to_sheet(sheetData);
          cellStyles.forEach((style, cellRef) => {
            if (ws[cellRef]) ws[cellRef].s = style;
          });
          ws["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 35 }, ...weekDates.map(() => ({ wch: 15 }))];
          ws["!rows"] = sheetData.map((_, index) => (index >= 2 && index < collectedRowIndex - 1 ? { hpt: 48 } : { hpt: 24 }));
          XLSX.utils.book_append_sheet(wb, ws, makeSheetName(dayName, shiftName));
        }
      }

      const summaryRows = [
        ["Metric", "Value"],
        ["Customers", activeCustomers.length],
        ["Villages", villages.length],
        ["Loans", loans.length],
        ["Payments", payments.length],
        ["Generated", new Date().toLocaleString()],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const filename = `Whole_Data_Weekly_Tracker_${Date.now()}.xlsx`;
      if (Platform.OS === "web") {
        const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const base64 = arrayBufferToBase64(excelBuffer);
        const fileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: "Export Whole Data",
          });
        }
      }
      Alert.alert("Export Complete", `Whole data downloaded as ${filename}`);
    } catch (error: any) {
      Alert.alert("Export Failed", error?.message ?? "Unable to export whole data.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={colors.white} />
          </Pressable>

          <View style={styles.header}>
            <View style={styles.avatar}>
              <Icon name="person" size={28} color={colors.white} />
            </View>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Account and session details</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Icon name="mail-outline" size={18} color={colors.blue2} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.label}>Signed in as</Text>
                <Text style={styles.value}>{user?.email || "Unknown user"}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Icon name="id-card-outline" size={18} color={colors.teal} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.label}>Display name</Text>
                <Text style={styles.value}>{user?.displayName || "User"}</Text>
              </View>
            </View>

            <View style={styles.themeRow}>
              <View style={styles.infoIcon}>
                <Icon name={isDark ? "moon-outline" : "sunny-outline"} size={18} color={colors.coral} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.label}>Theme</Text>
                <Text style={styles.value}>{isDark ? "Dark mode" : "Light mode"}</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleDarkMode}
                trackColor={{ false: colors.border, true: colors.blue2 }}
                thumbColor={colors.white}
              />
            </View>

            <Pressable
              style={[styles.exportBtn, isExporting && styles.exportBtnDisabled]}
              onPress={exportWholeData}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Icon name="document-text-outline" size={18} color={colors.white} />
              )}
              <Text style={styles.exportText}>{isExporting ? "Exporting Whole Data..." : "Export Whole Data"}</Text>
            </Pressable>

            <Pressable
              style={styles.logoutBtn}
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Icon name="log-out-outline" size={18} color={colors.white} />
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, width: "100%", maxWidth: Math.min(screenWidth - 32, 430), alignSelf: "center", padding: 16, justifyContent: "center", gap: 18 },
  backBtn: { position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  header: { alignItems: "center", gap: 8 },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  title: { fontSize: 28, fontWeight: "800", color: colors.white },
  subtitle: { color: "rgba(255,255,255,0.78)", fontSize: 14 },
  card: { backgroundColor: colors.white, borderRadius: 22, padding: 20, gap: 14, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  themeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  infoIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.sky },
  infoCopy: { flex: 1 },
  label: { color: colors.gray, fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  value: { color: colors.ink, fontWeight: "800", fontSize: 15, marginTop: 2 },
  exportBtn: { marginTop: 8, borderRadius: 14, backgroundColor: colors.blue2, padding: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  exportBtnDisabled: { opacity: 0.65 },
  exportText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  logoutBtn: { marginTop: 8, borderRadius: 14, backgroundColor: colors.coral, padding: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  logoutText: { color: colors.white, fontWeight: "800", fontSize: 15 },
});
