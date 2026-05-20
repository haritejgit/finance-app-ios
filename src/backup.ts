import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

const COLLECTIONS = ["villages", "customers", "loans", "payments"] as const;

type BackupCollection = (typeof COLLECTIONS)[number];

export type BackupSnapshot = {
  version: 1;
  exportedAt: string;
  userId: string;
  collections: Record<BackupCollection, { id: string; data: Record<string, any> }[]>;
};

function stripUndefined(value: Record<string, any>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function createBackupSnapshot(userId: string): Promise<BackupSnapshot> {
  const collections = {} as BackupSnapshot["collections"];
  for (const collectionName of COLLECTIONS) {
    const snap = await getDocs(query(collection(db, collectionName), where("userId", "==", userId)));
    collections[collectionName] = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      data: stripUndefined({ id: docSnap.id, ...docSnap.data() }),
    }));
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId,
    collections,
  };
}

export function parseBackupSnapshot(raw: string, userId: string): BackupSnapshot {
  const parsed = JSON.parse(raw) as BackupSnapshot;
  if (parsed.version !== 1 || !parsed.collections || parsed.userId !== userId) {
    throw new Error("This backup does not match the signed-in account.");
  }
  for (const collectionName of COLLECTIONS) {
    if (!Array.isArray(parsed.collections[collectionName])) {
      throw new Error(`Backup is missing ${collectionName}.`);
    }
    parsed.collections[collectionName].forEach((entry) => {
      if (!entry.id || entry.data?.userId !== userId) {
        throw new Error(`Backup contains invalid ${collectionName} records.`);
      }
    });
  }
  return parsed;
}

export async function restoreBackupSnapshot(snapshot: BackupSnapshot, userId: string) {
  let restored = 0;
  for (const collectionName of COLLECTIONS) {
    const records = snapshot.collections[collectionName].filter((entry) => entry.data.userId === userId);
    for (let i = 0; i < records.length; i += 450) {
      const batch = writeBatch(db);
      records.slice(i, i + 450).forEach((entry) => {
        batch.set(doc(db, collectionName, entry.id), stripUndefined(entry.data), { merge: true });
      });
      await batch.commit();
      restored += records.slice(i, i + 450).length;
    }
  }
  return restored;
}

export function makeBackupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `finance-backup-${stamp}.json`;
}
