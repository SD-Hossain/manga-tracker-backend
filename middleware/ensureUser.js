import { db } from "../db.js";

const SYSTEM_TAGS = [
  { name: "Reading", color: "#3b82f6" },
  { name: "Completed", color: "#22c55e" },
  { name: "Dropped", color: "#ef4444" },
  { name: "On Hold", color: "#f59e0b" }
];

export async function ensureUser(user) {
  if (!user || !user.id) {
    throw new Error("ensureUser called without valid user");
  }

  try {
    // 1️⃣ Ensure user exists
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ?",
      [user.id]
    );

    if (rows.length === 0) {
      await db.query(
        "INSERT INTO users (id, email) VALUES (?, ?)",
        [user.id, user.email]
      );
    }

    // 2️⃣ Ensure system tags exist (🔥 NEW FIX)
    const [existingTags] = await db.query(
      `
      SELECT name FROM tags
      WHERE user_id = ? AND is_system = TRUE
      `,
      [user.id]
    );

    const existingNames = existingTags.map(t => t.name);

    for (const tag of SYSTEM_TAGS) {
      if (!existingNames.includes(tag.name)) {
        await db.query(
          `INSERT INTO tags (user_id, name, color, is_system)
           VALUES (?, ?, ?, TRUE)`,
          [user.id, tag.name, tag.color]
        );
      }
    }

  } catch (err) {
    console.error("ensureUser failed:", err);
    throw err;
  }
}