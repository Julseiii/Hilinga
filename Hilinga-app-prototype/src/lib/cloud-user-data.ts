import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";

import type {
  ItineraryDay,
  SavedItem,
  SavedKind,
  TripPlan,
} from "@/lib/database";
import { firestore } from "@/lib/firebase";

const FIREBASE_TIMEOUT_MS = 12_000;
const LEGACY_OWNER_KEY = "legacy_cloud_data_owner";
const SAVED_STORE = "user_saved_items";
const TRIPS_STORE = "user_trip_plans";

type SyncState = "pending" | "synced";
type CachedSavedItem = SavedItem & {
  userId: string;
  updatedAt: string;
  syncState: SyncState;
  deleted?: boolean;
};
type CachedTripPlan = TripPlan & {
  userId: string;
  updatedAt: string;
  syncState: SyncState;
  deleted?: boolean;
};

function withFirebaseTimeout<T>(operation: Promise<T>, message: string) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), FIREBASE_TIMEOUT_MS);
  });
  return Promise.race([operation, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function deferCloudSync(error: unknown, message: string) {
  // IndexedDB is the source of truth for this offline-first repository. Once a
  // local operation succeeds, a Firestore outage or rules/configuration issue
  // must not make the UI report that the user's change was lost. Pending rows
  // are retried the next time saved data is loaded.
  console.warn(message, error);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function userRows<T>(db: IDBDatabase, storeName: string, userId: string) {
  const transaction = db.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).index("by_user").getAll(userId);
  return requestResult(request) as Promise<T[]>;
}

async function putRow(db: IDBDatabase, storeName: string, row: unknown) {
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(row);
  await transactionDone(transaction);
}

async function deleteRow(
  db: IDBDatabase,
  storeName: string,
  userId: string,
  id: string,
) {
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete([userId, id]);
  await transactionDone(transaction);
}

async function replaceSyncedRows(
  db: IDBDatabase,
  storeName: string,
  userId: string,
  remoteRows: Array<CachedSavedItem | CachedTripPlan>,
) {
  const pending = (await userRows<CachedSavedItem | CachedTripPlan>(db, storeName, userId))
    .filter((row) => row.syncState === "pending");

  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const cursorRequest = store.index("by_user").openKeyCursor(IDBKeyRange.only(userId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
      return;
    }
    remoteRows.forEach((row) => store.put(row));
    pending.forEach((row) => store.put(row));
  };
  await transactionDone(transaction);
}

const migrationPromises = new Map<string, Promise<void>>();

function legacyRows<T>(db: IDBDatabase, storeName: string) {
  const transaction = db.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

function migrateLegacyData(db: IDBDatabase, userId: string) {
  const existing = migrationPromises.get(userId);
  if (existing) return existing;

  const migration = (async () => {
    const [legacySaved, legacyTrips] = await Promise.all([
      legacyRows<SavedItem>(db, "saved_items"),
      legacyRows<Array<Omit<TripPlan, "id"> & { id: number | string }>[number]>(db, "trip_plans"),
    ]);
    const transaction = db.transaction(
      ["app_settings", SAVED_STORE, TRIPS_STORE],
      "readwrite",
    );
    const settings = transaction.objectStore("app_settings");
    const ownerRequest = settings.get(LEGACY_OWNER_KEY);
    ownerRequest.onsuccess = () => {
      if (ownerRequest.result) return;

      const now = new Date().toISOString();
      const savedStore = transaction.objectStore(SAVED_STORE);
      const tripStore = transaction.objectStore(TRIPS_STORE);

      legacySaved.forEach((item) => savedStore.put({
        ...item,
        userId,
        updatedAt: item.createdAt || now,
        syncState: "pending",
      } satisfies CachedSavedItem));
      legacyTrips.forEach((plan) => tripStore.put({
        ...plan,
        id: String(plan.id).startsWith("legacy-") ? String(plan.id) : `legacy-${plan.id}`,
        userId,
        updatedAt: plan.createdAt || now,
        syncState: "pending",
      } satisfies CachedTripPlan));
      settings.put({ key: LEGACY_OWNER_KEY, value: userId });
    };

    await transactionDone(transaction);
  })().catch((error) => {
    migrationPromises.delete(userId);
    throw error;
  });

  migrationPromises.set(userId, migration);
  return migration;
}

function savedCollection(userId: string) {
  return collection(firestore, "users", userId, "savedPlaces");
}

function tripsCollection(userId: string) {
  return collection(firestore, "users", userId, "tripPlans");
}

function savedDocument(item: SavedItem) {
  return {
    title: item.title,
    subtitle: item.subtitle,
    kind: item.kind,
    imageKey: item.imageKey,
    createdAt: item.createdAt,
  };
}

function tripDocument(plan: TripPlan) {
  return {
    title: plan.title,
    preferences: plan.preferences,
    itinerary: plan.itinerary ?? [],
    createdAt: plan.createdAt,
  };
}

async function flushSavedRow(db: IDBDatabase, row: CachedSavedItem) {
  const reference = doc(savedCollection(row.userId), row.id);
  await withFirebaseTimeout(
    row.deleted ? deleteDoc(reference) : setDoc(reference, savedDocument(row)),
    "Saved-place sync timed out.",
  );
  if (row.deleted) await deleteRow(db, SAVED_STORE, row.userId, row.id);
  else await putRow(db, SAVED_STORE, { ...row, syncState: "synced" });
}

async function flushTripRow(db: IDBDatabase, row: CachedTripPlan) {
  const reference = doc(tripsCollection(row.userId), row.id);
  await withFirebaseTimeout(
    row.deleted ? deleteDoc(reference) : setDoc(reference, tripDocument(row)),
    "Trip-plan sync timed out.",
  );
  if (row.deleted) await deleteRow(db, TRIPS_STORE, row.userId, row.id);
  else await putRow(db, TRIPS_STORE, { ...row, syncState: "synced" });
}

async function tryFlush<T>(rows: T[], flush: (row: T) => Promise<void>) {
  await Promise.all(rows.map(async (row) => {
    try {
      await flush(row);
    } catch (error) {
      deferCloudSync(
        error,
        "[cloud-user-data] Cloud sync deferred; local data retained.",
      );
    }
  }));
}

export async function getSavedItems(
  db: IDBDatabase,
  userId: string,
  kind?: SavedKind,
): Promise<SavedItem[]> {
  await migrateLegacyData(db, userId);
  const cached = await userRows<CachedSavedItem>(db, SAVED_STORE, userId);
  await tryFlush(cached.filter((row) => row.syncState === "pending"), (row) => flushSavedRow(db, row));

  try {
    const snapshot = await withFirebaseTimeout(
      getDocs(savedCollection(userId)),
      "Saved places are taking too long to load.",
    );
    const remote = snapshot.docs.map((item) => ({
      ...(item.data() as Omit<SavedItem, "id">),
      id: item.id,
      userId,
      updatedAt: item.data().createdAt as string,
      syncState: "synced" as const,
    }));
    await replaceSyncedRows(db, SAVED_STORE, userId, remote);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Using cached saved places.");
  }

  return (await userRows<CachedSavedItem>(db, SAVED_STORE, userId))
    .filter((item) => !item.deleted && (!kind || item.kind === kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSavedIds(db: IDBDatabase, userId: string) {
  return new Set((await getSavedItems(db, userId)).map((item) => item.id));
}

export async function saveItem(
  db: IDBDatabase,
  userId: string,
  item: Omit<SavedItem, "createdAt">,
) {
  await migrateLegacyData(db, userId);
  const now = new Date().toISOString();
  const row: CachedSavedItem = {
    ...item,
    userId,
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };
  await putRow(db, SAVED_STORE, row);
  try {
    await flushSavedRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Saved place queued for sync.");
  }
}

export async function removeSavedItem(db: IDBDatabase, userId: string, id: string) {
  await migrateLegacyData(db, userId);
  const existing = (await userRows<CachedSavedItem>(db, SAVED_STORE, userId))
    .find((item) => item.id === id);
  if (!existing) return;
  const row: CachedSavedItem = {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
    syncState: "pending",
  };
  await putRow(db, SAVED_STORE, row);
  try {
    await flushSavedRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Saved-place removal queued for sync.");
  }
}

export async function getTripPlans(db: IDBDatabase, userId: string): Promise<TripPlan[]> {
  await migrateLegacyData(db, userId);
  const cached = await userRows<CachedTripPlan>(db, TRIPS_STORE, userId);
  await tryFlush(cached.filter((row) => row.syncState === "pending"), (row) => flushTripRow(db, row));

  try {
    const snapshot = await withFirebaseTimeout(
      getDocs(tripsCollection(userId)),
      "Trip plans are taking too long to load.",
    );
    const remote = snapshot.docs.map((item) => ({
      ...(item.data() as Omit<TripPlan, "id">),
      id: item.id,
      userId,
      updatedAt: item.data().createdAt as string,
      syncState: "synced" as const,
    }));
    await replaceSyncedRows(db, TRIPS_STORE, userId, remote);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Using cached trip plans.");
  }

  return (await userRows<CachedTripPlan>(db, TRIPS_STORE, userId))
    .filter((plan) => !plan.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTripPlan(
  db: IDBDatabase,
  userId: string,
  title: string,
  preferences: TripPlan["preferences"],
  itinerary: ItineraryDay[] = [],
) {
  await migrateLegacyData(db, userId);
  const now = new Date().toISOString();
  const row: CachedTripPlan = {
    id: globalThis.crypto?.randomUUID?.() ?? `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    title: title.trim(),
    preferences,
    itinerary,
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };
  await putRow(db, TRIPS_STORE, row);
  try {
    await flushTripRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Trip plan queued for sync.");
  }
  return row.id;
}

export async function deleteTripPlan(db: IDBDatabase, userId: string, id: string) {
  await migrateLegacyData(db, userId);
  const existing = (await userRows<CachedTripPlan>(db, TRIPS_STORE, userId))
    .find((plan) => plan.id === id);
  if (!existing) return;
  const row: CachedTripPlan = {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
    syncState: "pending",
  };
  await putRow(db, TRIPS_STORE, row);
  try {
    await flushTripRow(db, row);
  } catch (error) {
    deferCloudSync(error, "[cloud-user-data] Trip-plan removal queued for sync.");
  }
}
