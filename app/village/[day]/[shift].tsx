import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, Switch } from "react-native";
import { useAuth } from "../../../src/auth-context";
import { useTheme } from "../../../src/theme-context";
import { addVillage, deleteVillage, getVillages, updateVillageDayShift } from "../../../src/repository";
import { Village } from "../../../src/types";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SHIFTS = ["Morning", "Evening"] as const;

export default function VillageListScreen() {
  const { day, shift } = useLocalSearchParams<{ day: string; shift: string }>();
  const { user } = useAuth();
  const { colors, isDark, toggleDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [villages, setVillages] = useState<Village[]>([]);
  const [newVillageName, setNewVillageName] = useState("");
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [villageToDelete, setVillageToDelete] = useState<Village | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [villageToMove, setVillageToMove] = useState<Village | null>(null);
  const [moveDay, setMoveDay] = useState<string>("Monday");
  const [moveShift, setMoveShift] = useState<string>("Morning");
  const [moveSaving, setMoveSaving] = useState(false);

  const reload = async () => {
    if (!user) return;
    setVillages(await getVillages(user.uid));
  };
  useEffect(() => {
    reload();
  }, [user]);

  const filtered = useMemo(() => villages.filter((v) => v.dayOfWeek === day && v.shift === shift), [villages, day, shift]);

  const openMoveModal = (village: Village) => {
    setVillageToMove(village);
    setMoveDay(village.dayOfWeek);
    setMoveShift(village.shift);
    setMoveModalVisible(true);
  };

  const closeMoveModal = () => {
    setMoveModalVisible(false);
    setVillageToMove(null);
  };

  const saveMove = async () => {
    if (!villageToMove) return;
    try {
      setMoveSaving(true);
      await updateVillageDayShift(villageToMove.id, moveDay, moveShift);
      closeMoveModal();
      await reload();
    } finally {
      setMoveSaving(false);
    }
  };

  const requestDeleteFromMoveModal = () => {
    if (!villageToMove) return;
    const v = villageToMove;
    closeMoveModal();
    setVillageToDelete(v);
    setDeleteConfirmVisible(true);
  };

  const confirmDelete = async () => {
    if (!villageToDelete) return;
    await deleteVillage(villageToDelete.id);
    setDeleteConfirmVisible(false);
    setVillageToDelete(null);
    await reload();
  };

  const cancelDelete = () => {
    setDeleteConfirmVisible(false);
    setVillageToDelete(null);
  };

  return (
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['top']}>
        <View style={styles.content}>
          <View style={styles.headerContainer}>
            <View style={styles.headerLeft}>
              <Text style={styles.header}>Villages</Text>
              <Text style={styles.sub}>{day} • {shift}</Text>
            </View>
            <View style={styles.themeToggle}>
              <Text style={[styles.themeText, { color: colors.textSecondary }]}>Dark</Text>
              <Switch
                value={isDark}
                onValueChange={toggleDarkMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={isDark ? colors.primary : colors.background}
              />
            </View>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{filtered.length}</Text>
              <Text style={styles.statLabel}>Active Villages</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{villages.length}</Text>
              <Text style={styles.statLabel}>Total Villages</Text>
            </View>
          </View>

          <View style={styles.addContainer}>
            <TextInput
              placeholder="Enter village name..."
              value={newVillageName}
              onChangeText={setNewVillageName}
              style={styles.input}
              placeholderTextColor="rgba(255,255,255,0.6)"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.addBtn, !newVillageName.trim() && styles.addBtnDisabled]}
              onPress={async () => {
                if (!newVillageName.trim() || !user) return;
                await addVillage(user.uid, newVillageName.trim(), String(day), String(shift));
                setNewVillageName("");
                await reload();
              }}
              disabled={!newVillageName.trim()}
            >
              <Text style={styles.addTxt}>Add Village</Text>
            </Pressable>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => router.push(`/customer/${item.id}`)}
                onLongPress={() => openMoveModal(item)}
                delayLongPress={450}
                style={styles.villageCard}
              >
                <View style={styles.villageHeader}>
                  <View style={styles.villageInfo}>
                    <Text style={styles.villageName}>{item.name}</Text>
                    <Text style={styles.villageSubtext}>Tap to view customers</Text>
                  </View>
                  <View style={styles.villageIndex}>
                    <Text style={styles.villageIndexText}>{index + 1}</Text>
                  </View>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🏘️</Text>
                <Text style={styles.emptyTitle}>No Villages</Text>
                <Text style={styles.emptySubtitle}>Add a village to get started</Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>

      <Modal
        visible={moveModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeMoveModal}
      >
        <View style={styles.moveModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMoveModal} />
          <View style={[styles.moveSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.moveTitle}>Move village</Text>
            {villageToMove && (
              <Text style={styles.moveVillageName}>{villageToMove.name}</Text>
            )}
            <Text style={styles.moveSectionLabel}>Day</Text>
            <View style={styles.moveChipWrap}>
              {DAYS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setMoveDay(d)}
                  style={[styles.moveChip, moveDay === d && styles.moveChipOn]}
                >
                  <Text style={[styles.moveChipText, moveDay === d && styles.moveChipTextOn]} numberOfLines={1}>
                    {d.slice(0, 3)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.moveSectionLabel}>Shift</Text>
            <View style={styles.moveShiftRow}>
              {SHIFTS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setMoveShift(s)}
                  style={[styles.moveShiftBtn, moveShift === s && styles.moveShiftBtnOn]}
                >
                  <Text style={[styles.moveShiftText, moveShift === s && styles.moveShiftTextOn]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.moveSaveBtn, moveSaving && styles.moveSaveBtnDisabled]}
              onPress={saveMove}
              disabled={moveSaving}
            >
              <Text style={styles.moveSaveText}>{moveSaving ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable style={styles.moveCancelBtn} onPress={closeMoveModal}>
              <Text style={styles.moveCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.moveDeleteLink} onPress={requestDeleteFromMoveModal}>
              <Text style={styles.moveDeleteLinkText}>Delete village…</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Delete Village</Text>
            <Text style={styles.confirmMessage}>
              Are you sure you want to delete "{villageToDelete?.name}"?
              {'\n\n'}
              ⚠️ All customers and their loan/payment records in this village will be permanently deleted!
            </Text>
            <View style={styles.confirmButtons}>
              <Pressable style={styles.cancelBtn} onPress={cancelDelete}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, width: "100%", maxWidth: Math.min(screenWidth - 32, 370), alignSelf: "center", paddingTop: 8 },
  headerContainer: { marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flex: 1 },
  header: { color: colors.white, fontSize: 28, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.7)" },
  themeToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  themeText: { fontSize: 14, fontWeight: "600" },
  statsContainer: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 12, alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700", color: colors.white },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  addContainer: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: colors.white, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  addBtn: { backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 24, justifyContent: "center", minWidth: 120 },
  addBtnDisabled: { backgroundColor: "rgba(255,255,255,0.3)" },
  addTxt: { color: colors.blue2, fontWeight: "700", fontSize: 14 },
  listContainer: { paddingBottom: 20 },
  villageCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  villageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  villageInfo: { flex: 1 },
  villageName: { fontWeight: "700", fontSize: 18, color: "#333", marginBottom: 4 },
  villageIndex: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.blue2, justifyContent: "center", alignItems: "center" },
  villageIndexText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  villageSubtext: { color: "#666", fontSize: 13 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 40
  },
  moveModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  confirmDialog: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center'
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center'
  },
  confirmMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center'
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666'
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#ff4444',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center'
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white
  },
  moveSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "85%",
  },
  moveTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  moveVillageName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.blue2,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  moveSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  moveChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  moveChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
  moveChipOn: {
    backgroundColor: "#e3f2fd",
    borderColor: colors.blue2,
  },
  moveChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#555",
  },
  moveChipTextOn: {
    color: colors.blue2,
  },
  moveShiftRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  moveShiftBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  moveShiftBtnOn: {
    backgroundColor: "#e3f2fd",
    borderColor: colors.blue2,
  },
  moveShiftText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#555",
  },
  moveShiftTextOn: {
    color: colors.blue2,
  },
  moveSaveBtn: {
    backgroundColor: colors.blue2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  moveSaveBtnDisabled: {
    opacity: 0.6,
  },
  moveSaveText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 16,
  },
  moveCancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  moveCancelText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  moveDeleteLink: {
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  moveDeleteLinkText: {
    color: "#c62828",
    fontSize: 14,
    fontWeight: "600",
  },
});
