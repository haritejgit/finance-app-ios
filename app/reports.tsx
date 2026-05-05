import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../src/auth-context";
import { getPaymentsByDate } from "../src/repository";
import { colors } from "../src/theme";
import { Village, Customer, Loan, Payment } from "../src/types";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../src/firebase';

// Lazy load heavy XLSX library
let XLSX: any = null;
async function loadXLSX() {
  if (!XLSX) {
    XLSX = await import('xlsx-js-style');
  }
  return XLSX;
}

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

export default function ReportsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [fromDate, setFromDate] = useState(formatDateInput(Date.now() - 7 * 24 * 60 * 60 * 1000)); // 7 days ago
  const [toDate, setToDate] = useState(formatDateInput(Date.now())); // Today
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [tempFromDate, setTempFromDate] = useState(new Date());
  const [tempToDate, setTempToDate] = useState(new Date());
  const [reportData, setReportData] = useState<any[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportSummary, setReportSummary] = useState({
    totalAmount: 0,
    totalPayments: 0,
    cashPayments: 0,
    phonePayments: 0,
    duePayments: 0,
  });

  // Day Report state
  const [showDayReportModal, setShowDayReportModal] = useState(false);
  const [dayReportDate, setDayReportDate] = useState(formatDateInput(Date.now()));
  const [dayReportDay, setDayReportDay] = useState("Monday");
  const [dayReportShift, setDayReportShift] = useState<"Morning" | "Evening">("Morning");
  const [showDayDatePicker, setShowDayDatePicker] = useState(false);
  const [tempDayDate, setTempDayDate] = useState(new Date());
  const [dayReportData, setDayReportData] = useState({
    cashCollection: 0,
    phoneCollection: 0,
    totalCollection: 0,
    totalDistributed: 0,
    paymentCount: 0,
  });
  const [showDayReportResult, setShowDayReportResult] = useState(false);
  const [dayReportLoading, setDayReportLoading] = useState(false);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const canGenerate = useMemo(() => {
    const from = parseDateInput(fromDate);
    const to = parseDateInput(toDate);
    return from && to && from <= to;
  }, [fromDate, toDate]);

  const generateReport = async () => {
    if (!user || !canGenerate) return;
    
    setIsGenerating(true);
    try {
      const from = parseDateInput(fromDate);
      const to = parseDateInput(toDate);
      
      const data = await getPaymentsByDate(user.uid, toStartOfDay(from!), toStartOfDay(to! + 24 * 60 * 60 * 1000 - 1));
      
      // Calculate summary
      const summary = {
        totalAmount: data.reduce((sum, p) => sum + p.amountPaid, 0),
        totalPayments: data.length,
        cashPayments: data.filter(p => p.paymentMode === "CASH").length,
        phonePayments: data.filter(p => p.paymentMode === "PHONE").length,
        duePayments: data.filter(p => p.paymentType === "DUE").length,
      };
      
      setReportSummary(summary);
      setReportData(data.sort((a, b) => b.paymentDate - a.paymentDate));
      setShowReportModal(true);
    } catch (error) {
      // Error handled by alert
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToCSV = async () => {
    if (reportData.length === 0) return;
    
    try {
      // Create Excel workbook
      const wb = XLSX.utils.book_new();
      
      // Create worksheet with payment data
      const paymentData = reportData.map(p => ({
        'Date': new Date(p.paymentDate).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        }),
        'Amount': p.amountPaid,
        'Type': p.paymentType,
        'Mode': p.paymentMode,
        'Customer ID': p.customerId || '',
        'Payment Date Full': new Date(p.paymentDate).toLocaleString()
      }));
      
      // Add payment data worksheet
      const wsPayments = XLSX.utils.json_to_sheet(paymentData);
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');
      
      // Create summary worksheet
      const summaryData = [
        { 'Metric': 'Total Payments', 'Value': reportSummary.totalPayments },
        { 'Metric': 'Total Amount', 'Value': `Rs.${reportSummary.totalAmount.toFixed(2)}` },
        { 'Metric': 'Cash Payments', 'Value': reportSummary.cashPayments },
        { 'Metric': 'Phone Payments', 'Value': reportSummary.phonePayments },
        { 'Metric': 'Due Payments', 'Value': reportSummary.duePayments },
        { 'Metric': 'Report Generated', 'Value': new Date().toLocaleString() },
        { 'Metric': 'Report Period', 'Value': `${fromDate} to ${toDate}` }
      ];
      
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      
      // Create chart data worksheet
      const chartData = [
        { 'Payment Type': 'Cash', 'Count': reportSummary.cashPayments, 'Amount': reportData.filter(p => p.paymentMode === 'CASH').reduce((sum, p) => sum + p.amountPaid, 0) },
        { 'Payment Type': 'Phone', 'Count': reportSummary.phonePayments, 'Amount': reportData.filter(p => p.paymentMode === 'PHONE').reduce((sum, p) => sum + p.amountPaid, 0) },
        { 'Payment Type': 'Regular', 'Count': reportData.filter(p => p.paymentType === 'REGULAR').length, 'Amount': reportData.filter(p => p.paymentType === 'REGULAR').reduce((sum, p) => sum + p.amountPaid, 0) },
        { 'Payment Type': 'Due', 'Count': reportSummary.duePayments, 'Amount': reportData.filter(p => p.paymentType === 'DUE').reduce((sum, p) => sum + p.amountPaid, 0) }
      ];
      
      const wsChart = XLSX.utils.json_to_sheet(chartData);
      XLSX.utils.book_append_sheet(wb, wsChart, 'Charts Data');
      
      // Generate Excel file as base64
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      
      // Create filename
      const today = new Date().toISOString().split('T')[0];
      const filename = `payment_report_${today}.xlsx`;
      
      // Try multiple sharing methods
      let shareSuccess = false;
      
      // Method 1: Try direct file sharing
      try {
        // Create a temporary file path
        const tempPath = `${FileSystem.cacheDirectory || 'file:///tmp/'}${filename}`;
        
        // Write the file
        await FileSystem.writeAsStringAsync(tempPath, excelBuffer, {
          encoding: 'base64',
        });
        
        // Try to share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(tempPath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Download Excel File',
          });
          shareSuccess = true;
        }
      } catch (fileShareError) {
        // Silent fail - try next method
      }
      
      // Method 2: Try data URI sharing
      if (!shareSuccess) {
        try {
          const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`;
          
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(dataUri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Download Excel File',
            });
            shareSuccess = true;
          }
        } catch (dataUriError) {
          // Silent fail
        }
      }
      
      // If sharing succeeded, show success message
      if (shareSuccess) {
        Alert.alert(
          '✅ Excel File Downloaded!',
          `Excel file "${filename}" has been downloaded successfully!\n\n📈 Report Summary:\n• ${reportSummary.totalPayments} payments\n• Rs.${reportSummary.totalAmount.toFixed(2)} total\n• ${reportSummary.cashPayments} cash payments\n• ${reportSummary.phonePayments} phone payments\n\n📑 File contains:\n• Payments sheet (${reportSummary.totalPayments} records)\n• Summary sheet (key metrics)\n• Charts Data sheet (for visualizations)\n\n💡 Check your Downloads folder or Files app!`,
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        // All sharing methods failed, show detailed instructions
        Alert.alert(
          '📋 Excel Data Ready - Manual Creation Required',
          `Direct download failed, but all Excel data is ready!\n\n📈 Report Summary:\n• ${reportSummary.totalPayments} payments\n• Rs.${reportSummary.totalAmount.toFixed(2)} total\n• ${reportSummary.cashPayments} cash payments\n• ${reportSummary.phonePayments} phone payments\n\n💡 Manual Excel Creation Steps:\n\n1. Take a screenshot of this message\n2. Open Microsoft Excel on your computer\n3. Create new blank workbook\n4. Type the following data:\n\nDate,Amount,Type,Mode,Customer ID\n${reportData.map(p => 
            `${new Date(p.paymentDate).toLocaleDateString()},${p.amountPaid},${p.paymentType},${p.paymentMode},${p.customerId || ''}`
          ).join('\n')}\n\n5. Save as ${filename}\n\n📱 Alternative: Email this report data to yourself and open on computer.`,
          [{ text: 'OK', style: 'default' }]
        );
      }
      
    } catch (error) {
      // Error handled below
      
      Alert.alert(
        '❌ Export Failed',
        'Unable to export Excel file. Please try again or contact support.\n\n💡 Tip: Make sure you have enough storage space and try again.',
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  // Helper function to convert ArrayBuffer to Base64
  function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Color definitions for styling (matching Android version)
  const orangeColor = { rgb: "C55A11" };  // Disbursed/given to customer (Android: 0xC5, 0x5A, 0x11)
  const blackColor = { rgb: "000000" };  // Normal payment
  const redColor = { rgb: "FF0000" };    // Due (unpaid) - cell fill
  const purpleColor = { rgb: "7030A0" }; // Closing/outstanding balance
  const whiteColor = { rgb: "FFFFFF" };  // Due text
  const lightGrayColor = { rgb: "F0F0F0" };
  const mediumGrayColor = { rgb: "E0E0E0" };

  // Type definitions for data structures
interface Village {
  id: string;
  name?: string;
  dayOfWeek?: string;
  [key: string]: any; // Allow additional properties
}

interface Customer {
  id: string;
  name?: string;
  village?: string;
  phone?: string;
  aadhar?: string;
  co?: string;
  villageId?: string;
  numericalId?: number;
  [key: string]: any; // Allow additional properties
}

interface Loan {
  id: string;
  customerId: string;
  startDate: number;
  totalPayable?: number;
  principalAmount?: number;
  status?: string;
}

interface Payment {
  id?: string;
  customerId?: string;
  paymentDate: number;
  amountPaid?: number;
  amount?: number;
  paymentType?: string;
  type?: string;
  previousBalance?: number;
  newLoan?: number;
  loanId?: string;
  [key: string]: any; // Allow additional properties
}

// Helper functions for processing real payment data (simplified for current data structure)
  const getPaymentTypeFromData = (payment: Payment) => {
    if (!payment) return 'due';
    
    // Check payment type based on your data structure
    if (payment.paymentType === 'DISBURSEMENT' || payment.type === 'disbursement') {
      return 'disbursedOnly'; // Orange - new loan given
    } else if (payment.paymentType === 'DUE' || payment.type === 'due') {
      return 'due'; // Red fill + white text - not paid
    } else if (payment.paymentType === 'RENEWAL' || payment.paymentType === 'RENEWAL_CLOSURE' || payment.type === 'renewal') {
      return 'renewal'; // Purple + Orange - renewal
    } else if (payment.paymentType === 'PAID' || payment.paymentType === 'PAYMENT' || payment.paymentType === 'REGULAR' || payment.type === 'paid' || payment.type === 'payment') {
      return 'paid'; // Black - regular payment
    } else {
      return 'paid'; // Default to paid
    }
  };

  const getPaymentCellValueFromData = (payment: any, paymentType: string) => {
    if (paymentType === 'renewal') {
      // Purple + Orange rich text (matching Android)
      const prevBal = payment.previousBalance || payment.amountPaid || 0;
      const newAmt = payment.newLoan || payment.amountPaid || payment.amount || 0;
      return `${prevBal}\n${newAmt}`;
    } else if (paymentType === 'disbursedOnly') {
      // Orange - new loan amount
      const displayedAmount = payment.amountPaid || payment.amount || 0;
      return displayedAmount.toString();
    } else if (paymentType === 'paid') {
      // Black - regular payment
      return (payment.amountPaid || payment.amount || 0).toString();
    } else if (paymentType === 'due') {
      return 'Due';
    }
    
    return '';
  };

  const getPaymentCellStyleFromType = (paymentType: string) => {
    switch (paymentType) {
      case 'disbursedOnly':
        // Orange text - new loan given
        return {
          font: { color: orangeColor, bold: true },
          alignment: { horizontal: "center", vertical: "center", wrapText: true }
        };
      case 'paid':
        // Black text - regular payment
        return {
          font: { color: blackColor },
          alignment: { horizontal: "center", vertical: "center", wrapText: true }
        };
      case 'renewal':
        // Purple + Orange - renewal (note: Excel doesn't support rich text easily)
        // We'll use purple as primary color for now
        return {
          font: { color: purpleColor, bold: true },
          alignment: { horizontal: "center", vertical: "center", wrapText: true }
        };
      case 'due':
        // Red fill + white text - not paid
        return {
          font: { color: whiteColor, bold: true },
          fill: { fgColor: redColor },
          alignment: { horizontal: "center", vertical: "center", wrapText: true }
        };
      default:
        return {
          font: { color: blackColor },
          alignment: { horizontal: "center", vertical: "center", wrapText: true }
        };
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportLoanTracker = async () => {
    try {
      setIsExporting(true);
      // Lazy load XLSX library
      const XLSX = await loadXLSX();
      // Create weekly loan tracker Excel workbook
      const wb = XLSX.utils.book_new();
      
      // Generate dates from March 15, 2026 to May 17, 2026 in 7-day increments
      const startDate = new Date('2026-03-15');
      const endDate = new Date('2026-05-17');
      const dates = [];
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 7)) {
        dates.push(new Date(d));
      }
      
      // Create loan tracker data
      const loanData: any[] = [];
      
      // Row 1: Header with "Sunday"
      loanData.push({
        'A': 'Sunday',
        'B': '',
        'C': '',
        'D': '',
        'E': ''
      });
      
      // Row 2: Column headers
      loanData.push({
        'A': 'ID',
        'B': 'C/O',
        'C': 'Name',
        'D': 'Village, Phone Number and Aadhar',
        'E': '',
        'F': '',
        'G': '',
        'H': '',
        'I': '',
        'J': '',
        'K': '',
        'L': '',
        'M': '',
        'N': '',
        'O': '',
        'P': '',
        'Q': '',
        'R': '',
        'S': '',
        'T': '',
        'U': '',
        'V': '',
        'W': '',
        'X': '',
        'Y': '',
        'Z': ''
      });
      
      // Sample data rows (3 customers)
      const sampleCustomers = [
        {
          id: 'L001',
          name: 'Rajesh Kumar',
          village: 'Village Rampur, Phone: 9876543210, Aadhar: 1234-5678-9012',
          weeklyData: [
            { date: '15-03-2026', type: 'disbursement', amount: 5000, balance: 5000 },
            { date: '22-03-2026', type: 'payment', amount: 1000, balance: 4000 },
            { date: '29-03-2026', type: 'missed', amount: 0, balance: 4000 },
            { date: '05-04-2026', type: 'renewal', amount: 2000, balance: 2000 }
          ]
        },
        {
          id: 'L002',
          name: 'Sita Devi',
          village: 'Village Bhopur, Phone: 9876543211, Aadhar: 2345-6789-0123',
          weeklyData: [
            { date: '15-03-2026', type: 'disbursement', amount: 3000, balance: 3000 },
            { date: '22-03-2026', type: 'payment', amount: 500, balance: 2500 },
            { date: '29-03-2026', type: 'missed', amount: 0, balance: 2500 },
            { date: '05-04-2026', type: 'renewal', amount: 1500, balance: 1500 }
          ]
        },
        {
          id: 'L003',
          name: 'Ram Singh',
          village: 'Village Delhi, Phone: 9876543212, Aadhar: 3456-7890-1234',
          weeklyData: [
            { date: '15-03-2026', type: 'disbursement', amount: 8000, balance: 8000 },
            { date: '22-03-2026', type: 'payment', amount: 2000, balance: 6000 },
            { date: '29-03-2026', type: 'missed', amount: 0, balance: 6000 },
            { date: '05-04-2026', type: 'renewal', amount: 3000, balance: 3000 }
          ]
        }
      ];
      
      // Add data for each week
      dates.forEach((weekDate, weekIndex) => {
        // Format date as DD-MM-YYYY
        const formattedDate = `${weekDate.getDate().toString().padStart(2, '0')}-${(weekDate.getMonth() + 1).toString().padStart(2, '0')}-${weekDate.getFullYear()}`;
        
        // Add date column
        loanData.push({
          'A': formattedDate,
          'B': '',
          'C': '',
          'D': '',
          'E': '',
          'F': '',
          'G': '',
          'H': '',
          'I': '',
          'J': '',
          'K': '',
          'L': '',
          'M': '',
          'N': '',
          'O': '',
          'P': '',
          'Q': '',
          'R': '',
          'S': '',
          'T': '',
          'U': '',
          'V': '',
          'W': '',
          'X': '',
          'Y': '',
          'Z': ''
        });
        
        // Add customer data for this week
        sampleCustomers.forEach((customer, customerIndex) => {
          const weekData = customer.weeklyData.find((w: any) => w.date === formattedDate);
          
          if (weekData) {
            loanData.push({
              'A': customer.id,
              'B': weekData.type === 'disbursement' ? 'Disbursement' : weekData.type === 'payment' ? 'Payment' : weekData.type === 'renewal' ? 'Renewal' : '',
              'C': customer.name,
              'D': customer.village,
              'E': weekData.type === 'renewal' ? 
                `Previous Balance: ${weekData.balance - weekData.amount}\nNew Loan: ${weekData.amount}` : 
                weekData.amount.toString()
            });
          }
        });
      });
      
      // Create worksheet with loan tracker data
      const wsLoanTracker = XLSX.utils.json_to_sheet(loanData);
      
      // Apply styling to worksheet
      const range = XLSX.utils.decode_range(wsLoanTracker['!ref']);
      
      // Set column widths
      const colWidths = [
        { wch: 10 },  // A - Date
        { wch: 15 },  // B - C/O
        { wch: 25 },  // C - Name
        { wch: 40 },  // D - Village/Phone/Aadhar
        { wch: 15 }   // E - and more columns for additional weeks
      ];
      
      // Add more column widths for all weeks
      for (let i = 4; i <= 26; i++) {
        colWidths.push({ wch: 12 });
      }
      
      wsLoanTracker['!cols'] = colWidths;
      
      // Apply cell styling
      for (let rowNum = 0; rowNum < loanData.length; rowNum++) {
        for (let colNum = 0; colNum < Object.keys(loanData[rowNum]).length - 1; colNum++) {
          const cellRef = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
          const cell = wsLoanTracker[cellRef];
          
          if (!cell) continue;
          
          // Apply styling based on content
          const cellValue = cell.v || '';
          
          if (cellValue.includes('Disbursement') || cellValue.includes('5000') || cellValue.includes('3000') || cellValue.includes('8000')) {
            // Orange text for loan amounts
            cell.s = {
              font: { color: { rgb: "C55A11" } }
            };
          } else if (cellValue.includes('Payment') || cellValue.includes('1000') || cellValue.includes('2000')) {
            // Black text for regular payments
            cell.s = {
              font: { color: { rgb: "000000" } }
            };
          } else if (cellValue.includes('Missed') || cellValue.includes('Due')) {
            // Red fill with white text for missed payments
            cell.s = {
              fill: { fgColor: { rgb: "FF0000" } },
              font: { color: { rgb: "FFFFFF" } }
            };
          } else if (cellValue.includes('Renewal')) {
            // Check if it's a renewal cell with multiple values
            if (cellValue.includes('Previous Balance')) {
              // Purple text for remaining balance
              cell.s = {
                font: { color: { rgb: "7030A0" } }
              };
            } else if (cellValue.includes('New Loan')) {
              // Orange text for new renewal amount
              cell.s = {
                font: { color: { rgb: "C55A11" } }
              };
            }
          } else if (cellValue === 'Sunday') {
            // Header styling
            cell.s = {
              font: { bold: true, color: { rgb: "000000" } },
              fill: { fgColor: { rgb: "F0F0F0" } }
            };
          } else if (['ID', 'C/O', 'Name'].includes(cellValue)) {
            // Column header styling
            cell.s = {
              font: { bold: true, color: { rgb: "000000" } },
              fill: { fgColor: { rgb: "E0E0E0" } }
            };
          }
          
          wsLoanTracker[cellRef] = cell;
        }
      }
      
      XLSX.utils.book_append_sheet(wb, wsLoanTracker, 'Loan Tracker');
      
      // Generate Excel file as base64
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const excelBase64 = arrayBufferToBase64(excelBuffer);
      
      // Create filename
      const today = new Date().toISOString().split('T')[0];
      const filename = `Loan_Collection_Tracker_${today}.xlsx`;
      
      // Try multiple sharing methods
      let shareSuccess = false;
      
      // Method 1: Try direct file sharing
      try {
        // Create a temporary file path
        const tempPath = `${FileSystem.cacheDirectory || 'file:///tmp/'}${filename}`;
        
        // Write the file
        await FileSystem.writeAsStringAsync(tempPath, excelBase64, {
          encoding: 'base64',
        });
        
        // Try to share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(tempPath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Download Excel File',
          });
          shareSuccess = true;
        }
      } catch (fileShareError) {
        // Silent fail - try next method
      }
      
      // Method 2: Try data URI sharing
      if (!shareSuccess) {
        try {
          const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBase64}`;
          
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(dataUri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Download Excel File',
            });
            shareSuccess = true;
          }
        } catch (dataUriError) {
          // Silent fail
        }
      }
      
      // If sharing succeeded, show success message
      if (shareSuccess) {
        Alert.alert(
          '✅ Excel File Downloaded!',
          `Excel file "${filename}" has been downloaded successfully!\n\n📈 Report Summary:\n• ${reportSummary.totalPayments} payments\n• Rs.${reportSummary.totalAmount.toFixed(2)} total\n• ${reportSummary.cashPayments} cash payments\n• ${reportSummary.phonePayments} phone payments\n\n📑 File contains:\n• Payments sheet (${reportSummary.totalPayments} records)\n• Summary sheet (key metrics)\n• Charts Data sheet (for visualizations)\n\n💡 Check your Downloads folder or Files app!`,
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        // All sharing methods failed, show detailed instructions
        Alert.alert(
          '📋 Excel Data Ready - Manual Creation Required',
          `Direct download failed, but all Excel data is ready!\n\n📈 Report Summary:\n• ${reportSummary.totalPayments} payments\n• Rs.${reportSummary.totalAmount.toFixed(2)} total\n• ${reportSummary.cashPayments} cash payments\n• ${reportSummary.phonePayments} phone payments\n\n💡 Manual Excel Creation Steps:\n\n1. Take a screenshot of this message\n2. Open Microsoft Excel on your computer\n3. Create new blank workbook\n4. Type the following data:\n\nDate,Amount,Type,Mode,Customer ID\n${reportData.map(p => 
            `${new Date(p.paymentDate).toLocaleDateString()},${p.amountPaid},${p.paymentType},${p.paymentMode},${p.customerId || ''}`
          ).join('\n')}\n\n5. Save as ${filename}\n\n📱 Alternative: Email this report data to yourself and open on computer.`,
          [{ text: 'OK', style: 'default' }]
        );
      }
      
    } catch (error) {
      // Error handled below
      
      Alert.alert(
        '❌ Export Failed',
        'Unable to export Excel file. Please try again or contact support.\n\n💡 Tip: Make sure you have enough storage space and try again.',
        [{ text: 'OK', style: 'default' }]
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Helper functions
  const getPaymentCellValue = (payment) => {
    switch (payment.type) {
      case 'disbursement':
        return payment.amount.toString();
      case 'payment':
        return payment.amount.toString();
      case 'due':
        return 'Due';
      case 'renewal':
        return `${payment.previousBalance}\n${payment.amount}`;
      default:
        return payment.amount.toString();
    }
  };
  
  const getPaymentCellStyle = (payment) => {
    switch (payment.type) {
      case 'disbursement':
        return {
          font: { color: orangeColor },
          alignment: { horizontal: "center", vertical: "center" }
        };
      case 'payment':
        return {
          font: { color: blackColor },
          alignment: { horizontal: "center", vertical: "center" }
        };
      case 'due':
        return {
          font: { color: whiteColor },
          fill: { fgColor: redColor },
          alignment: { horizontal: "center", vertical: "center" }
        };
      case 'renewal':
        return {
          font: { color: purpleColor },
          alignment: { horizontal: "center", vertical: "center" }
        };
      default:
        return {
          font: { color: blackColor },
          alignment: { horizontal: "center", vertical: "center" }
        };
    }
  };

  // Generate Day Report
  const generateDayReport = async () => {
    if (!user) {
      Alert.alert("Error", "Please login first");
      return;
    }
    
    const selectedDate = parseDateInput(dayReportDate);
    if (!selectedDate) {
      Alert.alert("Error", "Please select a valid date");
      return;
    }

    setDayReportLoading(true);
    
    try {
      // Get start and end of selected day
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      const startMs = startOfDay.getTime();
      const endMs = endOfDay.getTime();

      // Fetch payments for the day
      const paymentsQuery = query(
        collection(db, "payments"),
        where("userId", "==", user.uid)
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      const dayPayments = paymentsSnap.docs
        .map((d) => d.data() as any)
        .filter((p) => {
          const paymentDate = p.paymentDate?.toMillis ? p.paymentDate.toMillis() : p.paymentDate;
          return paymentDate >= startMs && paymentDate <= endMs && p.paymentType !== "DUE";
        });

      // Calculate collections by mode
      let cashCollection = 0;
      let phoneCollection = 0;
      
      dayPayments.forEach((p) => {
        if (p.paymentMode === "CASH") {
          cashCollection += p.amountPaid || 0;
        } else if (p.paymentMode === "PHONE") {
          phoneCollection += p.amountPaid || 0;
        }
      });

      // Fetch loans distributed on that day
      const loansQuery = query(
        collection(db, "loans"),
        where("userId", "==", user.uid)
      );
      const loansSnap = await getDocs(loansQuery);
      const dayLoans = loansSnap.docs
        .map((d) => d.data() as any)
        .filter((loan) => {
          const loanDate = loan.startDate?.toMillis ? loan.startDate.toMillis() : loan.startDate;
          return loanDate >= startMs && loanDate <= endMs;
        });

      const totalDistributedRaw = dayLoans.reduce((sum, loan) => sum + (loan.principalAmount || 0), 0);
      // Deduct 20 Rs per 1000 Rs distributed
      const totalDistributed = totalDistributedRaw - (Math.floor(totalDistributedRaw / 1000) * 20);

      const newData = {
        cashCollection,
        phoneCollection,
        totalCollection: cashCollection + phoneCollection,
        totalDistributed,
        paymentCount: dayPayments.length,
      };

      setDayReportData(newData);
      setShowDayReportResult(true);
      
    } catch (error) {
      // Error will be shown in alert
      Alert.alert("Error", "Failed to generate day report. Please try again.");
    } finally {
      setDayReportLoading(false);
    }
  };

  const exportWeeklyCollectionReport = async () => {
    if (!user || isExporting) return;

    try {
      setIsExporting(true);
      // Lazy load XLSX library
      const XLSX = await loadXLSX();
      
      const fromTs = parseDateInput(fromDate);
      const toTs = parseDateInput(toDate);
      if (!fromTs || !toTs || fromTs > toTs) {
        Alert.alert('Invalid Date Range', 'Please select a valid From and To date.');
        return;
      }

      const toMillis = (value: any): number => {
        if (typeof value === 'number') return value;
        if (value instanceof Date) return value.getTime();
        if (value?.toMillis) return value.toMillis();
        if (typeof value?.seconds === 'number') return value.seconds * 1000;
        return 0;
      };

      const money = (value: any): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const getStartOfDay = (ts: number): number => {
        const d = new Date(ts);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      };

      const getEndOfDay = (ts: number): number => {
        const d = new Date(ts);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
      };

      const getCollectionWeekStart = (startDate: number, dayName: string): number => {
        const dayMap: Record<string, number> = {
          Sunday: 0,
          Monday: 1,
          Tuesday: 2,
          Wednesday: 3,
          Thursday: 4,
          Friday: 5,
          Saturday: 6,
        };
        const targetDay = dayMap[dayName];
        const d = new Date(startDate);
        while (targetDay !== undefined && d.getDay() !== targetDay) {
          d.setDate(d.getDate() - 1);
        }
        return getStartOfDay(d.getTime());
      };

      const formatSheetDate = (ts: number): string => {
        const d = new Date(ts);
        const day = `${d.getDate()}`.padStart(2, '0');
        const month = `${d.getMonth() + 1}`.padStart(2, '0');
        return `${day}-${month}-${d.getFullYear()}`;
      };

      const fetchUserCollection = async <T,>(name: string): Promise<T[]> => {
        const snap = await getDocs(query(collection(db, name), where('userId', '==', user.uid)));
        return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) })) as T[];
      };

      const villagesData = await fetchUserCollection<Village>('villages');
      const customersData = await fetchUserCollection<Customer>('customers');
      const loansData = (await fetchUserCollection<Loan>('loans')).map((loan) => ({
        ...loan,
        startDate: toMillis(loan.startDate),
        principalAmount: money(loan.principalAmount),
        totalPayable: money(loan.totalPayable),
      }));
      const paymentsData = (await fetchUserCollection<Payment>('payments')).map((payment) => ({
        ...payment,
        paymentDate: toMillis(payment.paymentDate),
        amountPaid: money(payment.amountPaid),
      }));

      if (customersData.length === 0 || villagesData.length === 0) {
        Alert.alert('No Data Found', 'No customers or villages found for this account.');
        return;
      }

      const ORANGE = 'C55A11';
      const RED = 'FF0000';
      const WHITE = 'FFFFFF';
      const BLACK = '000000';
      const GRAY = 'C0C0C0';

      const baseAlignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      const standardStyle = { alignment: baseAlignment };

      const headerStyle = {
        font: { bold: true, color: { rgb: BLACK } },
        fill: { patternType: 'solid', fgColor: { rgb: GRAY } },
        alignment: baseAlignment,
        border: {
          top: { style: 'thin', color: { rgb: BLACK } },
          bottom: { style: 'thin', color: { rgb: BLACK } },
          left: { style: 'thin', color: { rgb: BLACK } },
          right: { style: 'thin', color: { rgb: BLACK } },
        },
      };
      const dueStyle = {
        font: { bold: true, color: { rgb: WHITE } },
        fill: { patternType: 'solid', fgColor: { rgb: RED } },
        alignment: baseAlignment,
      };
      const orangeStyle = {
        font: { bold: true, color: { rgb: ORANGE } },
        alignment: baseAlignment,
      };
      const redTextStyle = {
        font: { bold: true, color: { rgb: RED } },
        alignment: baseAlignment,
      };

      const wb = XLSX.utils.book_new();
      const reportStart = getStartOfDay(fromTs);
      const reportEnd = getEndOfDay(toTs);
      const orderedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const orderedShifts = ['Morning', 'Evening'];
      const makeSheetName = (dayName: string, shiftName: string) =>
        `${dayName} ${shiftName}`.replace(/[\\/?*[\]:]/g, '').slice(0, 31);

      for (const dayName of orderedDays) {
        for (const shiftName of orderedShifts) {
          const shiftVillages = villagesData.filter((v) => v.dayOfWeek === dayName && v.shift === shiftName);
          const shiftCustomers = customersData.filter((customer) =>
            shiftVillages.some((village) => village.id === customer.villageId)
          );
          if (shiftCustomers.length === 0) continue;

          const weekDates: number[] = [];
          let currentWeek = getCollectionWeekStart(reportStart, dayName);
          while (currentWeek <= reportEnd) {
            weekDates.push(currentWeek);
            const next = new Date(currentWeek);
            next.setDate(next.getDate() + 7);
            currentWeek = next.getTime();
          }
          if (weekDates.length === 0) continue;

          const weeklyDisbursed = new Array(weekDates.length).fill(0);
          const weeklyCollected = new Array(weekDates.length).fill(0);
          const sheetTitle = `${dayName} ${shiftName}`;
          const sheetData: any[][] = [
            [sheetTitle],
            ['ID', 'C/O', 'Name', 'Village, Phone Number and Aadhar', ...weekDates.map(formatSheetDate)],
          ];
          const cellStyles = new Map<string, any>();
          const setStyle = (rowIndex: number, colIndex: number, style: any) => {
            cellStyles.set(XLSX.utils.encode_cell({ r: rowIndex, c: colIndex }), style);
          };

          setStyle(0, 0, { font: { bold: true, color: { rgb: BLACK }, sz: 12 }, alignment: baseAlignment });
          for (let col = 0; col < 4 + weekDates.length; col += 1) {
            setStyle(1, col, headerStyle);
          }

          // Group customers by village, then sort by numericalId within each village
          const sortedVillages = [...shiftVillages].sort((a, b) => a.name.localeCompare(b.name));
          
          sortedVillages.forEach((village) => {
            const villageCustomers = shiftCustomers
              .filter((c) => c.villageId === village.id)
              .sort((a, b) => (a.numericalId ?? Number.MAX_SAFE_INTEGER) - (b.numericalId ?? Number.MAX_SAFE_INTEGER));
            
            if (villageCustomers.length === 0) return;
            
            // Add village header row
            const villageHeaderRow = sheetData.length;
            sheetData.push([`🏘️ ${village.name}`]);
            setStyle(villageHeaderRow, 0, { 
              font: { bold: true, color: { rgb: WHITE }, sz: 11 }, 
              fill: { patternType: 'solid', fgColor: { rgb: '1565C0' } },
              alignment: baseAlignment 
            });
            // Merge village header across all columns
            for (let col = 1; col < 4 + weekDates.length; col++) {
              setStyle(villageHeaderRow, col, { 
                fill: { patternType: 'solid', fgColor: { rgb: '1565C0' } },
                alignment: baseAlignment 
              });
            }

            villageCustomers.forEach((customer) => {
            const rowIndex = sheetData.length;
            const villageName = shiftVillages.find((v) => v.id === customer.villageId)?.name ?? '';
            const customerLoans = loansData.filter((loan) => loan.customerId === customer.id);
            const customerPayments = paymentsData.filter((payment) =>
              customerLoans.some((loan) => loan.id === payment.loanId)
            );
            const row: any[] = [
              customer.numericalId ?? '',
              customer.coId?.toString() ?? customer.coName ?? '',
              customer.name ?? '',
              `${villageName}\n${customer.phone ?? ''}\n${customer.aadhar ?? ''}`,
            ];
            for (let col = 0; col < 4; col += 1) setStyle(rowIndex, col, standardStyle);

            weekDates.forEach((weekDate, weekIdx) => {
              const startOfWeek = weekDate;
              const endOfWeek = weekDate + 7 * 24 * 60 * 60 * 1000 - 1000;
              const weekPayments = customerPayments.filter(
                (payment) => payment.paymentDate >= startOfWeek && payment.paymentDate <= endOfWeek
              );
              const loanStartingThisWeek = customerLoans.find((loan) => {
                const loanStartDay = getStartOfDay(loan.startDate);
                return loanStartDay >= startOfWeek && loanStartDay <= endOfWeek;
              });
              const colIndex = 4 + weekIdx;

              if (loanStartingThisWeek) {
                const renewalPayment = weekPayments.find((payment) => payment.paymentType === 'RENEWAL_CLOSURE');
                const displayedAmount = money(loanStartingThisWeek.totalPayable);
                const principalAmount = money(loanStartingThisWeek.principalAmount);
                weeklyDisbursed[weekIdx] += principalAmount;

                if (renewalPayment) {
                  const previousBalance = money(renewalPayment.amountPaid);
                  weeklyCollected[weekIdx] += previousBalance;
                  row.push(`${Math.trunc(previousBalance)}\n${Math.trunc(displayedAmount)}`);
                  setStyle(rowIndex, colIndex, orangeStyle);
                } else {
                  row.push(Math.trunc(displayedAmount));
                  setStyle(rowIndex, colIndex, orangeStyle);
                }
              } else if (weekPayments.length > 0) {
                const regularPayment = weekPayments
                  .filter((payment) => payment.paymentType === 'REGULAR')
                  .reduce((sum, payment) => sum + money(payment.amountPaid), 0);

                if (regularPayment > 0) {
                  weeklyCollected[weekIdx] += regularPayment;
                  row.push(regularPayment);
                  setStyle(rowIndex, colIndex, standardStyle);
                } else if (weekPayments.some((payment) => payment.paymentType === 'DUE')) {
                  row.push('Due');
                  setStyle(rowIndex, colIndex, dueStyle);
                } else {
                  row.push('');
                  setStyle(rowIndex, colIndex, standardStyle);
                }
              } else {
                const wasAnyLoanOpen = customerLoans.some((loan) => {
                  const startedBefore = getStartOfDay(loan.startDate) <= endOfWeek;
                  const notClosedBefore =
                    loan.status === 'ACTIVE' ||
                    customerPayments.some(
                      (payment) =>
                        payment.loanId === loan.id &&
                        getEndOfDay(payment.paymentDate) >= startOfWeek
                    );
                  return startedBefore && notClosedBefore;
                });

                if (wasAnyLoanOpen) {
                  row.push('Due');
                  setStyle(rowIndex, colIndex, dueStyle);
                } else {
                  row.push('');
                  setStyle(rowIndex, colIndex, standardStyle);
                }
              }
            });

            sheetData.push(row);
            });
          });

          sheetData.push([]);
          const collectedRowIndex = sheetData.length;
          sheetData.push(['', '', '', 'TOTAL COLLECTED', ...weeklyCollected]);
          const disbursedRowIndex = sheetData.length;
          sheetData.push([
            '',
            '',
            '',
            'TOTAL DISBURSED',
            ...weeklyDisbursed.map((amount) => amount - (amount / 100) * 2),
          ]);

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
          ws['!cols'] = [
            { wch: 10 },
            { wch: 10 },
            { wch: 22 },
            { wch: 35 },
            ...weekDates.map(() => ({ wch: 15 })),
          ];
          ws['!rows'] = sheetData.map((_, index) => {
            if (index === 0) return { hpt: 24 };
            if (index === 1) return { hpt: 25 };
            if (index >= 2 && index < collectedRowIndex - 1) return { hpt: 48 };
            return { hpt: 24 };
          });

          XLSX.utils.book_append_sheet(wb, ws, makeSheetName(dayName, shiftName));
        }
      }

      if (wb.SheetNames.length === 0) {
        const ws = XLSX.utils.aoa_to_sheet([['No customer data found for the selected date range.']]);
        XLSX.utils.book_append_sheet(wb, ws, 'No Data');
      }

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const filename = `Weekly_Loan_Tracker_${Date.now()}.xlsx`;

      // Web-compatible download
      if (Platform.OS === 'web') {
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert('Report Generated', `File downloaded as ${filename}`);
      } else {
        const base64 = arrayBufferToBase64(excelBuffer);
        const fileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Save Weekly Loan Tracker',
          });
          Alert.alert('Report Generated', `File saved as ${filename}`);
        } else {
          Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
        }
      }
    } catch (error: any) {
      Alert.alert('Export Failed', `Unable to create report.\n\n${error?.message ?? 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['top']}>
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>📊 Reports</Text>
            <Text style={styles.subtitle}>Generate detailed payment reports</Text>
          </View>

          <View style={styles.dateSection}>
            <Text style={styles.sectionTitle}>Date Range</Text>
            
            <View style={styles.dateInputContainer}>
              <View style={styles.dateInputRow}>
                <Text style={styles.dateLabel}>From Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#ccc',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  />
                ) : (
                  <Pressable 
                    style={styles.datePickerBtn} 
                    onPress={() => {
                      setTempFromDate(new Date(parseDateInput(fromDate) || Date.now()));
                      setShowFromPicker(true);
                    }}
                  >
                    <Text style={styles.datePickerBtnText}>📅</Text>
                  </Pressable>
                )}
              </View>
              {Platform.OS !== 'web' && (
                <TextInput
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.dateInput}
                  autoCapitalize="none"
                />
              )}
              {parseDateInput(fromDate) && (
                <Text style={styles.dayDisplay}>
                  {formatDateWithDay(parseDateInput(fromDate)!)}
                </Text>
              )}
            </View>

            <View style={styles.dateInputContainer}>
              <View style={styles.dateInputRow}>
                <Text style={styles.dateLabel}>To Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#ccc',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  />
                ) : (
                  <Pressable 
                    style={styles.datePickerBtn} 
                    onPress={() => {
                      setTempToDate(new Date(parseDateInput(toDate) || Date.now()));
                      setShowToPicker(true);
                    }}
                  >
                    <Text style={styles.datePickerBtnText}>📅</Text>
                  </Pressable>
                )}
              </View>
              {Platform.OS !== 'web' && (
                <TextInput
                  value={toDate}
                  onChangeText={setToDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.dateInput}
                  autoCapitalize="none"
                />
              )}
              {parseDateInput(toDate) && (
                <Text style={styles.dayDisplay}>
                  {formatDateWithDay(parseDateInput(toDate)!)}
                </Text>
              )}
            </View>
          </View>

          <Pressable
            style={styles.dayReportBtn}
            onPress={() => setShowDayReportModal(true)}
          >
            <Text style={styles.dayReportBtnText}>� Day Report</Text>
          </Pressable>

          <Pressable
            style={[styles.loanTrackerBtn, isExporting && styles.loanTrackerBtnDisabled]}
            onPress={exportWeeklyCollectionReport}
            disabled={isExporting}
          >
            <Text style={styles.loanTrackerBtnText}>
              {isExporting ? '⏳ Exporting...' : '📊 Weekly Collection Report'}
            </Text>
          </Pressable>

          <View style={styles.quickStats}>
            <Text style={styles.statsTitle}>Quick Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>7</Text>
                <Text style={styles.statLabel}>Days Default</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>📅</Text>
                <Text style={styles.statLabel}>Date Range</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>💰</Text>
                <Text style={styles.statLabel}>Payment Data</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Date Pickers */}
      {showFromPicker && (
        <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
          <DateTimePicker
            value={tempFromDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
            themeVariant="light"
            onChange={(event, selected) => {
              if (selected) {
                setTempFromDate(selected);
                if (Platform.OS === "ios") {
                  setFromDate(formatDateInput(selected.getTime()));
                }
              }
              if (Platform.OS === "ios") {
                if (event.type === "dismissed") {
                  setShowFromPicker(false);
                }
              } else {
                setFromDate(formatDateInput(selected.getTime()));
                setShowFromPicker(false);
              }
            }}
          />
          {Platform.OS === "ios" && (
            <Pressable style={styles.pickerDoneBtn} onPress={() => {
              setFromDate(formatDateInput(tempFromDate.getTime()));
              setShowFromPicker(false);
            }}>
              <Text style={styles.pickerDoneBtnText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}

      {showToPicker && (
        <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
          <DateTimePicker
            value={tempToDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
            themeVariant="light"
            onChange={(event, selected) => {
              if (selected) {
                setTempToDate(selected);
                if (Platform.OS === "ios") {
                  setToDate(formatDateInput(selected.getTime()));
                }
              }
              if (Platform.OS === "ios") {
                if (event.type === "dismissed") {
                  setShowToPicker(false);
                }
              } else {
                setToDate(formatDateInput(selected.getTime()));
                setShowToPicker(false);
              }
            }}
          />
          {Platform.OS === "ios" && (
            <Pressable style={styles.pickerDoneBtn} onPress={() => {
              setToDate(formatDateInput(tempToDate.getTime()));
              setShowToPicker(false);
            }}>
              <Text style={styles.pickerDoneBtnText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Report Results Modal */}
      <Modal visible={showReportModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📊 Report Results</Text>
            <Pressable onPress={() => setShowReportModal(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryAmount}>Rs.{reportSummary.totalAmount.toFixed(2)}</Text>
                  <Text style={styles.summaryLabel}>Total Amount</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNumber}>{reportSummary.totalPayments}</Text>
                  <Text style={styles.summaryLabel}>Total Payments</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNumber}>{reportSummary.cashPayments}</Text>
                  <Text style={styles.summaryLabel}>Cash</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNumber}>{reportSummary.phonePayments}</Text>
                  <Text style={styles.summaryLabel}>Phone</Text>
                </View>
              </View>
            </View>

            {reportData.length > 0 && (
              <View style={styles.transactionsSection}>
                <View style={styles.transactionsHeader}>
                  <Text style={styles.transactionsTitle}>Transactions ({reportData.length})</Text>
                  <Pressable onPress={exportToCSV} style={styles.exportBtn}>
                    <Text style={styles.exportBtnText}>Export CSV</Text>
                  </Pressable>
                </View>
                
                <FlatList
                  data={reportData}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View style={styles.transactionItem}>
                      <View style={styles.transactionLeft}>
                        <Text style={styles.transactionDate}>
                          {new Date(item.paymentDate).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </Text>
                        <Text style={styles.transactionYear}>
                          {new Date(item.paymentDate).getFullYear()}
                        </Text>
                      </View>
                      <View style={styles.transactionRight}>
                        <Text style={styles.transactionAmount}>Rs.{item.amountPaid.toFixed(2)}</Text>
                        <View style={[
                          styles.transactionBadge,
                          { backgroundColor: item.paymentType === "DUE" ? colors.missedRed : colors.paidGreen }
                        ]}>
                          <Text style={styles.transactionBadgeText}>
                            {item.paymentType === "DUE" ? "DUE" : item.paymentType}
                          </Text>
                        </View>
                        <Text style={styles.transactionMode}>
                          {item.paymentMode === "CASH" ? "Cash" : "Phone"}
                        </Text>
                      </View>
                    </View>
                  )}
                  scrollEnabled={false}
                  ListEmptyComponent={
                    <View style={styles.emptyTransactions}>
                      <Text style={styles.emptyText}>No transactions found</Text>
                    </View>
                  }
                />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Day Report Modal */}
      <Modal 
        visible={showDayReportModal} 
        transparent 
        animationType="none"
        onRequestClose={() => setShowDayReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dayReportSimpleModal}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={styles.dayReportModalTitle}>Day Report</Text>
              
              {/* Date Selection */}
              <View style={styles.dayReportSection}>
                <Text style={styles.dayReportLabel}>Select Date</Text>
                <View style={styles.dayDateRow}>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={dayReportDate}
                      onChange={(e) => {
                        setDayReportDate(e.target.value);
                        setShowDayReportResult(false);
                      }}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#ccc',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    />
                  ) : (
                    <>
                      <TextInput
                        value={dayReportDate}
                        onChangeText={(text) => {
                          setDayReportDate(text);
                          setShowDayReportResult(false);
                        }}
                        placeholder="YYYY-MM-DD"
                        style={styles.dayDateInput}
                        autoCapitalize="none"
                      />
                      <Pressable 
                        style={styles.dayDatePickerBtn} 
                        onPress={() => {
                          setTempDayDate(new Date(parseDateInput(dayReportDate) || Date.now()));
                          setShowDayDatePicker(true);
                        }}
                      >
                        <Text style={styles.dayDatePickerBtnText}>📅</Text>
                      </Pressable>
                    </>
                  )}
                </View>
                {parseDateInput(dayReportDate) && (
                  <View style={styles.selectedDateDisplay}>
                    <Text style={styles.selectedDateDay}>
                      {new Date(parseDateInput(dayReportDate)!).toLocaleDateString('en-US', { weekday: 'long' })}
                    </Text>
                    <Text style={styles.selectedDateFull}>
                      {new Date(parseDateInput(dayReportDate)!).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </Text>
                  </View>
                )}
              </View>

              {/* Shift Selection */}
              <View style={styles.dayReportSection}>
                <Text style={styles.dayReportLabel}>Select Shift</Text>
                <View style={styles.shiftSelector}>
                  <Pressable
                    style={[styles.shiftChip, dayReportShift === "Morning" && styles.shiftChipActive]}
                    onPress={() => setDayReportShift("Morning")}
                  >
                    <Text style={[styles.shiftChipText, dayReportShift === "Morning" && styles.shiftChipTextActive]}>
                      Morning
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.shiftChip, dayReportShift === "Evening" && styles.shiftChipActive]}
                    onPress={() => setDayReportShift("Evening")}
                  >
                    <Text style={[styles.shiftChipText, dayReportShift === "Evening" && styles.shiftChipTextActive]}>
                      Evening
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Date Picker */}
              {showDayDatePicker && (
                <View style={Platform.OS === "ios" ? styles.pickerContainer : null}>
                  <DateTimePicker
                    value={tempDayDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    style={Platform.OS === "ios" ? { backgroundColor: colors.white } : null}
                    themeVariant="light"
                    onChange={(event, selected) => {
                      if (selected) {
                        setTempDayDate(selected);
                        if (Platform.OS !== "ios") {
                          setDayReportDate(formatDateInput(selected.getTime()));
                          setShowDayDatePicker(false);
                        }
                      }
                    }}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable 
                      style={styles.pickerDoneBtn} 
                      onPress={() => {
                        setDayReportDate(formatDateInput(tempDayDate.getTime()));
                        setShowDayDatePicker(false);
                      }}
                    >
                      <Text style={styles.pickerDoneBtnText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Loading Indicator */}
              {dayReportLoading && (
                <View style={styles.dayReportLoading}>
                  <Text style={styles.dayReportLoadingText}>Loading report data...</Text>
                </View>
              )}

              {/* Results - Show inline when generated */}
              {showDayReportResult && !dayReportLoading && (
                <View style={styles.dayReportResults}>
                  <View style={styles.dayReportResultsDivider} />
                  
                  {/* Collection Summary */}
                  <View style={styles.dayReportResultSection}>
                    <Text style={styles.dayReportResultSectionTitle}>COLLECTION SUMMARY</Text>
                    
                    <View style={styles.dayReportResultCard}>
                      <View style={styles.dayReportRow}>
                        <Text style={styles.dayReportIcon}>💵</Text>
                        <Text style={styles.dayReportResultLabel}>Cash Collection</Text>
                      </View>
                      <Text style={styles.dayReportResultAmount}>Rs.{dayReportData.cashCollection.toFixed(2)}</Text>
                    </View>
                    
                    <View style={styles.dayReportResultCard}>
                      <View style={styles.dayReportRow}>
                        <Text style={styles.dayReportIcon}>📱</Text>
                        <Text style={styles.dayReportResultLabel}>PhonePe Collection</Text>
                      </View>
                      <Text style={styles.dayReportResultAmount}>Rs.{dayReportData.phoneCollection.toFixed(2)}</Text>
                    </View>
                    
                    <View style={[styles.dayReportResultCard, styles.dayReportResultTotalCard]}>
                      <View style={styles.dayReportRow}>
                        <Text style={styles.dayReportIcon}>💰</Text>
                        <Text style={styles.dayReportResultTotalLabel}>Total Cash Collected</Text>
                      </View>
                      <Text style={styles.dayReportResultTotalAmount}>Rs.{dayReportData.totalCollection.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* Distribution Summary */}
                  <View style={styles.dayReportResultSection}>
                    <Text style={styles.dayReportResultSectionTitle}>DISTRIBUTION SUMMARY</Text>
                    <View style={[styles.dayReportResultCard, styles.dayReportResultDistCard]}>
                      <View style={styles.dayReportRow}>
                        <Text style={styles.dayReportIcon}>📤</Text>
                        <Text style={styles.dayReportResultLabel}>Total Amount Distributed</Text>
                      </View>
                      <Text style={[styles.dayReportResultAmount, styles.distAmount]}>Rs.{dayReportData.totalDistributed.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* Payment Count */}
                  <View style={styles.dayReportResultSection}>
                    <Text style={styles.dayReportResultSectionTitle}>TRANSACTION STATS</Text>
                    <View style={styles.dayReportResultCard}>
                      <View style={styles.dayReportRow}>
                        <Text style={styles.dayReportIcon}>📝</Text>
                        <Text style={styles.dayReportResultLabel}>Total Payments Received</Text>
                      </View>
                      <Text style={styles.dayReportResultAmount}>{dayReportData.paymentCount}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.dayReportButtons}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowDayReportModal(false)}>
                  <Text style={styles.cancelBtnText}>Close</Text>
                </Pressable>
                <Pressable 
                  style={[styles.generateDayReportBtn, dayReportLoading && styles.generateDayReportBtnDisabled]} 
                  onPress={generateDayReport}
                  disabled={dayReportLoading}
                >
                  <Text style={styles.generateDayReportBtnText}>
                    {dayReportLoading ? 'Loading...' : showDayReportResult ? 'Refresh' : 'Generate'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, padding: 20 },
  scrollContent: { flex: 1 },
  scrollContentContainer: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 30 },
  title: { color: colors.white, fontSize: 32, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 16, textAlign: 'center' },
  
  dateSection: { marginBottom: 30 },
  sectionTitle: { color: colors.white, fontSize: 20, fontWeight: '600', marginBottom: 16 },
  dateInputContainer: { marginBottom: 20 },
  dateInputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dateLabel: { color: colors.white, fontSize: 16, fontWeight: '600' },
  datePickerBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: colors.white, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  datePickerBtnText: { fontSize: 18 },
  dateInput: { 
    backgroundColor: colors.white, 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  dayDisplay: { 
    fontSize: 14, 
    color: 'rgba(255,255,255,0.8)', 
    fontStyle: 'italic', 
    marginTop: 8,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 8,
    borderRadius: 8,
  },
  
  generateBtn: { 
    backgroundColor: colors.white, 
    borderRadius: 16, 
    padding: 18, 
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: { 
    color: colors.blue2, 
    fontSize: 18, 
    fontWeight: '700' 
  },
  
  loanTrackerBtn: { 
    backgroundColor: colors.amber, 
    borderRadius: 16, 
    padding: 18, 
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  loanTrackerBtnText: { 
    color: colors.white, 
    fontSize: 18, 
    fontWeight: '700' 
  },
  loanTrackerBtnDisabled: {
    opacity: 0.6,
  },
  
  quickStats: { marginTop: 'auto' },
  statsTitle: { color: colors.white, fontSize: 18, fontWeight: '600', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: { 
    flex: 1, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    borderRadius: 12, 
    padding: 16, 
    alignItems: 'center' 
  },
  statNumber: { fontSize: 24, fontWeight: '700', color: colors.white, marginBottom: 4 },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  
  pickerContainer: { 
    backgroundColor: colors.white, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pickerDoneBtn: { backgroundColor: colors.blue2, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 },
  pickerDoneBtnText: { color: colors.white, fontWeight: '600', fontSize: 16 },
  
  modalSafe: { flex: 1, backgroundColor: '#f8f9fa' },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 16, 
    paddingBottom: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  modalTitle: { fontSize: 24, fontWeight: '700', color: '#333', flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 18, color: '#666', fontWeight: '600' },
  modalContent: { flex: 1, padding: 20 },
  
  summarySection: { marginBottom: 24 },
  summaryTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { 
    backgroundColor: colors.white, 
    borderRadius: 12, 
    padding: 16, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: '45%'
  },
  summaryAmount: { fontSize: 18, fontWeight: '700', color: colors.blue2, marginBottom: 4 },
  summaryNumber: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 4 },
  summaryLabel: { fontSize: 12, color: '#666', textAlign: 'center' },
  
  transactionsSection: { marginBottom: 20 },
  transactionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  transactionsTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  exportBtn: { backgroundColor: colors.blue2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  exportBtnText: { color: colors.white, fontWeight: '600', fontSize: 12 },
  
  transactionItem: { 
    backgroundColor: colors.white, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  transactionLeft: { alignItems: 'flex-start' },
  transactionDate: { fontSize: 16, fontWeight: '700', color: '#333' },
  transactionYear: { fontSize: 12, color: '#666', marginTop: 2 },
  transactionRight: { alignItems: 'flex-end' },
  transactionAmount: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 4 },
  transactionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  transactionBadgeText: { color: colors.white, fontWeight: '600', fontSize: 10 },
  transactionMode: { fontSize: 16, marginTop: 4 },
  
  emptyTransactions: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#666', fontSize: 16 },

  // Day Report Button
  dayReportBtn: { 
    backgroundColor: '#4CAF50', 
    borderRadius: 16, 
    padding: 18, 
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  dayReportBtnText: { 
    color: colors.white, 
    fontSize: 18, 
    fontWeight: '700' 
  },

  // Day Report Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayReportSimpleModal: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    margin: 20,
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalWrap: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 20 
  },
  dayReportModal: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  dayReportModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.blue2,
    textAlign: 'center',
    marginBottom: 20,
  },
  dayReportSection: {
    marginBottom: 20,
  },
  dayReportLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  dayDateRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dayDateInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dayDatePickerBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.blue2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDatePickerBtnText: {
    fontSize: 20,
    color: colors.white,
  },
  dayDateDisplay: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  selectedDateDisplay: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  selectedDateDay: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
  },
  selectedDateFull: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  daySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dayChipActive: {
    backgroundColor: colors.blue2,
    borderColor: colors.blue2,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  dayChipTextActive: {
    color: colors.white,
  },
  shiftSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  shiftChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  shiftChipActive: {
    backgroundColor: colors.blue2,
    borderColor: colors.blue2,
  },
  shiftChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  shiftChipTextActive: {
    color: colors.white,
  },
  dayReportScroll: {
    maxHeight: '80%',
    width: '100%',
  },
  dayReportLoading: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    alignItems: 'center',
  },
  dayReportLoadingText: {
    color: colors.blue2,
    fontSize: 14,
    fontWeight: '600',
  },
  dayReportResults: {
    marginTop: 16,
  },
  dayReportResultsDivider: {
    height: 2,
    backgroundColor: '#e0e0e0',
    marginBottom: 16,
  },
  generateDayReportBtnDisabled: {
    opacity: 0.6,
  },
  dayReportButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  generateDayReportBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.blue2,
    alignItems: 'center',
  },
  generateDayReportBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },

  // Day Report Result Modal
  dayReportResultModal: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  dayReportResultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.blue2,
    textAlign: 'center',
  },
  dayReportResultDate: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  dayReportResultSection: {
    marginBottom: 16,
  },
  dayReportResultSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dayReportResultCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayReportResultTotalCard: {
    backgroundColor: colors.blue2,
  },
  dayReportResultDistCard: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  dayReportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayReportIcon: {
    fontSize: 20,
  },
  dayReportResultLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  dayReportResultAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  distAmount: {
    color: '#FF9800',
  },
  dayReportResultTotalLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  dayReportResultTotalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  dayReportResultStat: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  closeDayReportBtn: {
    backgroundColor: colors.blue2,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  closeDayReportBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});
