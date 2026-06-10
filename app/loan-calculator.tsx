import React, { useState, useMemo, useCallback } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Clipboard from "@react-native-clipboard/clipboard";
import { useTheme } from "../src/theme-context";
import { useLanguage } from "../src/language-context";
import Icon from "../src/Icon";
import { Gradients, Colors } from "../src/theme";
import { AnimatedScreen } from "../src/components/AnimatedScreen";

export default function LoanCalculatorScreen() {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const router = useRouter();
  const isTe = language === "te";

  // State inputs
  const [principalInput, setPrincipalInput] = useState("10000");
  const [interestInput, setInterestInput] = useState("20");
  const [weeksInput, setWeeksInput] = useState("12");

  // Parse state inputs
  const principal = useMemo(() => Number(principalInput) || 0, [principalInput]);
  const interestRate = useMemo(() => Number(interestInput) || 0, [interestInput]);
  const weeks = useMemo(() => Number(weeksInput) || 1, [weeksInput]);

  // Calculations
  const totalInterest = useMemo(() => {
    return Math.round(principal * (interestRate / 100));
  }, [principal, interestRate]);

  const totalPayable = useMemo(() => {
    return principal + totalInterest;
  }, [principal, totalInterest]);

  const weeklyInstallment = useMemo(() => {
    return Math.round(totalPayable / weeks);
  }, [totalPayable, weeks]);

  const cashToHand = useMemo(() => {
    return principal - Math.floor(principal / 1000) * 20;
  }, [principal]);

  // Generate week-by-week schedule
  const schedule = useMemo(() => {
    const list = [];
    const today = new Date();
    let remaining = totalPayable;

    for (let i = 1; i <= weeks; i++) {
      const dueDate = new Date(today);
      dueDate.setDate(today.getDate() + i * 7);

      const formattedDate = dueDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const currentInstallment = i === weeks ? remaining : Math.min(weeklyInstallment, remaining);
      remaining = Math.max(0, remaining - currentInstallment);

      list.push({
        weekNum: i,
        dateStr: formattedDate,
        installment: currentInstallment,
        closingBalance: remaining,
      });
    }
    return list;
  }, [weeks, totalPayable, weeklyInstallment]);

  // Generate plain text share/copy block
  const generateShareText = useCallback(() => {
    let text = `*${isTe ? "కార్తికేయ ఫైనాన్స్ - లోన్ షెడ్యూల్" : "KARTHIKEYA FINANCE - LOAN SCHEDULE"}* 🧾\n`;
    text += `------------------------------------\n`;
    text += `*${isTe ? "లోన్ మొత్తం (Principal)" : "Loan Amount"} :* Rs. ${principal.toLocaleString("en-IN")}\n`;
    text += `*${isTe ? "చేతికి ఇచ్చే నగదు (Cash to Hand)" : "Cash Disbursed"} :* Rs. ${cashToHand.toLocaleString("en-IN")}\n`;
    text += `*${isTe ? "వడ్డీ రేటు (Interest)" : "Interest Rate"} :* ${interestRate}%\n`;
    text += `*${isTe ? "మొత్తం తిరిగి చెల్లించాల్సినది" : "Total Payable"} :* Rs. ${totalPayable.toLocaleString("en-IN")}\n`;
    text += `*${isTe ? "వారపు వాయిదా (Installment)" : "Weekly Installment"} :* Rs. ${weeklyInstallment.toLocaleString("en-IN")}\n`;
    text += `*${isTe ? "వ్యవధి (Duration)" : "Tenure"} :* ${weeks} ${isTe ? "వారాలు" : "weeks"}\n`;
    text += `------------------------------------\n`;
    
    schedule.forEach((item) => {
      text += `W${item.weekNum} (${item.dateStr}): Rs. ${item.installment.toLocaleString("en-IN")} (Bal: Rs. ${item.closingBalance.toLocaleString("en-IN")})\n`;
    });

    text += `------------------------------------\n`;
    text += `${isTe ? "ధన్యవాదాలు! 🙏" : "Thank you! 🙏"}`;
    return text;
  }, [principal, cashToHand, interestRate, totalPayable, weeklyInstallment, weeks, schedule, isTe]);

  const handleCopy = async () => {
    const text = generateShareText();
    await Clipboard.setString(text);
    Alert.alert(isTe ? "విజయం" : "Success", isTe ? "షెడ్యూల్ క్లిప్‌బోర్డ్‌కి కాపీ చేయబడింది!" : "Schedule copied to clipboard!");
  };

  const handleShare = async () => {
    const text = generateShareText();
    if (Platform.OS === "web") {
      // Open Web WhatsApp share dialog
      Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => {
        Alert.alert("Error", "Could not open WhatsApp share.");
      });
    } else {
      try {
        await Share.share({
          message: text,
          title: "Loan Repayment Schedule",
        });
      } catch (error: any) {
        Alert.alert("Error", error.message);
      }
    }
  };

  const adjustPrincipal = (amount: number) => {
    const val = Math.max(0, principal + amount);
    setPrincipalInput(String(val));
  };

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={Gradients.screenBg} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Go back" style={styles.backBtn} onPress={() => router.back()}>
              <Icon name="arrow-back" size={20} color={Colors.nearBlack} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{isTe ? "ఆర్థిక సాధనం" : "Financial Tool"}</Text>
              <Text style={styles.title}>{isTe ? "లోన్ క్యాలిక్యులేటర్" : "Loan Calculator"}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {/* Input Cards */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.primary }]}>{isTe ? "లోన్ వివరాలు" : "Loan Parameters"}</Text>

              {/* Principal Amount Input */}
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{isTe ? "అసలు మొత్తం (Principal Amount - Rs.)" : "Principal Amount (Rs.)"}</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={principalInput}
                  onChangeText={(txt) => setPrincipalInput(txt.replace(/\D/g, ""))}
                />
              </View>
              <View style={styles.quickActionRow}>
                <Pressable style={styles.chip} onPress={() => adjustPrincipal(5000)}>
                  <Text style={styles.chipText}>+5K</Text>
                </Pressable>
                <Pressable style={styles.chip} onPress={() => adjustPrincipal(10000)}>
                  <Text style={styles.chipText}>+10K</Text>
                </Pressable>
                <Pressable style={styles.chip} onPress={() => adjustPrincipal(-5000)}>
                  <Text style={styles.chipText}>-5K</Text>
                </Pressable>
                <Pressable style={[styles.chip, { backgroundColor: colors.surfaceTint }]} onPress={() => setPrincipalInput("10000")}>
                  <Text style={styles.chipText}>Reset</Text>
                </Pressable>
              </View>

              {/* Interest Rate */}
              <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>{isTe ? "వడ్డీ శాతం (%)" : "Interest Rate (%)"}</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={interestInput}
                  onChangeText={(txt) => setInterestInput(txt.replace(/\D/g, ""))}
                />
              </View>
              <View style={styles.quickActionRow}>
                <Pressable style={[styles.chip, interestInput === "20" && styles.chipActive]} onPress={() => setInterestInput("20")}>
                  <Text style={[styles.chipText, interestInput === "20" && styles.chipTextActive]}>20%</Text>
                </Pressable>
                <Pressable style={[styles.chip, interestInput === "25" && styles.chipActive]} onPress={() => setInterestInput("25")}>
                  <Text style={[styles.chipText, interestInput === "25" && styles.chipTextActive]}>25%</Text>
                </Pressable>
                <Pressable style={[styles.chip, interestInput === "30" && styles.chipActive]} onPress={() => setInterestInput("30")}>
                  <Text style={[styles.chipText, interestInput === "30" && styles.chipTextActive]}>30%</Text>
                </Pressable>
              </View>

              {/* Duration in Weeks */}
              <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>{isTe ? "వ్యవధి (వారాలు)" : "Tenure (Weeks)"}</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={weeksInput}
                  onChangeText={(txt) => setWeeksInput(txt.replace(/\D/g, ""))}
                />
              </View>
              <View style={styles.quickActionRow}>
                <Pressable style={[styles.chip, weeksInput === "10" && styles.chipActive]} onPress={() => setWeeksInput("10")}>
                  <Text style={[styles.chipText, weeksInput === "10" && styles.chipTextActive]}>10 W</Text>
                </Pressable>
                <Pressable style={[styles.chip, weeksInput === "12" && styles.chipActive]} onPress={() => setWeeksInput("12")}>
                  <Text style={[styles.chipText, weeksInput === "12" && styles.chipTextActive]}>12 W</Text>
                </Pressable>
                <Pressable style={[styles.chip, weeksInput === "20" && styles.chipActive]} onPress={() => setWeeksInput("20")}>
                  <Text style={[styles.chipText, weeksInput === "20" && styles.chipTextActive]}>20 W</Text>
                </Pressable>
              </View>
            </View>

            {/* Calculations Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.primary }]}>{isTe ? "లోన్ సారాంశం" : "Summary Breakdown"}</Text>

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isTe ? "అసలు మొత్తం" : "Principal Amount"}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>Rs. {principal.toLocaleString("en-IN")}</Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isTe ? "వడ్డీ మొత్తం" : "Total Interest"}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>Rs. {totalInterest.toLocaleString("en-IN")}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isTe ? "తిరిగి చెల్లించే మొత్తం" : "Total Repayable"}</Text>
                <Text style={[styles.summaryValue, { color: colors.primary, fontWeight: "900" }]}>Rs. {totalPayable.toLocaleString("en-IN")}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isTe ? "వారపు వాయిదా" : "Weekly Installment"}</Text>
                <Text style={[styles.summaryValue, { color: Colors.lightSeaGreen, fontWeight: "900", fontSize: 17 }]}>Rs. {weeklyInstallment.toLocaleString("en-IN")}</Text>
              </View>

              <View style={[styles.disbursedHighlight, { backgroundColor: colors.surfaceTint }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.textSecondary }}>{isTe ? "చేతికి ఇచ్చే పంపిణీ నగదు" : "CASH TO HAND DISTRIBUTED"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "900", color: colors.teal }}>Rs. {cashToHand.toLocaleString("en-IN")}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 4, fontWeight: "700" }}>
                  {isTe ? "* ప్రతి రూ. 1,000 కి రూ. 20 మినహాయింపు" : "* Rs. 20 deducted per Rs. 1,000 principal amount."}
                </Text>
              </View>
            </View>

            {/* Sharing buttons */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: colors.blue2 }]} onPress={handleCopy}>
                <Icon name="copy-outline" size={17} color={colors.white} />
                <Text style={styles.actionBtnText}>{isTe ? "షెడ్యూల్ కాపీ" : "Copy Plan"}</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: colors.paidGreen }]} onPress={handleShare}>
                <Icon name="logo-whatsapp" size={17} color={colors.white} />
                <Text style={styles.actionBtnText}>{isTe ? "వాట్సాప్ షేర్" : "Share Plan"}</Text>
              </Pressable>
            </View>

            {/* Repayment Schedule Table */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.primary }]}>{isTe ? "తిరిగి చెల్లింపుల పట్టిక" : "Repayment Schedule"}</Text>

              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 0.6 }]}>{isTe ? "వారం" : "Wk"}</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.8 }]}>{isTe ? "తేదీ" : "Date"}</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.6, textAlign: "right" }]}>{isTe ? "వాయిదా" : "Amount"}</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.6, textAlign: "right" }]}>{isTe ? "బకాయి" : "Balance"}</Text>
              </View>

              {schedule.map((item) => (
                <View key={item.weekNum} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.tableCell, { flex: 0.6, fontWeight: "900" }]}>#{item.weekNum}</Text>
                  <Text style={[styles.tableCell, { flex: 1.8, color: colors.textSecondary }]}>{item.dateStr}</Text>
                  <Text style={[styles.tableCell, { flex: 1.6, textAlign: "right", color: colors.primary }]}>Rs. {item.installment}</Text>
                  <Text style={[styles.tableCell, { flex: 1.6, textAlign: "right", color: colors.textMuted }]}>Rs. {item.closingBalance}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "900", textTransform: "uppercase", color: Colors.textMuted },
  title: { fontSize: 22, fontWeight: "900", color: Colors.nearBlack },
  container: { paddingHorizontal: 18, paddingVertical: 12, gap: 12, paddingBottom: 40 },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 10, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: "900" },
  inputLabel: { fontSize: 12, fontWeight: "800" },
  inputContainer: { flexDirection: "row", alignItems: "center" },
  textInput: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, fontWeight: "900", backgroundColor: "#fff" },
  quickActionRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff" },
  chipActive: { backgroundColor: Colors.amberGlow, borderColor: Colors.amberGlow },
  chipText: { fontSize: 11, fontWeight: "900", color: Colors.nearBlack },
  chipTextActive: { color: "#fff" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13, fontWeight: "800" },
  summaryValue: { fontSize: 14, fontWeight: "800" },
  divider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 4 },
  disbursedHighlight: { padding: 12, borderRadius: 12, marginTop: 8 },
  actionBtn: { height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  tableHeader: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "#cbd5e1", marginTop: 4 },
  tableHeaderCell: { fontSize: 11, fontWeight: "900", color: Colors.textMuted, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1 },
  tableCell: { fontSize: 12, fontWeight: "800" },
});
