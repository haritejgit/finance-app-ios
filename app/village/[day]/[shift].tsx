import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../../src/auth-context";
import { addVillage, deleteVillage, getVillages } from "../../../src/repository";
import { Village } from "../../../src/types";
import { colors } from "../../../src/theme";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export default function VillageListScreen() {
  const { day, shift } = useLocalSearchParams<{ day: string; shift: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [villages, setVillages] = useState<Village[]>([]);
  const [newVillageName, setNewVillageName] = useState("");
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [villageToDelete, setVillageToDelete] = useState<Village | null>(null);

  const reload = async () => {
    if (!user) return;
    setVillages(await getVillages(user.uid));
  };
  useEffect(() => {
    reload();
  }, [user]);

  const filtered = useMemo(() => villages.filter((v) => v.dayOfWeek === day && v.shift === shift), [villages, day, shift]);

  const handleDeleteVillage = (village: Village) => {
    setVillageToDelete(village);
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
            <Text style={styles.header}>Villages</Text>
            <Text style={styles.sub}>{day} • {shift}</Text>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{filtered.length}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{villages.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>

          <View style={styles.addContainer}>
            <TextInput 
              placeholder="Enter village name..." 
              value={newVillageName} 
              onChangeText={setNewVillageName} 
              style={styles.input}
              placeholderTextColor="rgba(255,255,255,0.6)"
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
              <Text style={styles.addTxt}>ADD</Text>
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
                onLongPress={() => handleDeleteVillage(item)}
                style={styles.villageCard}
              >
                <View style={styles.villageHeader}>
                  <Text style={styles.villageName}>{item.name}</Text>
                  <View style={styles.villageIndex}>
                    <Text style={styles.villageIndexText}>{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.villageSubtext}>Tap to view customers • Long press to delete</Text>
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
        visible={deleteConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Delete Village</Text>
            <Text style={styles.confirmMessage}>
              Are you sure you want to delete "{villageToDelete?.name}"? This action cannot be undone.
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
  headerContainer: { marginBottom: 16 },
  header: { color: colors.white, fontSize: 28, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.7)" },
  statsContainer: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 12, alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700", color: colors.white },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  addContainer: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: colors.white, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  addBtn: { backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 20, justifyContent: "center", minWidth: 60 },
  addBtnDisabled: { backgroundColor: "rgba(255,255,255,0.3)" },
  addTxt: { color: colors.blue2, fontWeight: "700" },
  listContainer: { paddingBottom: 20 },
  villageCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12 },
  villageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  villageName: { fontWeight: "700", fontSize: 18, color: "#333", flex: 1 },
  villageIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.blue2, justifyContent: "center", alignItems: "center" },
  villageIndexText: { color: colors.white, fontWeight: "700", fontSize: 12 },
  villageSubtext: { color: "#666", fontSize: 12 },
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
});
