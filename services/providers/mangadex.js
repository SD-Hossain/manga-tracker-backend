// services/providers/mangadex.js

export async function fetchFromMangaDex(title) {
  try {
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&includes[]=cover_art&order[relevance]=desc`
    );

    const json = await res.json();

    if (!json.data || json.data.length === 0) return null;

    const manga = json.data[0];
    const attributes = manga.attributes;

    // ===============================
    // Title
    // ===============================
    const titleText =
      attributes.title?.en ||
      Object.values(attributes.title || {})[0] ||
      "Unknown Title";

    // ===============================
    // Description
    // ===============================
    const description =
      attributes.description?.en ||
      Object.values(attributes.description || {})[0] ||
      "No description available.";

    // ===============================
    // Cover Image (PROXY VERSION)
    // ===============================
    let coverUrl = null;

    const coverArt = manga.relationships?.find(
      (r) => r.type === "cover_art"
    );

    const fileName = coverArt?.attributes?.fileName;

    const API_BASE = "https://manga-tracker-backend-pqmw.onrender.com/api";

    if (fileName) {
      const originalUrl = `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`;

      coverUrl = `${API_BASE}/mangadex-cover?url=${encodeURIComponent(originalUrl)}`;
    }
    // ===============================
    // Genres
    // ===============================
    const genres =
      attributes.tags
        ?.map((tag) => tag.attributes?.name?.en)
        .filter(Boolean) || [];

    // ===============================
    // Release Date
    // ===============================
    const releaseDate = attributes.year
      ? `${attributes.year}-01-01`
      : null;

    // ===============================
    // Chapters
    // ===============================
    const totalChapters = attributes.lastChapter || null;

    // ===============================
    // Return Final Object
    // ===============================
    return {
      title: titleText,
      coverUrl,
      description,
      releaseDate,
      totalChapters,
      latestChapter: null,
      genres,
      images: [],
      source: "MangaDex"
    };

  } catch (err) {
    console.error("MangaDex fetch error:", err);
    return null;
  }
}