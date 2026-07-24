import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState, useEffect, useMemo } from "react";
import { ActivityIndicator, Alert, Dimensions, Platform, Pressable, StyleSheet, Switch, Text, View, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { collection, getDocs, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { useAuth } from "../../src/auth-context";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { db } from "../../src/firebase";
import { colors as baseColors, getGradient } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import Icon from "../../src/Icon";
import { Customer, Loan, Payment, Village } from "../../src/types";
import { createBackupSnapshot, makeBackupFilename, parseBackupSnapshot, restoreBackupSnapshot } from "../../src/backup";
import { downloadTextFile } from "../../src/exports";
import { toMillis, money, startOfDay, isRealCollectionPayment, getLoanDistributedAmount, weekStart, calculateDisbursedAmount } from "../../src/business-logic";
import { useLanguage } from "../../src/language-context";
import { createNestedAuthUser, updateNestedAccountStatus, deleteNestedAccount, reconcileNestedTransactions } from "../../src/repository";
import { showToast } from "../../src/notify";

const BUSINESS_START_DATE = new Date(2026, 3, 1).getTime();

let XLSX: any = null;
async function loadXLSX() {
  if (!XLSX) {
    XLSX = await import("xlsx-js-style");
  }
  return XLSX;
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
  const { user, userProfile, logout } = useAuth();
  const isOwner = !userProfile || userProfile.role !== "nested";
  const effectiveOwnerId = isOwner ? user?.uid : userProfile?.parentUid;
  
  const { isDark, toggleDarkMode, colorScheme, setColorScheme, colors } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [nestedAccounts, setNestedAccounts] = useState<any[]>([]);
  const [nestedTransactionsList, setNestedTransactionsList] = useState<any[]>([]);
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerLabel, setRegisterLabel] = useState("");
  const [registerBf, setRegisterBf] = useState("0");
  const [isRegisteringNested, setIsRegisteringNested] = useState(false);
  const [selectedTxnIds, setSelectedTxnIds] = useState<Record<string, boolean>>({});

  // Export filters
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportSelectedNestedUid, setExportSelectedNestedUid] = useState("all");
  const [isExportingNested, setIsExportingNested] = useState(false);

  useEffect(() => {
    if (user?.uid && isOwner) {
      const qAcc = query(collection(db, "nestedAccounts"), where("ownerUid", "==", user.uid));
      const unsubAcc = onSnapshot(qAcc, (snap) => {
        setNestedAccounts(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      });

      const qTxns = query(collection(db, "nestedTransactions"), where("ownerUid", "==", user.uid), where("exported", "==", false));
      const unsubTxns = onSnapshot(qTxns, (snap) => {
        setNestedTransactionsList(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      });

      return () => {
        unsubAcc();
        unsubTxns();
      };
    } else if (user?.uid && !isOwner) {
      const qTxns = query(collection(db, "nestedTransactions"), where("nestedUid", "==", user.uid), where("exported", "==", false));
      const unsubTxns = onSnapshot(qTxns, (snap) => {
        setNestedTransactionsList(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      });
      return unsubTxns;
    }
  }, [user?.uid, isOwner]);

  const handleRegisterNested = async () => {
    if (!registerEmail.trim() || !registerPassword.trim()) {
      Alert.alert("Invalid Input", "Please fill in email and password.");
      return;
    }
    if (registerPassword.length < 6) {
      Alert.alert("Invalid Input", "Password must be at least 6 characters.");
      return;
    }
    try {
      setIsRegisteringNested(true);
      const emailLower = registerEmail.trim().toLowerCase();
      const bfVal = Number(registerBf) || 0;
      const newUid = await createNestedAuthUser(emailLower, registerPassword);
      
      await setDoc(doc(db, "nestedAccounts", newUid), {
        id: newUid,
        ownerUid: user.uid,
        masterUserId: user.uid,
        nestedUid: newUid,
        label: registerLabel.trim() || "Vacation Cover",
        active: true,
        nestedEmail: emailLower,
        balancingFund: bfVal,
        createdAt: Date.now()
      });
      await setDoc(doc(db, "users", newUid), {
        id: newUid,
        userId: newUid,
        role: "nested",
        parentUid: user.uid,
        active: true,
        email: emailLower,
        name: registerLabel.trim() || "Vacation Cover",
        createdAt: Date.now()
      });

      // Write daily balancingFund doc for today
      const todayDateStr = new Date().toISOString().split("T")[0];
      const nestedBfDocId = `${user.uid}_nested_${newUid}_${todayDateStr}`;
      await setDoc(doc(db, "balancingFund", nestedBfDocId), {
        id: nestedBfDocId,
        ownerUid: user.uid,
        nestedUid: newUid,
        userId: user.uid,
        amount: bfVal,
        dateStr: todayDateStr,
        isNestedBF: true,
        updatedAt: Date.now(),
      });
      
      Alert.alert("Success", `Nested account ${emailLower} registered.`);
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterLabel("");
      setRegisterBf("0");
    } catch (e: any) {
      Alert.alert("Registration Failed", e?.message || "Could not register nested account.");
    } finally {
      setIsRegisteringNested(false);
    }
  };

  const handleToggleNestedActive = async (nestedUid: string, currentStatus: boolean) => {
    try {
      await updateNestedAccountStatus(nestedUid, !currentStatus);
      showToast("success", "Status updated", "Nested account status changed.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update status.");
    }
  };

  const handleDeleteNested = async (nestedUid: string) => {
    const proceed = async () => {
      try {
        await deleteNestedAccount(nestedUid);
        showToast("success", "Deleted", "Nested account mappings deleted.");
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not delete nested account.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete this nested account? Access will be removed immediately.")) {
        await proceed();
      }
    } else {
      Alert.alert("Confirm Deletion", "Are you sure you want to delete this nested account? Access will be removed immediately.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: proceed },
      ]);
    }
  };

  const handleReconcileTxns = async (action: "export" | "delete") => {
    const ids = Object.keys(selectedTxnIds).filter(id => selectedTxnIds[id]);
    if (ids.length === 0) {
      Alert.alert("No selection", "Please select at least one transaction to reconcile.");
      return;
    }
    
    const confirmMsg = action === "export"
      ? `Mark ${ids.length} selected transactions as reconciled/exported?`
      : `Delete ${ids.length} selected transactions? This cannot be undone.`;
      
    const proceed = async () => {
      try {
        const { addDoc, collection: col } = await import("firebase/firestore");
        await addDoc(col(db, "debugLogs"), {
          timestamp: Date.now(),
          message: "reconcile attempt",
          action,
          ids,
          userUid: user?.uid || null,
          isOwner,
        });
        await reconcileNestedTransactions(ids, action);
        showToast("success", "Reconciliation done", `${ids.length} transactions processed.`);
        setSelectedTxnIds({});
      } catch (e: any) {
        const { addDoc, collection: col } = await import("firebase/firestore");
        await addDoc(col(db, "debugLogs"), {
          timestamp: Date.now(),
          message: "reconcile error",
          action,
          ids,
          errorName: e?.name || null,
          errorMessage: e?.message || null,
          userUid: user?.uid || null,
        }).catch(() => {});
        Alert.alert("Failed", e?.message || "Could not reconcile transactions.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(confirmMsg)) {
        await proceed();
      }
    } else {
      Alert.alert("Confirm Reconciliation", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: proceed },
      ]);
    }
  };

  const exportNestedTransactions = async () => {
    if (!user || isExportingNested) return;
    try {
      setIsExportingNested(true);
      const XLSX = await loadXLSX();

      let startTs = 0;
      let endTs = Date.now();
      if (exportStartDate) {
        const parsed = new Date(exportStartDate).getTime();
        if (Number.isFinite(parsed)) startTs = parsed;
      }
      if (exportEndDate) {
        const parsed = new Date(exportEndDate).getTime();
        if (Number.isFinite(parsed)) endTs = parsed + 24 * 60 * 60 * 1000 - 1;
      }

      // Fetch collections from Firestore
      const [villages, customers, loansRaw, nestedCustomersRaw, nestedTransactionsRaw, nestedExpensesRaw] = await Promise.all([
        getDocs(query(collection(db, "villages"), where("userId", "==", effectiveOwnerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
        getDocs(query(collection(db, "customers"), where("userId", "==", effectiveOwnerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
        getDocs(query(collection(db, "loans"), where("userId", "==", effectiveOwnerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
        getDocs(query(collection(db, "nestedCustomers"), where("masterUserId", "==", effectiveOwnerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
        getDocs(query(collection(db, "nestedTransactions"), where("ownerUid", "==", effectiveOwnerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
        getDocs(query(collection(db, "nestedExpenses"), where("ownerUid", "==", effectiveOwnerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any))),
      ]);

      const activeCustomers = customers.filter(c => c.isActive !== false);

      // Determine selected user filter
      const selectedNestedUid = isOwner ? exportSelectedNestedUid : user.uid;

      // Filter data in memory
      let filteredTxns = [...nestedTransactionsRaw];
      let filteredNestedCusts = [...nestedCustomersRaw];
      let filteredExpenses = [...nestedExpensesRaw];

      if (selectedNestedUid !== "all") {
        filteredTxns = filteredTxns.filter(t => t.nestedUid === selectedNestedUid);
        filteredNestedCusts = filteredNestedCusts.filter(c => c.nestedUserId === selectedNestedUid);
        filteredExpenses = filteredExpenses.filter(e => e.nestedUid === selectedNestedUid);
      }

      if (startTs > 0) {
        filteredTxns = filteredTxns.filter(t => (t.date || t.createdAt) >= startTs);
        filteredNestedCusts = filteredNestedCusts.filter(c => c.createdAt >= startTs);
        filteredExpenses = filteredExpenses.filter(e => e.date >= startTs);
      }
      if (endTs < Date.now()) {
        filteredTxns = filteredTxns.filter(t => (t.date || t.createdAt) <= endTs);
        filteredNestedCusts = filteredNestedCusts.filter(c => c.createdAt <= endTs);
        filteredExpenses = filteredExpenses.filter(e => e.date <= endTs);
      }

      if (filteredTxns.length === 0 && filteredNestedCusts.length === 0 && filteredExpenses.length === 0) {
        Alert.alert("No Data", "No nested transactions, temporary customer registrations, or expenses found matching the filters.");
        return;
      }

      // Collect all transaction dates to determine week columns
      const allTxnDates = [
        ...filteredTxns.map(t => t.date || t.createdAt),
        ...filteredNestedCusts.map(c => c.createdAt),
      ].filter(ts => ts > 0);

      const minDate = allTxnDates.length > 0
        ? weekStart(Math.min(...allTxnDates))
        : weekStart(startTs > 0 ? startTs : Date.now());

      const maxDate = allTxnDates.length > 0
        ? weekStart(Math.max(...allTxnDates))
        : weekStart(endTs < Date.now() ? endTs : Date.now());

      const weekDates: number[] = [];
      for (let cursor = minDate; cursor <= maxDate; cursor += 7 * 24 * 60 * 60 * 1000) {
        weekDates.push(cursor);
      }
      if (weekDates.length === 0) {
        weekDates.push(weekStart(Date.now()));
      }

      const activeNestedCusts = filteredNestedCusts.filter(c => c.isActive !== false);
      const allCustomers = [...activeCustomers, ...activeNestedCusts];

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
      const makeSheetName = (dayName: string, shiftName: string) =>
        `${dayName} ${shiftName}`.replace(/[\\/?*[\]:]/g, "").slice(0, 31);

      // Generate Day+Shift Sheets
      for (const dayName of orderedDays) {
        for (const shiftName of orderedShifts) {
          const shiftVillages = villages.filter((village) => village.dayOfWeek === dayName && village.shift === shiftName);
          const shiftCustomers = allCustomers.filter((customer) => shiftVillages.some((village) => village.id === customer.villageId));
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
              const customerTxns = filteredTxns.filter(t => t.customerId === customer.id);
              
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
                const weekTxns = customerTxns.filter(t => (t.date || t.createdAt) >= weekDate && (t.date || t.createdAt) <= endOfWeek);

                // Check if this is a temporary/nested customer disbursed this week
                const isTempCustomerDisbursedThisWeek = customer.isTemp && customer.createdAt >= weekDate && customer.createdAt <= endOfWeek;
                // Check if renewal disbursement this week
                const renewalDisb = weekTxns.find(t => t.type === "RENEWAL_DISBURSEMENT");

                if (isTempCustomerDisbursedThisWeek || renewalDisb) {
                  const principalVal = isTempCustomerDisbursedThisWeek 
                    ? (customer.principal || 0)
                    : (renewalDisb ? (renewalDisb.amount || 0) : 0);
                  
                  const displayedAmount = principalVal * 1.2;
                  weeklyDisbursed[weekIndex] += calculateDisbursedAmount(principalVal);

                  const closureTxn = weekTxns.find(t => t.type === "RENEWAL_CLOSURE");
                  if (closureTxn) {
                    const otherPaymentsSum = weekTxns
                      .filter((t) => t.id !== closureTxn.id && t.type === "payment")
                      .reduce((sum, t) => sum + (t.amount || 0), 0);
                    const previousBalance = (closureTxn.amount || 0) + otherPaymentsSum;
                    weeklyCollected[weekIndex] += previousBalance;
                    row.push(`${Math.trunc(previousBalance)}\n${Math.trunc(displayedAmount)}`);
                  } else {
                    row.push(Math.trunc(displayedAmount));
                  }
                  setStyle(rowIndex, colIndex, orangeStyle);
                  return;
                }

                // Regular payments
                const regularPayment = weekTxns
                  .filter(t => t.type === "payment")
                  .reduce((sum, t) => sum + (t.amount || 0), 0);

                if (regularPayment > 0) {
                  weeklyCollected[weekIndex] += regularPayment;
                  row.push(regularPayment);
                  setStyle(rowIndex, colIndex, standardStyle);
                } else if (weekTxns.some(t => t.type === "DUE")) {
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
          sheetData.push(["", "", "", "TOTAL DISBURSED", ...weeklyDisbursed]);
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

      // Generate Expenses Sheet
      const expenseHeaderStyle = {
        font: { bold: true, color: { rgb: BLACK } },
        fill: { patternType: "solid", fgColor: { rgb: GRAY } },
        alignment: baseAlignment,
      };

      const expenseRows: any[][] = [
        ["Nested Expenses Report"],
        ["Date", "Amount", "Note / Description", "Nested User"],
      ];

      const expenseStyles = new Map<string, any>();
      const setExpenseStyle = (rIdx: number, cIdx: number, style: any) => {
        expenseStyles.set(XLSX.utils.encode_cell({ r: rIdx, c: cIdx }), style);
      };

      setExpenseStyle(0, 0, { font: { bold: true, color: { rgb: BLACK }, sz: 12 }, alignment: baseAlignment });
      for (let col = 0; col < 4; col++) {
        setExpenseStyle(1, col, expenseHeaderStyle);
      }

      let totalExpensesAmount = 0;
      const sortedExpenses = [...filteredExpenses].sort((a, b) => b.date - a.date);

      sortedExpenses.forEach((exp) => {
        const rIdx = expenseRows.length;
        const formattedDate = new Date(exp.date).toLocaleDateString("en-IN") + " " + new Date(exp.date).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' });
        
        const nAcc = nestedAccounts.find(a => a.nestedUid === exp.nestedUid);
        const userLabel = nAcc ? `${nAcc.label}` : exp.nestedUid;

        expenseRows.push([
          formattedDate,
          exp.amount || 0,
          exp.note || "",
          userLabel
        ]);

        totalExpensesAmount += (exp.amount || 0);

        setExpenseStyle(rIdx, 0, standardStyle);
        setExpenseStyle(rIdx, 1, { alignment: { horizontal: "right", vertical: "center" } });
        setExpenseStyle(rIdx, 2, { alignment: { horizontal: "left", vertical: "center" } });
        setExpenseStyle(rIdx, 3, { alignment: { horizontal: "left", vertical: "center" } });
      });

      expenseRows.push([]);
      const totalRowIdx = expenseRows.length;
      expenseRows.push(["TOTAL EXPENSES", totalExpensesAmount, "", ""]);
      setExpenseStyle(totalRowIdx, 0, orangeStyle);
      setExpenseStyle(totalRowIdx, 1, { font: { bold: true, color: { rgb: ORANGE } }, alignment: { horizontal: "right", vertical: "center" } });

      const wsExpenses = XLSX.utils.aoa_to_sheet(expenseRows);
      expenseStyles.forEach((style, cellRef) => {
        if (wsExpenses[cellRef]) wsExpenses[cellRef].s = style;
      });
      
      wsExpenses["!cols"] = [
        { wch: 22 },
        { wch: 15 },
        { wch: 40 },
        { wch: 25 },
      ];
      wsExpenses["!rows"] = expenseRows.map(() => ({ hpt: 24 }));

      XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses");

      // Generate Summary Sheet
      const summaryRows = [
        ["Metric", "Value"],
        ["Exported For", selectedNestedUid === "all" ? "All Accounts" : (nestedAccounts.find(a => a.nestedUid === selectedNestedUid)?.label || selectedNestedUid)],
        ["Nested Transactions", filteredTxns.length],
        ["Expenses Records", filteredExpenses.length],
        ["Total Expenses Amount", totalExpensesAmount],
        ["Generated", new Date().toLocaleString()],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

      // Save/Share Workbook
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const filename = `Nested_User_Weekly_Tracker_${Date.now()}.xlsx`;

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
            dialogTitle: "Export Nested Transactions",
          });
        }
      }
      Alert.alert("Export Complete", `Report downloaded as ${filename}`);
    } catch (error: any) {
      Alert.alert("Export Failed", error?.message ?? "Unable to export report.");
    } finally {
      setIsExportingNested(false);
    }
  };

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
                const loansStartingThisWeek = customerLoans.filter((loan) => {
                  const loanStartDay = startOfDay(loan.startDate);
                  return loanStartDay >= weekDate && loanStartDay <= endOfWeek;
                });

                if (loansStartingThisWeek.length > 0) {
                  let displayedAmount = 0;
                  loansStartingThisWeek.forEach((l) => {
                    displayedAmount += money(l.totalPayable);
                    weeklyDisbursed[weekIndex] += getLoanDistributedAmount(l);
                  });

                  const totalPaidThisWeek = weekPayments
                    .filter((payment) => isRealCollectionPayment(payment))
                    .reduce((sum, payment) => sum + money(payment.amountPaid), 0);

                  if (totalPaidThisWeek > 0) {
                    weeklyCollected[weekIndex] += totalPaidThisWeek;
                    row.push(`${Math.trunc(totalPaidThisWeek)}\n${Math.trunc(displayedAmount)}`);
                  } else {
                    row.push(Math.trunc(displayedAmount));
                  }
                  setStyle(rowIndex, colIndex, orangeStyle);
                  return;
                }

                const regularPayment = weekPayments
                  .filter((payment) => isRealCollectionPayment(payment))
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
          sheetData.push(["", "", "", "TOTAL DISBURSED", ...weeklyDisbursed]);
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

  const exportJsonBackup = async () => {
    if (!user || isBackingUp) return;
    try {
      setIsBackingUp(true);
      const snapshot = await createBackupSnapshot(user.uid);
      const exported = downloadTextFile(makeBackupFilename(), JSON.stringify(snapshot, null, 2));
      if (exported) {
        Alert.alert("Backup Ready", "Encrypted browser storage was not used for this backup. Keep the JSON file private.");
      } else {
        Alert.alert("Backup Ready", "JSON backup is only available on web in this release.");
      }
    } catch (error: any) {
      Alert.alert("Backup Failed", error?.message ?? "Could not create backup.");
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreJsonBackup = async () => {
    if (!user || isRestoring) return;
    if (Platform.OS !== "web" || typeof document === "undefined") {
      Alert.alert("Web Only", "Backup restore is available from the web dashboard.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const snapshot = parseBackupSnapshot(raw, user.uid);
        if (Platform.OS === "web") {
          const confirm = window.confirm("This will merge matching records into your account. It will not delete existing production records. Proceed with Restore?");
          if (confirm) {
            try {
              setIsRestoring(true);
              const restored = await restoreBackupSnapshot(snapshot, user.uid);
              alert(`${restored} records were safely merged.`);
            } catch (error: any) {
              alert(error?.message ?? "Could not restore backup.");
            } finally {
              setIsRestoring(false);
            }
          }
        } else {
          Alert.alert(
            "Restore Backup",
            "This will merge matching records into your account. It will not delete existing production records.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Restore",
                style: "default",
                onPress: async () => {
                  try {
                    setIsRestoring(true);
                    const restored = await restoreBackupSnapshot(snapshot, user.uid);
                    Alert.alert("Restore Complete", `${restored} records were safely merged.`);
                  } catch (error: any) {
                    Alert.alert("Restore Failed", error?.message ?? "Could not restore backup.");
                  } finally {
                    setIsRestoring(false);
                  }
                },
              },
            ]
          );
        }
      } catch (error: any) {
        Alert.alert("Invalid Backup", error?.message ?? "This file is not a valid Finance Manager backup.");
      }
    };
    input.click();
  };

  return (
    <AnimatedScreen style={styles.root}>
    <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-back" size={20} color={colors.white} />
        </Pressable>
        <ScrollView
          style={{ flex: 1, width: "100%" }}
          contentContainerStyle={{
            padding: 16,
            paddingTop: 68,
            width: "100%",
            maxWidth: Math.min(screenWidth - 32, 430),
            alignSelf: "center",
            gap: 18,
            flexGrow: 1,
            justifyContent: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Icon name="person" size={28} color={colors.white} />
            </View>
            <Text style={styles.title}>{t("settingsTitle")}</Text>
            <Text style={styles.subtitle}>{t("accountDetails")}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
                <Icon name="mail-outline" size={18} color={colors.blue2} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t("signedInAs")}</Text>
                <Text style={[styles.value, { color: colors.text }]}>{user?.email || "Unknown user"}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successSoft }]}>
                <Icon name="id-card-outline" size={18} color={colors.teal} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t("displayName")}</Text>
                <Text style={[styles.value, { color: colors.text }]}>{user?.displayName || "User"}</Text>
              </View>
            </View>

            {/* Language Selection Row */}
            <View style={[styles.themeRow, { borderColor: colors.border }]}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
                <Icon name="language-outline" size={18} color={colors.blue2} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t("language")}</Text>
                <Text style={[styles.value, { color: colors.text }]}>
                  {language === "en" ? t("english") : t("telugu")}
                </Text>
              </View>
            </View>
            <View style={styles.themeModeRow}>
              <Pressable
                style={[
                  styles.themeModeChip,
                  { backgroundColor: colors.surfaceTint, borderColor: colors.border },
                  language === "en" && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setLanguage("en")}
              >
                <Text style={[styles.themeModeText, { color: language === "en" ? colors.white : colors.textSecondary }]}>
                  {t("english")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.themeModeChip,
                  { backgroundColor: colors.surfaceTint, borderColor: colors.border },
                  language === "te" && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setLanguage("te")}
              >
                <Text style={[styles.themeModeText, { color: language === "te" ? colors.white : colors.textSecondary }]}>
                  {t("telugu")}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.themeRow, { borderColor: colors.border, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 8 }]}>
              <View style={[styles.infoIcon, { backgroundColor: colors.warningSoft }]}>
                <Icon name={isDark ? "moon-outline" : "sunny-outline"} size={18} color={colors.coral} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t("theme")}</Text>
                <Text style={[styles.value, { color: colors.text }]}>
                  {colorScheme === "system" ? `System (${isDark ? "dark" : "light"})` : isDark ? "Dark mode" : "Light mode"}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleDarkMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
            <View style={styles.themeModeRow}>
              {(["system", "light", "dark"] as const).map((scheme) => {
                const active = colorScheme === scheme;
                return (
                  <Pressable
                    key={scheme}
                    style={[
                      styles.themeModeChip,
                      { backgroundColor: colors.surfaceTint, borderColor: colors.border },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setColorScheme(scheme)}
                  >
                    <Text style={[styles.themeModeText, { color: active ? colors.white : colors.textSecondary }]}>
                      {scheme[0].toUpperCase() + scheme.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isOwner && (
              <Pressable
                style={[styles.exportBtn, isExporting && styles.exportBtnDisabled]}
                onPress={exportWholeData}
                disabled={isExporting}
                accessibilityLabel="Export whole data"
              >
                {isExporting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Icon name="document-text-outline" size={18} color={colors.white} />
                )}
                <Text style={styles.exportText}>{isExporting ? t("exportingWholeData") : t("exportWholeData")}</Text>
              </Pressable>
            )}

            {isOwner && (
              <View style={[styles.securityPanel, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                <Pressable
                  accessibilityLabel="Open AI Business Advisor"
                  style={styles.settingsLink}
                  onPress={() => router.push("/ai-advisor" as any)}
                >
                  <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
                    <Icon name="sparkles-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.infoCopy}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>{t("aiAdvisor")}</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{t("aiAdvisorSub")}</Text>
                  </View>
                  <Icon name="arrow-forward" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Open Block Aadhaar"
                  style={[styles.settingsLink, { borderTopColor: colors.border }]}
                  onPress={() => router.push("/block-aadhaar" as any)}
                >
                  <View style={[styles.infoIcon, { backgroundColor: colors.destructiveSoft }]}>
                    <Icon name="lock-closed-outline" size={18} color={colors.error} />
                  </View>
                  <View style={styles.infoCopy}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>{t("blockAadhaar")}</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{t("blockAadhaarSub")}</Text>
                  </View>
                  <Icon name="arrow-forward" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Open Insights"
                  style={[styles.settingsLink, { borderTopColor: colors.border }]}
                  onPress={() => router.push("/insights" as any)}
                >
                  <View style={[styles.infoIcon, { backgroundColor: colors.successSoft }]}>
                    <Icon name="bulb-outline" size={18} color={colors.success} />
                  </View>
                  <View style={styles.infoCopy}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>{t("insightsTitle")}</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{t("insightsSub")}</Text>
                  </View>
                  <Icon name="arrow-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            {isOwner && (
              <View style={[styles.securityPanel, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                <View style={styles.securityHeader}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.successSoft }]}>
                    <Icon name="shield-checkmark-outline" size={18} color={colors.teal} />
                  </View>
                  <View style={styles.infoCopy}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>{t("backupRestore")}</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{t("backupRestoreSub")}</Text>
                  </View>
                </View>
                <Text style={[styles.securityCopy, { color: colors.textSecondary }]}>
                  {t("backupDescription")}
                </Text>
                <View style={styles.backupRow}>
                  <Pressable
                    style={[styles.backupBtn, isBackingUp && styles.exportBtnDisabled]}
                    onPress={exportJsonBackup}
                    disabled={isBackingUp}
                  >
                    {isBackingUp ? <ActivityIndicator color={colors.white} /> : <Icon name="cloud-download-outline" size={17} color={colors.white} />}
                    <Text style={styles.backupBtnText}>{isBackingUp ? "Backing up..." : t("jsonBackup")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.restoreBtn, isRestoring && styles.exportBtnDisabled]}
                    onPress={restoreJsonBackup}
                    disabled={isRestoring}
                  >
                    {isRestoring ? <ActivityIndicator color={colors.blue2} /> : <Icon name="database-outline" size={17} color={colors.blue2} />}
                    <Text style={[styles.restoreBtnText, { color: colors.blue2 }]}>{isRestoring ? "Restoring..." : t("restore")}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Nested Account Management Section */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
              <View style={styles.securityHeader}>
                <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
                  <Icon name="people-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.infoCopy}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Nested Accounts</Text>
                  <Text style={[styles.value, { color: colors.text }]}>Sync & covers management</Text>
                </View>
              </View>

              {/* Date Filters & Excel Export (Visible to both Owner and Nested user) */}
              <View style={[styles.securityPanel, { backgroundColor: colors.surfaceTint, borderColor: colors.border, marginTop: 10 }]}>
                <Text style={[styles.sectionHeader, { color: colors.primary }]}>Export Reports</Text>
                
                {isOwner && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Select Cover Account</Text>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <Pressable
                        style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border }, exportSelectedNestedUid === "all" && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        onPress={() => setExportSelectedNestedUid("all")}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: exportSelectedNestedUid === "all" ? colors.white : colors.textSecondary }}>All Accounts</Text>
                      </Pressable>
                      {nestedAccounts.map(acc => (
                        <Pressable
                          key={acc.id}
                          style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border }, exportSelectedNestedUid === acc.nestedUid && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => setExportSelectedNestedUid(acc.nestedUid)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: exportSelectedNestedUid === acc.nestedUid ? colors.white : colors.textSecondary }}>{acc.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Start Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                      placeholder="e.g. 2026-06-01"
                      placeholderTextColor={colors.textMuted}
                      value={exportStartDate}
                      onChangeText={setExportStartDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>End Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                      placeholder="e.g. 2026-06-07"
                      placeholderTextColor={colors.textMuted}
                      value={exportEndDate}
                      onChangeText={setExportEndDate}
                    />
                  </View>
                </View>

                <Pressable
                  style={[styles.exportBtn, isExportingNested && styles.exportBtnDisabled]}
                  onPress={exportNestedTransactions}
                  disabled={isExportingNested}
                >
                  {isExportingNested ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Icon name="cloud-download-outline" size={17} color={colors.white} />
                  )}
                  <Text style={styles.exportText}>{isExportingNested ? "Exporting..." : "Export to Excel"}</Text>
                </Pressable>
              </View>

              {/* Owner-Only: Register New Nested User */}
              {isOwner && (
                <View style={[styles.securityPanel, { backgroundColor: colors.surfaceTint, borderColor: colors.border, marginTop: 10 }]}>
                  <Text style={[styles.sectionHeader, { color: colors.primary }]}>Register Cover Account</Text>
                  
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Account Name / Label</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. Vacation Cover - Raj"
                    placeholderTextColor={colors.textMuted}
                    value={registerLabel}
                    onChangeText={setRegisterLabel}
                  />

                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Email Address</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. raj.cover@example.com"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={registerEmail}
                    onChangeText={setRegisterEmail}
                  />

                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Password</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={registerPassword}
                    onChangeText={setRegisterPassword}
                  />

                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Balancing Fund (BF) Amount (Rs.)</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. 5000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={registerBf}
                    onChangeText={setRegisterBf}
                  />

                  <Pressable
                    style={[styles.exportBtn, { backgroundColor: colors.paidGreen }, isRegisteringNested && styles.exportBtnDisabled]}
                    onPress={handleRegisterNested}
                    disabled={isRegisteringNested}
                  >
                    {isRegisteringNested ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Icon name="person-add-outline" size={17} color={colors.white} />
                    )}
                    <Text style={styles.exportText}>Register Account</Text>
                  </Pressable>
                </View>
              )}

              {/* Owner-Only: View and Deactivate/Delete Nested Mappings */}
              {isOwner && nestedAccounts.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.sectionHeader, { color: colors.primary }]}>Registered Covers</Text>
                  {nestedAccounts.map((acc) => (
                    <View key={acc.id} style={[styles.nestedAccRow, { borderColor: colors.border }]}>
                      <View style={styles.nestedAccLeft}>
                        <Text style={[styles.nestedAccName, { color: colors.text }]}>{acc.label}</Text>
                        <Text style={[styles.nestedAccEmail, { color: colors.textSecondary }]}>{acc.nestedEmail}</Text>
                      </View>
                      <View style={styles.nestedAccActions}>
                        <Switch
                          value={acc.active !== false}
                          onValueChange={() => handleToggleNestedActive(acc.nestedUid, acc.active !== false)}
                          trackColor={{ false: colors.border, true: colors.primary }}
                        />
                        <Pressable style={styles.trashBtn} onPress={() => handleDeleteNested(acc.nestedUid)}>
                          <Icon name="trash-outline" size={16} color={colors.error} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Owner-Only: Reconciliations Panel */}
            {isOwner && nestedTransactionsList.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
                <View style={styles.securityHeader}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.warningSoft || "#FFF3E0" }]}>
                    <Icon name="checkmark-circle-outline" size={18} color={colors.amber || "#FF9800"} />
                  </View>
                  <View style={styles.infoCopy}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Pending Reconciliations</Text>
                    <Text style={[styles.value, { color: colors.text }]}>{nestedTransactionsList.length} sync payments ready</Text>
                  </View>
                </View>
                
                <ScrollView style={{ maxHeight: 200, marginTop: 10 }}>
                  {nestedTransactionsList.map((txn) => {
                    const isSelected = !!selectedTxnIds[txn.id];
                    return (
                      <Pressable
                        key={txn.id}
                        style={[styles.reconcileRow, { borderColor: colors.border }]}
                        onPress={() => setSelectedTxnIds(curr => ({ ...curr, [txn.id]: !isSelected }))}
                      >
                        <View style={[styles.reconcileCheckbox, isSelected && styles.reconcileChecked]}>
                          {isSelected && <Icon name="checkmark" size={12} color={colors.white} />}
                        </View>
                        <View style={styles.reconcileDetails}>
                          <Text style={[styles.reconcileCustomer, { color: colors.text }]}>{txn.customerName}</Text>
                          <Text style={[styles.reconcileMeta, { color: colors.textSecondary }]}>
                            {new Date(txn.date).toLocaleDateString("en-IN")} via {txn.nestedEmail.split("@")[0]}
                          </Text>
                        </View>
                        <Text style={[styles.reconcileAmount, { color: colors.paidGreen }]}>Rs.{txn.amount}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.reconcileActionBar}>
                  <Pressable
                    style={[styles.reconcileBtn, { backgroundColor: colors.paidGreen }]}
                    onPress={() => handleReconcileTxns("export")}
                  >
                    <Icon name="checkmark-done" size={16} color={colors.white} />
                    <Text style={{ color: colors.white, fontSize: 13, fontWeight: "700" }}>Mark Reconciled</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.reconcileBtn, { backgroundColor: colors.coral }]}
                    onPress={() => handleReconcileTxns("delete")}
                  >
                    <Icon name="trash-outline" size={16} color={colors.white} />
                    <Text style={{ color: colors.white, fontSize: 13, fontWeight: "700" }}>Delete Selected</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Pressable
              style={styles.logoutBtn}
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Icon name="log-out-outline" size={18} color={colors.white} />
              <Text style={styles.logoutText}>{t("logout")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
    </AnimatedScreen>
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
  title: { fontSize: 28, fontWeight: "800", color: baseColors.white },
  subtitle: { color: "rgba(255,255,255,0.78)", fontSize: 14 },
  card: { backgroundColor: baseColors.white, borderRadius: 22, padding: 20, gap: 14, borderWidth: 1, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  themeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: baseColors.border },
  themeModeRow: { flexDirection: "row", gap: 8 },
  themeModeChip: { flex: 1, borderRadius: 999, borderWidth: 1, paddingVertical: 9, alignItems: "center" },
  themeModeText: { fontSize: 12, fontWeight: "900" },
  infoIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: baseColors.sky },
  infoCopy: { flex: 1 },
  label: { color: baseColors.gray, fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  value: { color: baseColors.ink, fontWeight: "800", fontSize: 15, marginTop: 2 },
  exportBtn: { marginTop: 8, borderRadius: 14, backgroundColor: baseColors.blue2, padding: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  exportBtnDisabled: { opacity: 0.65 },
  exportText: { color: baseColors.white, fontWeight: "800", fontSize: 15 },
  logoutBtn: { marginTop: 8, borderRadius: 14, backgroundColor: baseColors.coral, padding: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  logoutText: { color: baseColors.white, fontWeight: "800", fontSize: 15 },
  securityPanel: { backgroundColor: baseColors.surfaceTint, borderRadius: 16, borderWidth: 1, borderColor: baseColors.border, padding: 14, gap: 10 },
  settingsLink: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 0 },
  securityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  securityCopy: { color: baseColors.gray, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  backupRow: { flexDirection: "row", gap: 10 },
  backupBtn: { flex: 1, borderRadius: 13, backgroundColor: baseColors.blue2, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  backupBtnText: { color: baseColors.white, fontWeight: "900", fontSize: 13 },
  restoreBtn: { flex: 1, borderRadius: 13, backgroundColor: baseColors.sky, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, borderWidth: 1, borderColor: "#bfdbfe" },
  restoreBtnText: { color: baseColors.blue2, fontWeight: "900", fontSize: 13 },
  textInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 8, height: 42, color: baseColors.ink, borderColor: baseColors.border, backgroundColor: baseColors.white },
  sectionHeader: { fontSize: 14, fontWeight: "800", marginBottom: 8, textTransform: "uppercase" },
  nestedAccRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
  nestedAccLeft: { flex: 1 },
  nestedAccName: { fontSize: 14, fontWeight: "700" },
  nestedAccEmail: { fontSize: 12, marginTop: 2 },
  nestedAccActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  trashBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#FFEBEE", alignItems: "center", justifyContent: "center" },
  reconcileRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  reconcileCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: baseColors.blue2, alignItems: "center", justifyContent: "center" },
  reconcileChecked: { backgroundColor: baseColors.blue2 },
  reconcileDetails: { flex: 1 },
  reconcileCustomer: { fontSize: 13, fontWeight: "700" },
  reconcileAmount: { fontSize: 13, fontWeight: "800" },
  reconcileMeta: { fontSize: 11, marginTop: 2 },
  reconcileActionBar: { flexDirection: "row", gap: 10, marginTop: 12 },
  reconcileBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
});
