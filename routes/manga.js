import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { db } from "../db.js";

import {
  refreshMetadata,
  previewMetadata,
  normalizeProvider
} from "../services/metadataService.js";

import { fetchFromAniList } from "../services/providers/anilist.js";
import { fetchFromKitsu } from "../services/providers/kitsu.js";
import { fetchFromMangaDex } from "../services/providers/mangadex.js";
import { fetchFromMangaUpdates } from "../services/providers/mangaupdates.js";

const router = express.Router();

/* =================================
   HELPER: Ensure manga belongs to user
================================= */
async function checkOwnership(mangaId, userId) {
  const [rows] = await db.query(
    `
    SELECT 1
    FROM reading_progress
    WHERE manga_id = ? AND user_id = ?
    LIMIT 1
    `,
    [mangaId, userId]
  );

  return rows.length > 0;
}

/* =================================
   GET SINGLE MANGA (SECURE)
================================= */
router.get("/manga/:id", requireAuth, async (req, res) => {
  try {
    const mangaId = req.params.id;

    const owned = await checkOwnership(mangaId, req.user.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [rows] = await db.query(
      `
      SELECT 
        m.*,
        COALESCE(
          JSON_ARRAYAGG(mt.tag_id),
          JSON_ARRAY()
        ) AS tags
      FROM manga m
      LEFT JOIN manga_tags mt ON m.id = mt.manga_id
      WHERE m.id = ?
      GROUP BY m.id
      `,
      [mangaId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Manga not found" });
    }

    const manga = rows[0];

    if (manga.tags && manga.tags.length === 1 && manga.tags[0] === null) {
      manga.tags = [];
    }

    res.json(manga);

  } catch (err) {
    console.error("GET /manga/:id error:", err);
    res.status(500).json({ error: "Failed to fetch manga" });
  }
});

/* =================================
   PATCH MANUAL METADATA (SECURE)
================================= */
router.patch("/manga/:id", requireAuth, async (req, res) => {
  try {
    const mangaId = req.params.id;
    const updates = req.body;

    const owned = await checkOwnership(mangaId, req.user.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied" });
    }

    const fields = [];
    const values = [];

    const addField = (name, value) => {
      fields.push(`${name} = ?`);
      values.push(value);
    };

    // Basic validation
    if (updates.total_chapters && typeof updates.total_chapters !== "number") {
      return res.status(400).json({ error: "Invalid total chapters" });
    }

    if (updates.latest_chapter && typeof updates.latest_chapter !== "number") {
      return res.status(400).json({ error: "Invalid latest chapter" });
    }

    if (updates.description !== undefined)
      addField("description", updates.description);

    if (updates.release_date !== undefined)
      addField("release_date", updates.release_date);

    if (updates.total_chapters !== undefined)
      addField("total_chapters", updates.total_chapters);

    if (updates.latest_chapter !== undefined)
      addField("latest_chapter", updates.latest_chapter);

    if (updates.genres !== undefined)
      addField("genres", JSON.stringify(updates.genres));

    if (updates.other_names !== undefined)
      addField("other_names", JSON.stringify(updates.other_names));

    if (updates.images !== undefined)
      addField("images", JSON.stringify(updates.images));

    if (updates.cover_url !== undefined)
      addField("cover_url", updates.cover_url);

    if (updates.cover_delete_url !== undefined)
      addField("cover_delete_url", updates.cover_delete_url);

    if (!fields.length) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    fields.push("manual_override = TRUE");
    fields.push("metadata_updated_at = NOW()");

    const sql = `
      UPDATE manga
      SET ${fields.join(", ")}
      WHERE id = ?
    `;

    values.push(mangaId);

    await db.query(sql, values);

    res.json({ success: true });

  } catch (err) {
    console.error("PATCH /manga/:id error:", err);
    res.status(500).json({ error: "Failed to update metadata" });
  }
});

/* =================================
   REFRESH METADATA
================================= */
router.post("/manga/:id/refresh", requireAuth, async (req, res) => {
  try {
    const mangaId = req.params.id;

    const owned = await checkOwnership(mangaId, req.user.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied" });
    }

    const refreshed = await refreshMetadata(mangaId);

    res.json({ success: true, refreshed });

  } catch (err) {
    console.error("Metadata refresh error:", err);
    res.status(500).json({ error: "Metadata refresh failed" });
  }
});

/* =================================
   METADATA PREVIEW
================================= */
router.post("/preview", requireAuth, async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "Title required" });
    }

    const matches = await previewMetadata(title);

    res.json({ matches });

  } catch (err) {
    console.error("Preview error:", err);
    res.status(500).json({ error: "Preview failed" });
  }
});

/* =================================
   METADATA SOURCE COMPARISON
================================= */
router.get("/manga/:id/metadata-sources", requireAuth, async (req, res) => {
  try {
    const mangaId = req.params.id;

    const owned = await checkOwnership(mangaId, req.user.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [rows] = await db.query(
      "SELECT * FROM manga WHERE id = ? LIMIT 1",
      [mangaId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    const title = rows[0].title;

    const results = await Promise.allSettled([
      fetchFromAniList(title),
      fetchFromKitsu(title),
      fetchFromMangaDex(title),
      fetchFromMangaUpdates(title) 
    ]);

    const sources = {};

    results.forEach(r => {
      if (r.status === "fulfilled" && r.value) {
        const normalized = normalizeProvider(r.value);
        sources[normalized.source] = normalized;
      }
    });

    res.json({
      current: rows[0],
      sources
    });

  } catch (err) {
    console.error("Metadata comparison error:", err);
    res.status(500).json({ error: "Failed to fetch metadata sources" });
  }
});

/* =================================
   DELETE MANGA (SECURE)
================================= */
router.delete("/manga/:id", requireAuth, async (req, res) => {
  try {
    const mangaId = req.params.id;

    const owned = await checkOwnership(mangaId, req.user.id);
    if (!owned) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [rows] = await db.query(
      "SELECT cover_delete_url FROM manga WHERE id = ?",
      [mangaId]
    );

    if (rows.length && rows[0].cover_delete_url) {
      try {
        await fetch(rows[0].cover_delete_url);
      } catch (e) {
        console.warn("ImgBB deletion failed:", e);
      }
    }

    // Delete progress first
    await db.query(
      "DELETE FROM reading_progress WHERE manga_id = ? AND user_id = ?",
      [mangaId, req.user.id]
    );

    // Delete manga only if no one else uses it
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
    console.error("DELETE /manga/:id error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;