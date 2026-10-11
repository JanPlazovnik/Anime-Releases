export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { syncAll } = await import("./lib/sync");
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 6);
  const sync = () => syncAll().catch((err) => console.error("Sync failed:", err));

  sync();
  setInterval(sync, hours * 60 * 60 * 1000);
}
