// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMIZED BULK ENTRY COMPONENT
// Handles 100+ customers with pagination, memoization, and virtualized rendering
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Icon from "../../src/Icon";

const CUSTOMERS_PER_PAGE = 15; // Render 15 at a time for smooth scrolling

// ─────────────────────────────────────────────────────────────────────────────
// MEMOIZED CUSTOMER ROW — Only re-renders if props change
// ─────────────────────────────────────────────────────────────────────────────
const BulkCustomerRow = React.memo(function BulkCustomerRow({
  customer,
  isSelected,
  amount,
  onToggleSelect,
  onChangeAmount,
  loan,
}: {
  customer: any;
  isSelected: boolean;
  amount: string;
  onToggleSelect: () => void;
  onChangeAmount: (value: string) => void;
  loan: any;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
        opacity: isSelected ? 1 : 0.5,
      }}
    >
      {/* Checkbox and Customer details */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <Pressable onPress={onToggleSelect} style={{ padding: 4 }}>
          <Icon
            name={isSelected ? "checkbox" : "square-outline"}
            size={24}
            color={isSelected ? "#12294A" : "#6B7A8D"}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#12294A" }}>
            {customer.name}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "#6B7A8D" }}>
            ID: {customer.numericalId} {loan ? `| Active Bal: Rs.${loan.balanceAmount}` : ""}
          </Text>
        </View>
      </View>

      {/* Amount Input */}
      <TextInput
        style={{
          width: 90,
          backgroundColor: isSelected ? "#f8fafc" : "#e2e8f0",
          borderWidth: 1,
          borderColor: "#cbd5e1",
          borderRadius: 8,
          paddingVertical: 6,
          paddingHorizontal: 10,
          fontSize: 14,
          color: "#0f172a",
          textAlign: "right",
        }}
        placeholder={isSelected ? "Due" : "N/A"}
        placeholderTextColor="#94a3b8"
        keyboardType="numeric"
        value={amount}
        onChangeText={onChangeAmount}
        editable={isSelected}
      />
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison — return true if props are equal (skip re-render)
  return (
    prevProps.customer.id === nextProps.customer.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.amount === nextProps.amount &&
    prevProps.loan?.id === nextProps.loan?.id
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZED BULK ENTRY CARD
// ─────────────────────────────────────────────────────────────────────────────
export function renderBulkEntryCardOptimized({
  t,
  villages,
  customers,
  bulkVillageId,
  bulkDateStr,
  bulkActiveLoans,
  bulkAmounts,
  bulkSelected,
  bulkLoading,
  bulkSubmitting,
  setBulkVillageId,
  setBulkDateStr,
  setBulkAmounts,
  setBulkSelected,
  handleBulkSubmit,
  DatePickerField,
  styles: globalStyles,
}: any) {
  const [currentPage, setCurrentPage] = useState(0);

  const villageCustomers = useMemo(
    () => customers.filter((c) => c.villageId === bulkVillageId),
    [customers, bulkVillageId]
  );

  // Filter to customers with active loans
  const activeCustomers = useMemo(
    () =>
      villageCustomers.filter((c) => {
        const loan = bulkActiveLoans[c.id];
        return loan && loan.status === "ACTIVE";
      }),
    [villageCustomers, bulkActiveLoans]
  );

  // Paginate — show only CUSTOMERS_PER_PAGE at a time
  const paginatedCustomers = useMemo(
    () => {
      const start = currentPage * CUSTOMERS_PER_PAGE;
      const end = start + CUSTOMERS_PER_PAGE;
      return activeCustomers.slice(start, end);
    },
    [activeCustomers, currentPage]
  );

  const totalPages = useMemo(
    () => Math.ceil(activeCustomers.length / CUSTOMERS_PER_PAGE),
    [activeCustomers.length]
  );

  const handleToggleSelect = useCallback(
    (customerId: string) => {
      setBulkSelected((prev) => ({ ...prev, [customerId]: !prev[customerId] }));
    },
    [setBulkSelected]
  );

  const handleChangeAmount = useCallback(
    (customerId: string, value: string) => {
      setBulkAmounts((prev) => ({ ...prev, [customerId]: value }));
    },
    [setBulkAmounts]
  );

  return (
    <View style={globalStyles.card}>
      <Text style={globalStyles.cardTitle}>{t("bulkEntry")}</Text>
      <Text style={globalStyles.cardDesc}>
        Record payments or dues for a village on a specific date.
      </Text>

      {/* Date Selector */}
      <View style={globalStyles.inputContainer}>
        <Text style={globalStyles.inputLabel}>{t("selectDate")}</Text>
        <DatePickerField
          value={bulkDateStr}
          onChange={setBulkDateStr}
          placeholder="DD/MM/YYYY"
        />
      </View>

      {/* Village Scrollable list */}
      <View style={globalStyles.inputContainer}>
        <Text style={globalStyles.inputLabel}>{t("selectVillage")}</Text>
        {villages.length === 0 ? (
          <Text style={globalStyles.emptyText}>No villages found.</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 8, marginVertical: 4 }}>
            {villages.map((v) => (
              <Pressable
                key={v.id}
                style={[{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: bulkVillageId === v.id ? "#12294A" : "#F4F6F9",
                  borderWidth: 1,
                  borderColor: bulkVillageId === v.id ? "#12294A" : "#E1E6ED",
                }]}
                onPress={() => {
                  setBulkVillageId(v.id);
                  setCurrentPage(0); // Reset to first page on village change
                }}
              >
                <Text style={{
                  color: bulkVillageId === v.id ? "#D4AF6A" : "#6B7A8D",
                  fontSize: 13,
                  fontWeight: "800",
                }}>{v.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={{ height: 1, backgroundColor: "#E1E6ED", marginVertical: 8 }} />

      {/* Info label about deselecting */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F4F6F9", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E1E6ED" }}>
        <Icon name="information-circle-outline" size={16} color="#12294A" />
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#12294A", flex: 1 }}>
          {t("deselectHint")}
        </Text>
      </View>

      {/* Customer List — VIRTUALIZED with FlatList for performance */}
      <Text style={[globalStyles.inputLabel, { marginTop: 10 }]}>
        Customers List ({activeCustomers.length} total)
      </Text>

      {bulkLoading ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#12294A" />
        </View>
      ) : !bulkVillageId ? (
        <Text style={globalStyles.emptyText}>Please select a village above.</Text>
      ) : activeCustomers.length === 0 ? (
        <Text style={globalStyles.emptyText}>
          No customers with active loans in this village.
        </Text>
      ) : (
        <>
          {/* FlatList for efficient rendering of paginated customers */}
          <FlatList
            data={paginatedCustomers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <BulkCustomerRow
                customer={item}
                isSelected={bulkSelected[item.id] !== false}
                amount={bulkAmounts[item.id] || ""}
                onToggleSelect={() => handleToggleSelect(item.id)}
                onChangeAmount={(value) => handleChangeAmount(item.id, value)}
                loan={bulkActiveLoans[item.id]}
              />
            )}
            scrollEnabled={false}
            // Performance optimization
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
          />

          {/* Pagination controls */}
          {totalPages > 1 && (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 16,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: "#E1E6ED",
            }}>
              <Pressable
                onPress={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                style={{ padding: 8, opacity: currentPage === 0 ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#12294A" }}>
                  ← Previous
                </Text>
              </Pressable>

              <Text style={{ fontSize: 13, fontWeight: "700", color: "#6B7A8D" }}>
                Page {currentPage + 1} of {totalPages}
              </Text>

              <Pressable
                onPress={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage === totalPages - 1}
                style={{ padding: 8, opacity: currentPage === totalPages - 1 ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#12294A" }}>
                  Next →
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Done/Submit Button */}
      {activeCustomers.length > 0 && (
        <Pressable
          style={[globalStyles.primaryButton, (bulkSubmitting || bulkLoading) && globalStyles.btnDisabled, { marginTop: 12 }]}
          onPress={handleBulkSubmit}
          disabled={bulkSubmitting || bulkLoading}
        >
          {bulkSubmitting ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <Text style={globalStyles.primaryButtonText}>{t("done")}</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}
