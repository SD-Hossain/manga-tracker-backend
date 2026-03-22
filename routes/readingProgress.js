import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { ensureUser } from "../middleware/ensureUser.js";
import { db } from "../db.js";
import { getOrCreateManga, getOrCreateFromMetadata } from "../services/metadataService.js";

const router = express.Router();

/* =================================
   CREATE / UPDATE PROGRESS
================================= */
router.post("/reading-progress", requireAuth, async (req, res) => {
  try {
    const { title, lastChapter, redirectUrl, metadata } = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "Title is required" });
    }

    const chapterNumber = parseInt(lastChapter);
    if (isNaN(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ error: "Invalid chapter number" });
    }

    await ensureUser(req.user);

    let mangaId;

    if (metadata) {
      mangaId = await getOrCreateFromMetadata(metadata);
    } else {
      mangaId = await getOrCreateManga(title);
    }

    if (!mangaId) {
      return res.status(400).json({ error: "Failed to create manga" });
    }

    await db.query(
      `
      INSERT INTO reading_progress
        (user_id, manga_id, last_chapter, redirect_url, last_read_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        last_chapter = VALUES(last_chapter),
        redirect_url = VALUES(redirect_url),
        last_read_at = NOW()
      `,
      [
        req.user.id,
        mangaId,
        chapterNumber,
        redirectUrl || null
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("POST reading-progress error:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
});

/* =================================
   GET SINGLE PROGRESS
================================= */
router.get("/reading-progress/:id", requireAuth, async (req, res) => {
  try {
    const progressId = req.params.id;

    const [rows] = await db.query(
      `
      SELECT *
      FROM reading_progress
      WHERE id = ? AND user_id = ?
      `,
      [progressId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("GET reading-progress error:", err);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

/* =================================
   UPDATE PROGRESS
================================= */
router.patch("/reading-progress/:id", requireAuth, async (req, res) => {
  try {
    const progressId = req.params.id;
    const { chapter, redirectUrl } = req.body;

    let chapterNumber = null;

    if (chapter !== undefined) {
      chapterNumber = parseInt(chapter);

      if (isNaN(chapterNumber) || chapterNumber < 1) {
        return res.status(400).json({ error: "Invalid chapter number" });
      }
    }

    const [rows] = await db.query(
      `
      SELECT id
      FROM reading_progress
      WHERE id = ? AND user_id = ?
      `,
      [progressId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    const fields = [];
    const values = [];

    if (chapterNumber !== null) {
      fields.push("last_chapter = ?");
      values.push(chapterNumber);
    }

    if (redirectUrl !== undefined) {
      fields.push("redirect_url = ?");
      values.push(redirectUrl || null);
    }

    fields.push("last_read_at = NOW()");

    await db.query(
      `
      UPDATE reading_progress
      SET ${fields.join(", ")}
      WHERE id = ? AND user_id = ?
      `,
      [...values, progressId, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("PATCH reading-progress error:", err);
    res.status(500).json({ error: "Failed to update progress" });
  }
});

/* =================================
   DELETE PROGRESS + SAFE MANGA DELETE
================================= */
router.delete("/reading-progress/:id", requireAuth, async (req, res) => {
  try {
    const progressId = req.params.id;

    const [rows] = await db.query(
      "SELECT manga_id FROM reading_progress WHERE id = ? AND user_id = ?",
      [progressId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    const mangaId = rows[0].manga_id;

    // delete only this user's progress
    await db.query(
      "DELETE FROM reading_progress WHERE id = ? AND user_id = ?",
      [progressId, req.user.id]
    );

    // delete manga ONLY if no one else uses it
    await db.query(
      `
      DELETE FROM manga
      WHERE id = ?
      AND NOT EXISTS (
        SELECT 1 FROM reading_progress WHERE manga_id = ?
      )
      `,
      [mangaId, mangaId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE reading-progress error:", err);
    res.status(500).json({ error: "Failed to delete manga" });
  }
});

/* =================================
   UPDATE STATUS
================================= */
router.patch("/reading-progress/:id/status", requireAuth, async (req, res) => {
  try {
    const progressId = req.params.id;
    const { status } = req.body;

    const allowed = [
      "reading",
      "completed",
      "dropped",
      "on_hold",
      "plan_to_read"
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await db.query(
      `
      UPDATE reading_progress
      SET status = ?
      WHERE id = ? AND user_id = ?
      `,
      [status, progressId, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;