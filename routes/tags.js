import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { ensureUser } from "../middleware/ensureUser.js";
import { db } from "../db.js";

const router = express.Router();

/* =================================
   HELPER: Check manga ownership
================================= */
async function ownsManga(mangaId, userId) {
  const [rows] = await db.query(
    `
    SELECT 1 FROM reading_progress
    WHERE manga_id = ? AND user_id = ?
    LIMIT 1
    `,
    [mangaId, userId]
  );
  return rows.length > 0;
}

/* =================================
   GET ALL TAGS
================================= */
router.get("/tags", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user);

    const [rows] = await db.query(
      `
      SELECT id, name, color, is_system
      FROM tags
      WHERE user_id = ?
      ORDER BY is_system DESC, name ASC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /tags error:", err);
    res.status(500).json({ error: "Failed to load tags" });
  }
});

/* =================================
   CREATE TAG
================================= */
router.post("/tags", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user);

    let { name, color } = req.body;

    if (!name || !color) {
      return res.status(400).json({ error: "Name and color required" });
    }

    name = name.trim();

    // ✅ validation
    if (name.length > 30) {
      return res.status(400).json({ error: "Tag too long" });
    }

    if (!/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
      return res.status(400).json({ error: "Invalid color format" });
    }

    const [result] = await db.query(
      `
      INSERT INTO tags (user_id, name, color, is_system)
      VALUES (?, ?, ?, FALSE)
      `,
      [req.user.id, name, color]
    );

    res.json({
      id: result.insertId,
      name,
      color,
      is_system: false
    });

  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Tag already exists" });
    }

    console.error("POST /tags error:", err);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

/* =================================
   UPDATE TAG
================================= */
router.patch("/tags/:id", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user);

    const tagId = req.params.id;
    const { name, color } = req.body;

    const [existing] = await db.query(
      "SELECT * FROM tags WHERE id = ? AND user_id = ?",
      [tagId, req.user.id]
    );

    if (!existing.length) {
      return res.status(404).json({ error: "Tag not found" });
    }

    let updatedName = name?.trim() || existing[0].name;
    let updatedColor = color || existing[0].color;

    // ✅ validation
    if (updatedName.length > 30) {
      return res.status(400).json({ error: "Tag too long" });
    }

    if (!/^#([0-9A-F]{3}){1,2}$/i.test(updatedColor)) {
      return res.status(400).json({ error: "Invalid color format" });
    }

    await db.query(
      `
      UPDATE tags
      SET name = ?, color = ?
      WHERE id = ? AND user_id = ?
      `,
      [updatedName, updatedColor, tagId, req.user.id]
    );

    res.json({
      id: tagId,
      name: updatedName,
      color: updatedColor
    });

  } catch (err) {
    console.error("PATCH /tags/:id error:", err);
    res.status(500).json({ error: "Failed to update tag" });
  }
});

/* =================================
   DELETE TAG
================================= */
router.delete("/tags/:id", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user);

    const tagId = req.params.id;

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [existing] = await conn.query(
        "SELECT * FROM tags WHERE id = ? AND user_id = ?",
        [tagId, req.user.id]
      );

      if (!existing.length) {
        await conn.rollback();
        return res.status(404).json({ error: "Tag not found" });
      }

      await conn.query(
        "DELETE FROM manga_tags WHERE tag_id = ?",
        [tagId]
      );

      await conn.query(
        "DELETE FROM tags WHERE id = ?",
        [tagId]
      );

      await conn.commit();

      res.json({ success: true });

    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

  } catch (err) {
    console.error("DELETE /tags/:id error:", err);
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

/* =================================
   UPDATE MANGA TAGS (SECURE)
================================= */
router.patch("/manga/:id/tags", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user);

    const mangaId = req.params.id;
    const { tagIds } = req.body;

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: "tagIds must be an array" });
    }

    // 🔥 CRITICAL: ownership check
    const owns = await ownsManga(mangaId, req.user.id);
    if (!owns) {
      return res.status(403).json({ error: "Access denied" });
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      await conn.query(
        "DELETE FROM manga_tags WHERE manga_id = ?",
        [mangaId]
      );

      for (const tagId of tagIds) {
        await conn.query(
          `
          INSERT INTO manga_tags (manga_id, tag_id)
          SELECT ?, id
          FROM tags
          WHERE id = ? AND user_id = ?
          `,
          [mangaId, tagId, req.user.id]
        );
      }

      await conn.commit();

    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ success: true });

  } catch (err) {
    console.error("PATCH /manga/:id/tags error:", err);
    res.status(500).json({ error: "Failed to update manga tags" });
  }
});

export default router;