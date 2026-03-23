//services/providers/mangaupdates.js

import fetch from "node-fetch";

/* ===============================
   HELPERS
=============================== */

// Clean HTML tags
function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Extract first match
function extract(html, regex) {
  const match = html.match(regex);
  return match ? stripHtml(match[1]) : null;
}

// Safe decode
function safeDecode(text) {
  if (!text) return text;
  try {
    if (text.includes("%")) {
      return decodeURIComponent(text);
    }
    return text;
  } catch {
    return text;
  }
}

/* ===============================
   MAIN FUNCTION
=============================== */

export async function fetchFromMangaUpdates(title) {
  try {
    // 🔍 STEP 1 — Search
    const searchUrl = `https://www.mangaupdates.com/search.html?search=${encodeURIComponent(title)}`;

    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await res.text();

    // 🔍 STEP 2 — Find best match link
    const linkMatch = html.match(/<a href="(\/series\.html\?id=\d+)"/);

    if (!linkMatch) return null;

    const seriesUrl = `https://www.mangaupdates.com${linkMatch[1]}`;

    // 🔍 STEP 3 — Fetch series page
    const seriesRes = await fetch(seriesUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const seriesHtml = await seriesRes.text();

    // ===============================
    // EXTRACT DATA
    // ===============================

    // Title
    const titleText =
      extract(seriesHtml, /<span class="releasestitle">(.*?)<\/span>/) ||
      title;

    // Description
    let description = extract(seriesHtml, /<div class="sContent">(.*?)<\/div>/);

    description = safeDecode(description);

    // Genres (multiple)
    const genreMatches = [...seriesHtml.matchAll(/genre\.php\?gid=\d+">(.*?)<\/a>/g)];
    const genres = genreMatches.map(g => stripHtml(g[1]));

    // Status
    const status = extract(seriesHtml, /Status in Country of Origin<\/div>\s*<div class="sContent">(.*?)<\/div>/);

    // Year
    const year = extract(seriesHtml, /Year<\/div>\s*<div class="sContent">(.*?)<\/div>/);

    let releaseDate = null;
    if (year && /^\d{4}$/.test(year)) {
      releaseDate = `${year}-01-01`;
    }

    // ===============================
    // RETURN NORMALIZED DATA
    // ===============================

    return {
      title: titleText,
      description,
      coverUrl: null, // MangaUpdates doesn't give easy cover
      releaseDate,
      totalChapters: null,
      latestChapter: null,
      genres,
      images: [],
      source: "MangaUpdates",
      status // optional extra info
    };

  } catch (err) {
    console.error("MangaUpdates error:", err);
    return null;
  }
}