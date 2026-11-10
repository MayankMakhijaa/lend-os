// Runs once when the server starts. Brings the database schema up to date on hosts that start the app
// without `prisma migrate deploy` (see src/lib/schema-bootstrap.ts).
export async function register() {
  // Keep this as a positive check: it lets the bundler drop the Node-only import from the edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureSchema } = await import("@/lib/schema-bootstrap");
      await ensureSchema();
    } catch (e) {
      console.error("[schema] could not verify the database schema on startup:", (e as Error).message);
    }
  }
}
