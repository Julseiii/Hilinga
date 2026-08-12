import { createContext, PropsWithChildren, use, useEffect, useState } from "react";
import { getDB, migrateDatabase } from "@/lib/database";

const DatabaseContext = createContext<IDBDatabase | null>(null);

export function DatabaseProvider({ children }: PropsWithChildren) {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDB()
      .then(async (database) => {
        await migrateDatabase(database);
        if (!cancelled) setDb(database);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Database failed to open.");
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", padding: 20, fontFamily: "Inter, system-ui, sans-serif" }}>
        <p style={{ color: "#B73A32" }}>Database error: {error}</p>
      </div>
    );
  }

  if (!db) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div className="spinner" />
        <p style={{ color: "#526159" }}>Loading…</p>
      </div>
    );
  }

  return <DatabaseContext value={db}>{children}</DatabaseContext>;
}

export function useDatabase() {
  const context = use(DatabaseContext);
  if (!context) throw new Error("useDatabase must be used inside DatabaseProvider.");
  return context;
}
