import { db } from "../db.js";
import { fetchFromAniList } from "./providers/anilist.js";
import { fetchFromKitsu } from "./providers/kitsu.js";
import { fetchFromMangaDex } from "./providers/mangadex.js";


/* =========================================================
   Ranking System
========================================================= */

function normalize(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(query, candidate) {
  const q = normalize(query);
  const t = normalize(candidate.title || "");

  let score = 0;

  if (!t) return -100;

  if (t === q) score += 50;
  if (t.startsWith(q)) score += 30;
  if (t.includes(q)) score += 20;

  // Penalize adult / hentai / doujin
  const lowerGenres = (candidate.genres || []).map(g => g.toLowerCase());

  if (lowerGenres.includes("hentai")) score -= 50;
  if (lowerGenres.includes("doujinshi")) score -= 40;

  // Prefer common formats
  if (
    lowerGenres.includes("manhwa") ||
    lowerGenres.includes("manga") ||
    lowerGenres.includes("manhua")
  ) score += 10;

  return score;
}



/* =========================================================
   TITLE NORMALIZATION
========================================================= */

function normalizeTitle(title) {
  return title
    .replace(/chapter\s*\d+/gi, "")
    .replace(/all chapters/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function generateUniqueTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/* =========================================================
   METADATA AGGREGATION
========================================================= */

async function fetchMetadataFromProviders(originalTitle) {
  const cleaned = normalizeTitle(originalTitle);

  const results = await Promise.allSettled([
    fetchFromAniList(cleaned),
    fetchFromKitsu(cleaned),
    fetchFromMangaDex(cleaned)
  ]);

  const valid = results
    .filter(r => r.status === "fulfilled" && r.value)
    .map(r => normalizeProvider(r.value));

  if (!valid.length) return null;

  return mergeMetadata(valid);
}

export function normalizeProvider(raw) {
  return {
    title: raw.title ?? null,
    coverUrl: raw.coverUrl ?? null,
    description: raw.description ?? null,
    releaseDate: raw.releaseDate ?? null,
    totalChapters: raw.totalChapters ?? null,
    latestChapter: raw.latestChapter ?? null,
    genres: Array.isArray(raw.genres) ? raw.genres : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    source: raw.source ?? "Unknown"
  };
}

function mergeMetadata(results) {
  const findAniList = results.find(r =>
    r.source.includes("AniList")
  );


  const pick = (field) => {
    for (const r of results) {
      if (r[field] !== null && r[field] !== undefined) {
        return r[field];
      }
    }
    return null;
  };

  const pickPreferred = (field) => {
    if (findAniList && findAniList[field]) {
      return findAniList[field];
    }
    return pick(field);
  };

  const mergedGenres = [
    ...new Set(
      results.flatMap(r => r.genres || [])
    )
  ];

  const pickTitle = () => {
  for (const r of results) {
    if (r.title) return r.title;
  }
  return null;
};

  const mergedImages = [
    ...new Set(
      results.flatMap(r => r.images || [])
    )
  ];

  return {
    title: pickTitle(), 
    coverUrl: pick("coverUrl"),
    description: pick("description"),
    releaseDate: pick("releaseDate"),
    totalChapters: pickPreferred("totalChapters"),
    latestChapter: pickPreferred("latestChapter"),
    genres: mergedGenres,
    images: mergedImages,
    source: results.map(r => r.source).join(", ")
  };
}

/* =========================================================
   PUBLIC FUNCTIONS
========================================================= */

export async function fetchAndStoreMetadata(title) {
  const metadata = await fetchMetadataFromProviders(title);
  if (!metadata) return null;
  // FIX release date
let fixedDate = null;

if (metadata.releaseDate) {
  const str = String(metadata.releaseDate);

  if (str.length === 4) {
    fixedDate = `${str}-01-01`;
  } else {
    fixedDate = str;
  }
}
  const [result] = await db.query(
    `
    INSERT INTO manga (
      title,
      cover_url,
      description,
      release_date,
      total_chapters,
      latest_chapter,
      genres,
      images,
      source_api,
      metadata_updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      metadata.title || title,
      metadata.coverUrl,
      metadata.description,
      fixedDate,
      metadata.totalChapters,
      metadata.latestChapter,
      JSON.stringify(metadata.genres || []),
      JSON.stringify(metadata.images || []),
      metadata.source
    ]
  );

  return result.insertId;
}

export async function getOrCreateManga(title) {
  // 1️⃣ Check if manga already exists
  const [existing] = await db.query(
    "SELECT id FROM manga WHERE title = ? LIMIT 1",
    [title]
  );

  if (existing.length > 0) {
    return existing[0].id;
  }

  try {
    // 2️⃣ Try inserting new metadata
    return await fetchAndStoreMetadata(title);

  } catch (err) {

    // 3️⃣ If duplicate error, fetch existing again
    if (err.code === "ER_DUP_ENTRY") {
      const [row] = await db.query(
        "SELECT id FROM manga WHERE title = ? LIMIT 1",
        [title]
      );

      if (row.length > 0) {
        return row[0].id;
      }
    }

    // 4️⃣ Otherwise rethrow
    throw err;
  }
}



export async function refreshMetadata(mangaId) {

  try {

    const [rows] = await db.query(
      `SELECT id, title, total_chapters, latest_chapter FROM manga WHERE id = ?`,
      [mangaId]
    );

    if (!rows.length) {
      throw new Error("Manga not found");
    }

    const manga = rows[0];

    console.log("Refreshing:", manga.title);

    /* -----------------------------
       Get provider metadata
    ----------------------------- */

    const providerData = await fetchMetadataFromProviders(manga.title);

    if (!providerData) {
      console.log("No provider metadata found");
      return;
    }

    const providerTotal = providerData.totalChapters;
    const providerLatest = providerData.latestChapter;

    const currentTotal = manga.total_chapters || 0;
    const currentLatest = manga.latest_chapter || 0;

    const updates = {};
    const values = [];

    /* -----------------------------
       TOTAL CHAPTERS
    ----------------------------- */

    if (providerTotal && providerTotal > currentTotal) {

      updates.total_chapters = providerTotal;

      console.log(
        `Total chapters updated: ${currentTotal} → ${providerTotal}`
      );

    }

    /* -----------------------------
       LATEST CHAPTER
    ----------------------------- */

    if (providerLatest && providerLatest > currentLatest) {

      updates.latest_chapter = providerLatest;

      console.log(
        `Latest chapter updated: ${currentLatest} → ${providerLatest}`
      );

    }

    /* -----------------------------
       APPLY UPDATE
    ----------------------------- */

    const keys = Object.keys(updates);

    if (keys.length === 0) {
      console.log("No chapter updates needed");
      return;
    }

    const fields = keys.map(k => `${k} = ?`).join(", ");
    values.push(...keys.map(k => updates[k]));
    values.push(manga.id);

    await db.query(
      `UPDATE manga SET ${fields} WHERE id = ?`,
      values
    );

    console.log("Chapter metadata updated");

  } catch (err) {

    console.error("Metadata refresh error:", err);
    throw err;

  }

}


export async function previewMetadata(title) {
  const cleaned = normalizeTitle(title);

  const results = await Promise.allSettled([
    fetchFromAniList(cleaned),
    fetchFromKitsu(cleaned),
    fetchFromMangaDex(cleaned)
  ]);

  const valid = results
    .filter(r => r.status === "fulfilled" && r.value)
    .map(r => normalizeProvider(r.value));

  if (!valid.length) return [];

  const scored = valid
    .map(r => ({
      ...r,
      score: scoreMatch(title, r)
    }))
    .sort((a, b) => b.score - a.score);

  return scored;
}

export async function getOrCreateFromMetadata(metadata) {
  const [existing] = await db.query(
    "SELECT id FROM manga WHERE title = ? LIMIT 1",
    [metadata.title]
  );

  if (existing.length) return existing[0].id;
  // FIX release date
let fixedDate = null;

if (metadata.releaseDate) {
  const str = String(metadata.releaseDate);

  if (str.length === 4) {
    fixedDate = `${str}-01-01`;
  } else {
    fixedDate = str;
  }
}

  const [result] = await db.query(
    `
    INSERT INTO manga (
      title,
      cover_url,
      description,
      release_date,
      total_chapters,
      latest_chapter,
      genres,
      images,
      source_api,
      base_source,
      metadata_updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      metadata.title,
      metadata.coverUrl,
      metadata.description,
      fixedDate,
      metadata.totalChapters,
      metadata.latestChapter,
      JSON.stringify(metadata.genres || []),
      JSON.stringify(metadata.images || []),
      metadata.source,
      metadata.source 
    ]
  );

  return result.insertId;
}
