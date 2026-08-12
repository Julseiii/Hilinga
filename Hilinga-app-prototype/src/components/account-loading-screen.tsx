export function AccountLoadingScreen({ label = "Loading your account…" }: { label?: string }) {
  return (
    <div className="loading-root">
      <div className="spinner" />
      <p style={{ color: "#526159", fontSize: 15 }}>{label}</p>
    </div>
  );
}
