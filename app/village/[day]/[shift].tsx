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
  const params = useLocalSearchParams<{ day: string; shift: string }>();
  const day = typeof params.day === 'string' ? params.day : Array.isArray(params.day) ? params.day[0] : "Monday";
  const shift = typeof params.shift === 'string' ? params.shift : Array.isArray(params.shift) ? params.shift[0] : "Morning";
  const { user, loading: authLoading } = useAuth();
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
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setVillages(await getVillages(user.uid));
    } catch (error) {
      console.error("Failed to load villages:", error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // Wait for Firebase Auth to resolve before fetching
    if (authLoading) return;
    reload();
  }, [user, authLoading]);

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

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, { color: colors.text }]}>Loading villages...</Text>
            </View>
          ) : (
            <>
              <View style={styles.statsContainer}>
                <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNumber, { color: colors.text }]}>{filtered.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active Villages</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNumber, { color: colors.text }]}>{villages.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Villages</Text>
                </View>
              </View>

              <View style={styles.addContainer}>
                <TextInput
                  placeholder="Enter village name..."
                  value={newVillageName}
                  onChangeText={setNewVillageName}
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.addBtn, { backgroundColor: colors.primary }, !newVillageName.trim() && styles.addBtnDisabled]}
                  onPress={async () => {
                    if (!newVillageName.trim() || !user) return;
                    await addVillage(user.uid, newVillageName.trim(), String(day), String(shift));
                    setNewVillageName("");
                    await reload();
                  }}
                  disabled={!newVillageName.trim()}
                >
                  <Text style={[styles.addTxt, { color: colors.white }]}>Add Village</Text>
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
                    style={[styles.villageCard, { backgroundColor: colors.card }]}
                  >
                    <View style={styles.villageHeader}>
                      <View style={styles.villageInfo}>
                        <Text style={[styles.villageName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.villageSubtext, { color: colors.textSecondary }]}>Tap to view customers</Text>
                      </View>
                      <View style={[styles.villageIndex, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.villageIndexText, { color: colors.white }]}>{index + 1}</Text>
                      </View>
                    </View>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🏘️</Text>
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>No Villages</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Add a village to get started</Text>
                  </View>
                }
              />
            </>
          )}
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
          <View style={[styles.moveSheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16), borderColor: colors.border }]}>
            <Text style={[styles.moveTitle, { color: colors.text }]}>Move village</Text>
            {villageToMove && (
              <Text style={[styles.moveVillageName, { color: colors.primary }]}>{villageToMove.name}</Text>
            )}
            <Text style={[styles.moveSectionLabel, { color: colors.textSecondary }]}>Day</Text>
            <View style={styles.moveChipWrap}>
              {DAYS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setMoveDay(d)}
                  style={[styles.moveChip, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }, moveDay === d && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
                >
                  <Text style={[styles.moveChipText, { color: colors.textSecondary }, moveDay === d && { color: colors.primary }]} numberOfLines={1}>
                    {d.slice(0, 3)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.moveSectionLabel, { color: colors.textSecondary }]}>Shift</Text>
            <View style={styles.moveShiftRow}>
              {SHIFTS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setMoveShift(s)}
                  style={[styles.moveShiftBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }, moveShift === s && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
                >
                  <Text style={[styles.moveShiftText, { color: colors.textSecondary }, moveShift === s && { color: colors.primary }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.moveSaveBtn, { backgroundColor: colors.primary }, moveSaving && styles.moveSaveBtnDisabled]}
              onPress={saveMove}
              disabled={moveSaving}
            >
              <Text style={[styles.moveSaveText, { color: colors.white }]}>{moveSaving ? "Saving…" : "Save"}</Text>
            </Pressable>
            <Pressable style={styles.moveCancelBtn} onPress={closeMoveModal}>
              <Text style={[styles.moveCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.moveDeleteLink} onPress={requestDeleteFromMoveModal}>
              <Text style={[styles.moveDeleteLinkText, { color: colors.error }]}>Delete village…</Text>
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
          <View style={[styles.confirmDialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Delete Village</Text>
            <Text style={[styles.confirmMessage, { color: colors.textSecondary }]}>
              Are you sure you want to delete "{villageToDelete?.name}"?
              {'\n\n'}
              ⚠️ All customers and their loan/payment records in this village will be permanently deleted!
            </Text>
            <View style={styles.confirmButtons}>
              <Pressable style={[styles.cancelBtn, { backgroundColor: colors.border }]} onPress={cancelDelete}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.deleteBtn, { backgroundColor: '#ff4444' }]} onPress={confirmDelete}>
                <Text style={[styles.deleteBtnText, { color: colors.white }]}>Delete</Text>
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
  header: { color: "#FFFFFF", fontSize: 28, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.7)" },
  themeToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  themeText: { fontSize: 14, fontWeight: "600" },
  statsContainer: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  statLabel: { fontSize: 11, marginTop: 2 },
  addContainer: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, fontSize: 16 },
  addBtn: { borderRadius: 12, paddingHorizontal: 24, justifyContent: "center", minWidth: 120 },
  addBtnDisabled: { opacity: 0.3 },
  addTxt: { fontWeight: "700", fontSize: 14 },
  listContainer: { paddingBottom: 20 },
  villageCard: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  villageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  villageInfo: { flex: 1 },
  villageName: { fontWeight: "700", fontSize: 18, marginBottom: 4 },
  villageIndex: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  villageIndexText: { fontWeight: "700", fontSize: 14 },
  villageSubtext: { fontSize: 13 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: { fontSize: 14 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  loadingText: { fontSize: 16, fontWeight: "600" },
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
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center'
  },
  confirmMessage: {
    fontSize: 14,
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
    borderRadius: 12,
    padding: 14,
    alignItems: 'center'
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center'
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  moveSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "85%",
    borderWidth: 1,
  },
  moveTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  moveVillageName: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  moveSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
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
  },
  moveChipText: {
    fontSize: 12,
    fontWeight: "600",
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
    alignItems: "center",
  },
  moveShiftText: {
    fontSize: 15,
    fontWeight: "600",
  },
  moveSaveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  moveSaveBtnDisabled: {
    opacity: 0.6,
  },
  moveSaveText: {
    fontWeight: "700",
    fontSize: 16,
  },
  moveCancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  moveCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  moveDeleteLink: {
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  moveDeleteLinkText: {
    fontSize: 14,
    fontWeight: "600",
  },
});