import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Language = "en" | "te";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const dictionary: Record<Language, Record<string, string>> = {
  en: {
    // Common/Tabs
    dashboard: "Dashboard",
    settings: "Settings",
    account: "Account",
    reports: "Reports",
    analytics: "Analytics",
    logout: "Logout",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    add: "Add",
    loading: "Loading...",
    done: "Done",
    confirm: "Confirm",
    success: "Success",
    error: "Error",
    warning: "Warning",
    date: "Date",
    amount: "Amount",
    description: "Description",
    type: "Type",
    mode: "Mode",

    // Dashboard Screen
    premiumWorkspace: "Premium finance workspace",
    financeDashboard: "Finance Dashboard",
    goodMorning: "Good Morning",
    goodAfternoon: "Good Afternoon",
    goodEvening: "Good Evening",
    searchCustomers: "Search customers",
    collectedToday: "Collected today",
    distributedTodayHint: "Tap to see distributed today:",
    collectionRoute: "Collection Route",
    day: "Day",
    shift: "Shift",
    startCollection: "Start Collection",
    balance: "Balance",
    income: "Income",
    expense: "Expense",
    savings: "Savings",
    collectedMinusPending: "Collected minus pending",
    collectedThisMonth: "Collected this month",
    distributedThisMonth: "Distributed this month",
    needsRecoveryFocus: "Needs recovery focus",
    monthlyOverview: "Monthly Overview",
    collectedVsDistributedByWeek: "Collected vs distributed by week",
    in: "In",
    out: "Out",
    smartInsights: "Smart Insights",
    alertsFromTransactions: "Alerts generated from existing transactions",
    recentTransactions: "Recent Transactions",
    latestCollections: "Latest collections across routes",
    budgetAlerts: "Budget Alerts",
    customersNeedingFollowup: "Customers needing follow-up",
    smartCustomerSearch: "Smart Customer Search",
    searchPlaceholder: "Name, mobile, Aadhar, book no, village...",
    noCustomersFound: "No customers found",
    active: "active",
    all: "All",
    pending: "Pending",
    overdue: "Overdue",
    paidToday: "Paid today",
    closed: "Closed",
    noVillage: "No village",

    // Settings Screen
    settingsTitle: "Settings",
    accountDetails: "Account and session details",
    signedInAs: "Signed in as",
    displayName: "Display name",
    theme: "Theme",
    exportWholeData: "Export Whole Data",
    exportingWholeData: "Exporting Whole Data...",
    aiAdvisor: "AI Business Advisor",
    aiAdvisorSub: "Ask about collections and dues",
    blockAadhaar: "Block Aadhaar",
    blockAadhaarSub: "Prevent fraudulent registrations",
    insightsTitle: "Insights",
    insightsSub: "Smart loan intelligence",
    backupRestore: "Backup & restore",
    backupRestoreSub: "Safe merge backup tools",
    backupDescription: "Backup exports include villages, customers, loans, and payments for this signed-in account only. Restore merges records and never deletes existing records.",
    jsonBackup: "JSON Backup",
    restore: "Restore",
    language: "Language",
    english: "English",
    telugu: "Telugu (తెలుగు)",
    loanCalculator: "Loan Calculator",
    loanCalculatorSub: "Simulate loans & repayment plans",

    // Account Workspace
    accountWorkspace: "Account Workspace",
    accountWorkspaceDesc: "Manage Balancing Fund, Investments & Expenses",
    bfSummary: "BF & Summary",
    investments: "Investments",
    expenses: "Expenses",
    history: "History",
    historyLog: "Transaction History",
    noTransactions: "No transactions found for the selected period.",
    highestDues: "Highest Dues",
    balancingFund: "Balancing Fund (BF)",
    balancingFundDesc: "Enter the starting balance for your ledger books.",
    startingAmount: "Starting Amount (Rs.)",
    updateBalancingFund: "Update Balancing Fund",
    calculateTotals: "Calculate Period Totals",
    calculateTotalsDesc: "Select a date range to filter and see calculations.",
    startDate: "Start Date",
    endDate: "End Date",
    liveSummary: "Live Summary Breakdown",
    exportPDF: "Export PDF",
    exportJPG: "Export JPG",
    addInvestment: "Add Investment",
    addInvestmentDesc: "Record capital additions to the Balancing Fund.",
    investmentAmount: "Investment Amount (Rs.)",
    addInvestmentEntry: "Add Investment Entry",
    investmentLog: "Investment Log",
    noInvestments: "No investments recorded yet.",
    addExpense: "Add Expense",
    addExpenseDesc: "Record company overheads and outgoings.",
    expenseAmount: "Expense Amount (Rs.)",
    addExpenseEntry: "Add Expense Entry",
    expenseLog: "Expense Log",
    noExpenses: "No expenses recorded yet.",
    selectExportFormat: "Select Export Format",
    pdfReport: "PDF Report",
    jpgImage: "JPG Image",
    chooseLanguage: "Choose Export Language",
    chooseVillage: "Choose Village Filter",
    allVillages: "All Villages",
    export: "Export",
    investorName: "Investor Name",
    investorNamePlaceholder: "e.g. Ravi, Suresh",
    editExpense: "Edit Expense",
    updateExpenseEntry: "Update Expense",
    editInvestment: "Edit Investment",
    updateInvestmentEntry: "Update Investment",
    edit: "Edit",

    // Village Screen
    villages: "Villages",
    activeVillages: "Active Villages",
    totalVillages: "Total Villages",
    loadingVillages: "Loading villages...",
    tapToViewCustomers: "Tap to view customers",
    noVillages: "No Villages",
    addVillageSubtitle: "Add a village to get started",
    addVillageTitle: "Add Village",
    villageNamePlaceholder: "Village name",
    moveVillage: "Move village",
    deleteVillageTitle: "Delete Village",
    renameVillage: "Rename Village",
    moreOptions: "Move or Delete Village...",
    deleteVillageConfirm: "Are you sure you want to delete",
    deleteVillageWarning: "WARNING: All customers and their loan/payment records in this village will be permanently deleted!",
  },
  te: {
    // Common/Tabs
    dashboard: "డ్యాష్‌బోర్డ్",
    settings: "సెట్టింగులు",
    account: "ఖాతా",
    reports: "నివేదికలు",
    analytics: "విశ్లేషణలు",
    logout: "లాగ్ అవుట్",
    save: "సేవ్ చేయి",
    cancel: "రద్దు చేయి",
    delete: "తొలగించు",
    add: "జోడించు",
    loading: "లోడ్ అవుతోంది...",
    done: "పూర్తయింది",
    confirm: "ధృవీకరించు",
    success: "విజయం",
    error: "లోపం",
    warning: "హెచ్చరిక",
    date: "తేదీ",
    amount: "మొత్తం",
    description: "వివరణ",
    type: "రకం",
    mode: "విధానం",

    // Dashboard Screen
    premiumWorkspace: "ప్రీమియం ఫైనాన్స్ వర్క్‌స్పేస్",
    financeDashboard: "ఫైనాన్స్ డ్యాష్‌బోర్డ్",
    goodMorning: "శుభోదయం",
    goodAfternoon: "శుభ మధ్యాహ్నం",
    goodEvening: "శుభ సాయంత్రం",
    searchCustomers: "కస్టమర్లను శోధించండి",
    collectedToday: "ఈరోజు వసూలు చేసినది",
    distributedTodayHint: "ఈరోజు పంపిణీ చేసినది చూడటానికి నొక్కండి:",
    collectionRoute: "వసూలు మార్గం",
    day: "రోజు",
    shift: "షిఫ్ట్",
    startCollection: "వసూళ్లు ప్రారంభించు",
    balance: "బ్యాలెన్స్",
    income: "ఆదాయం",
    expense: "ఖర్చు",
    savings: "నిల్వలు",
    collectedMinusPending: "వసూలైనది మైనస్ బకాయి",
    collectedThisMonth: "ఈ నెల వసూలైనది",
    distributedThisMonth: "ఈ నెల పంపిణీ చేసినది",
    needsRecoveryFocus: "వసూలుపై దృష్టి పెట్టాలి",
    monthlyOverview: "నెలవారీ అవలోకనం",
    collectedVsDistributedByWeek: "వారం వారీగా వసూలు vs పంపిణీ",
    in: "వచ్చినవి",
    out: "వెళ్లినవి",
    smartInsights: "స్మార్ట్ అంతర్దృష్టులు",
    alertsFromTransactions: "లావాదేవీల నుండి సృష్టించబడిన హెచ్చరికలు",
    recentTransactions: "ఇటీవలి లావాదేవీలు",
    latestCollections: "మార్గాల్లో ఇటీవలి వసూళ్లు",
    budgetAlerts: "బడ్జెట్ హెచ్చరికలు",
    customersNeedingFollowup: "ఫాలో-అప్ అవసరమైన కస్టమర్లు",
    smartCustomerSearch: "స్మార్ట్ కస్టమర్ శోధన",
    searchPlaceholder: "పేరు, మొబైల్, ఆధార్, బుక్ నెం, గ్రామం...",
    noCustomersFound: "కస్టమర్లు కనుగొనబడలేదు",
    active: "క్రియాశీల",
    all: "అన్నీ",
    pending: "బకాయి",
    overdue: "గడువు ముగిసినవి",
    paidToday: "ఈరోజు చెల్లించినవి",
    closed: "పూర్తయినవి",
    noVillage: "గ్రామం లేదు",

    // Settings Screen
    settingsTitle: "సెట్టింగులు",
    accountDetails: "ఖాతా మరియు సెషన్ వివరాలు",
    signedInAs: "లాగిన్ అయిన ఈమెయిల్",
    displayName: "ప్రదర్శన పేరు",
    theme: "థీమ్",
    exportWholeData: "మొత్తం డేటాను ఎగుమతి చేయి",
    exportingWholeData: "మొత్తం డేటాను ఎగుమతి చేస్తున్నాము...",
    aiAdvisor: "AI బిజినెస్ సలహాదారు",
    aiAdvisorSub: "వసూళ్లు మరియు బకాయిల గురించి అడగండి",
    blockAadhaar: "ఆధార్ బ్లాక్ చేయి",
    blockAadhaarSub: "నకిలీ నమోదులను నిరోధించండి",
    insightsTitle: "అంతర్దృష్టులు",
    insightsSub: "స్మార్ట్ లోన్ ఇంటెలిజెన్స్",
    backupRestore: "బ్యాకప్ & రీస్టోర్",
    backupRestoreSub: "సేఫ్ మెర్జ్ బ్యాకప్ టూల్స్",
    backupDescription: "బ్యాకప్ ఎగుమతులలో ఈ లాగిన్ అయిన ఖాతాకు సంబంధించిన గ్రామాలు, కస్టమర్లు, రుణాలు మరియు చెల్లింపులు మాత్రమే ఉంటాయి. రీస్టోర్ రికార్డులను కలుపుతుంది మరియు ఇప్పటికే ఉన్న రికార్డులను ఎప్పటికీ తొలగించదు.",
    jsonBackup: "JSON బ్యాకప్",
    restore: "రీస్టోర్",
    language: "భాష",
    english: "ఇంగ్లీష్ (English)",
    telugu: "తెలుగు (తెలుగు)",
    loanCalculator: "లోన్ క్యాలిక్యులేటర్",
    loanCalculatorSub: "లోన్ మరియు తిరిగి చెల్లించే ప్రణాళికలను లెక్కించండి",

    // Account Workspace
    accountWorkspace: "ఖాతా వర్క్‌స్పేస్",
    accountWorkspaceDesc: "బ్యాలెన్సింగ్ ఫండ్, పెట్టుబడులు & ఖర్చులను నిర్వహించండి",
    bfSummary: "BF & సారాంశం",
    investments: "పెట్టుబడులు",
    expenses: "ఖర్చులు",
    history: "చరిత్ర",
    historyLog: "లావాదేవీల చరిత్ర",
    noTransactions: "ఎంచుకున్న వ్యవధిలో ఎటువంటి లావాదేవీలు కనుగొనబడలేదు.",
    highestDues: "అత్యధిక బకాయిలు",
    balancingFund: "బ్యాలెన్సింగ్ ఫండ్ (BF)",
    balancingFundDesc: "మీ లెడ్జర్ పుస్తకాల కొరకు ప్రారంభ బ్యాలెన్స్ నమోదు చేయండి.",
    startingAmount: "ప్రారంభ మొత్తం (రూ.)",
    updateBalancingFund: "బ్యాలెన్సింగ్ ఫండ్‌ను నవీకరించు",
    calculateTotals: "సమయ మొత్తాలను లెక్కించు",
    calculateTotalsDesc: "లెక్కలను చూడటానికి తేదీ పరిధిని ఎంచుకోండి.",
    startDate: "ప్రారంభ తేదీ",
    endDate: "ముగింపు తేదీ",
    liveSummary: "ప్రత్యక్ష సారాంశం బ్రేక్‌డౌన్",
    exportPDF: "PDF ఎగుమతి చేయి",
    exportJPG: "JPG ఎగుమతి చేయi",
    addInvestment: "పెట్టుబడిని జోడించు",
    addInvestmentDesc: "బ్యాలెన్సింగ్ ఫండ్‌కు మూలధన చేర్పులను రికార్డ్ చేయండి.",
    investmentAmount: "పెట్టుబడి మొత్తం (రూ.)",
    addInvestmentEntry: "పెట్టుబడి నమోదును జోడించు",
    investmentLog: "పెట్టుబడుల లాగ్",
    noInvestments: "ఇంకా ఎలాంటి పెట్టుబడులు నమోదు కాలేదు.",
    addExpense: "ఖర్చును జోడించు",
    addExpenseDesc: "కంపెనీ ఖర్చులు మరియు ఇతర చెల్లింపులను రికార్డ్ చేయండి.",
    expenseAmount: "ఖర్చు మొత్తం (రూ.)",
    addExpenseEntry: "ఖర్చు నమోదును జోడించు",
    expenseLog: "ఖర్చుల లాగ్",
    noExpenses: "ఇంకా ఎలాంటి ఖర్చులు నమోదు కాలేదు.",
    selectExportFormat: "ఎగుమతి ఆకృతిని ఎంచుకోండి",
    pdfReport: "PDF నివేదిక",
    jpgImage: "JPG చిత్రం",
    chooseLanguage: "ఎగుమతి భాషను ఎంచుకోండి",
    chooseVillage: "గ్రామ ఫిల్టర్‌ను ఎంచుకోండి",
    allVillages: "అన్ని గ్రామాలు",
    export: "ఎగుమతి చేయి",
    investorName: "పెట్టుబడిదారు పేరు",
    investorNamePlaceholder: "ఉదా. రవి, సురేష్",
    editExpense: "ఖర్చును సవరించు",
    updateExpenseEntry: "ఖర్చును నవీకరించు",
    editInvestment: "పెట్టుబడిని సవరించు",
    updateInvestmentEntry: "పెట్టుబడిని నవీకరించు",
    edit: "సవరించు",

    // Village Screen
    villages: "గ్రామాలు",
    activeVillages: "క్రియాశీల గ్రామాలు",
    totalVillages: "మొత్తం గ్రామాలు",
    loadingVillages: "గ్రామాలను లోడ్ చేస్తున్నాము...",
    tapToViewCustomers: "కస్టమర్లను చూడటానికి నొక్కండి",
    noVillages: "గ్రామాలు లేవు",
    addVillageSubtitle: "ప్రారంభించడానికి ఒక గ్రామాన్ని జోడించండి",
    addVillageTitle: "గ్రామాన్ని జోడించు",
    villageNamePlaceholder: "గ్రామం పేరు",
    moveVillage: "గ్రామాన్ని మార్చండి",
    deleteVillageTitle: "గ్రామాన్ని తొలగించు",
    renameVillage: "గ్రామం పేరు మార్చు",
    moreOptions: "గ్రామాన్ని మార్చండి లేదా తొలగించండి...",
    deleteVillageConfirm: "మీరు నిజంగా తొలగించాలనుకుంటున్నారా",
    deleteVillageWarning: "హెచ్చరిక: ఈ గ్రామంలోని కస్టమర్లు మరియు వారి లోన్/పేమెంట్ రికార్డులన్నీ శాశ్వతంగా తొలగించబడతాయి!",
  },
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<Language>("en");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLang = async () => {
      try {
        const savedLang = await AsyncStorage.getItem("app_language");
        if (savedLang === "en" || savedLang === "te") {
          setLangState(savedLang);
        }
      } catch (err) {
        console.error("Failed to load language settings", err);
      } finally {
        setLoading(false);
      }
    };
    loadLang();
  }, []);

  const setLanguage = async (lang: Language) => {
    try {
      setLangState(lang);
      await AsyncStorage.setItem("app_language", lang);
    } catch (err) {
      console.error("Failed to save language settings", err);
    }
  };

  const t = (key: string): string => {
    const langDict = dictionary[language];
    return langDict[key] || dictionary["en"][key] || key;
  };

  if (loading) return null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
