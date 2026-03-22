import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import readingProgressRoutes from "./routes/readingProgress.js";
import libraryRoutes from "./routes/library.js";
import mangaRoutes from "./routes/manga.js";
import tagRoutes from "./routes/tags.js";
import uploadRoutes from "./routes/upload.js";



import { requireAuth } from "./middleware/authMiddleware.js";
import { ensureUser } from "./middleware/ensureUser.js";

import { startMetadataScheduler } from "./jobs/metadataScheduler.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ===============================
// Middleware
// ===============================

app.use(cors({
   origin: [
    "http://localhost:3000",
    "https://manga-tracker-lilac.vercel.app"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
// ===============================
// Routes
// ===============================
app.use("/api", readingProgressRoutes);
app.use("/api", libraryRoutes);
app.use("/api", mangaRoutes);
app.use("/api", tagRoutes);
app.use("/api/manga", mangaRoutes);
app.use("/api", uploadRoutes);


// ===============================
// Health Check
// ===============================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ===============================
// Protected Test Route
// ===============================
app.get("/api/protected", requireAuth, async (req, res) => {
  await ensureUser(req.user);
  res.json({ message: "Authenticated", user: req.user });
});

// ===============================
// Global Error Handler
// ===============================
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start daily metadata refresh job
  startMetadataScheduler();
});
