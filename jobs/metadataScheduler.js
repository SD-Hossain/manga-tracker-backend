import cron from "node-cron";
import { db } from "../db.js";
import { refreshMetadata } from "../services/metadataService.js";

/**
 * Starts daily metadata refresh scheduler
 * Runs at 6:00 AM Bangladesh time (Asia/Dhaka)
 */
export function startMetadataScheduler() {

  cron.schedule(
    "0 6 * * *", // 6:00 AM every day
    async () => {
      console.log("⏰ Metadata refresh job started (Asia/Dhaka)");

      try {
        // Only refresh manga that are stale
        const [mangaList] = await db.query(
          `
          SELECT id
          FROM manga
          WHERE metadata_updated_at IS NULL
             OR metadata_updated_at < NOW() - INTERVAL 1 DAY
          `
        );

        if (!mangaList.length) {
          console.log("ℹ️  No manga need metadata refresh today.");
          return;
        }

        console.log(`🔄 Refreshing ${mangaList.length} manga entries...`);

        for (const manga of mangaList) {
          try {
            await refreshMetadata(manga.id);
            console.log(`✅ Refreshed manga ID: ${manga.id}`);
          } catch (err) {
            console.error(
              `❌ Failed to refresh manga ID ${manga.id}:`,
              err.message
            );
          }
        }

        console.log("✅ Metadata refresh job completed.");

      } catch (err) {
        console.error("❌ Metadata scheduler failed:", err);
      }
    },
    {
      timezone: "Asia/Dhaka"
    }
  );

  console.log("🕕 Metadata scheduler registered (6 AM Asia/Dhaka)");
}
