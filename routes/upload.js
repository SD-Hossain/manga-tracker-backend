import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/upload", requireAuth, async (req, res) => {
  try {
    const { image } = req.body;

    // ✅ validation
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Invalid image data" });
    }

    // ✅ size limit (~5MB base64)
    if (image.length > 7_000_000) {
      return res.status(400).json({ error: "Image too large" });
    }

    const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

    if (!IMGBB_API_KEY) {
      console.error("Missing IMGBB_API_KEY");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      {
        method: "POST",
        body: new URLSearchParams({ image })
      }
    );

    const data = await response.json();

    if (!data.success) {
      console.error("IMGBB ERROR:", data);
      return res.status(500).json({ error: "Upload failed" });
    }

    res.json({
      success: true,
      data: {
        url: data.data.url,
        delete_url: data.data.delete_url
      }
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;