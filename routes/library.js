import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { ensureUser } from "../middleware/ensureUser.js";
import { db } from "../db.js";

const router = express.Router();

/**
 * GET full user library
 * Returns progress + essential manga metadata
 */
router.get("/library", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user);

    const [rows] = await db.query(
      `
      SELECT
  rp.id AS progress_id,
  rp.manga_id,
  rp.last_chapter,
  rp.redirect_url,
  rp.last_read_at,
  rp.status,

  m.title,
  m.cover_url,
  m.description,
  m.other_names,
  m.total_chapters,
  m.latest_chapter,
  m.genres,
  m.source_api,
  m.manual_override,
  m.metadata_updated_at,

  (
    SELECT COALESCE(JSON_ARRAYAGG(tag_id), JSON_ARRAY())
    FROM manga_tags
    WHERE manga_id = m.id
  ) AS tags

FROM reading_progress rp
JOIN manga m ON m.id = rp.manga_id

WHERE rp.user_id = ?

ORDER BY rp.last_read_at DESC

    `,
      [req.user.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("GET /library error:", err);
    res.status(500).json({ error: "Failed to load library" });
  }
});

export default router;
