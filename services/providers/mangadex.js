// services/providers/mangadex.js

export async function fetchFromMangaDex(title) {
  try {
    // 1. Added order[relevance]=desc to get the best match first
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&includes[]=cover_art&order[relevance]=desc`
    );

    const json = await res.json();
    
    // Check if we actually got data back
    if (!json.data || json.data.length === 0) return null;

    const manga = json.data[0];
    const attributes = manga.attributes;

    // 2. Extract description (prioritizing English)
    const desc = attributes.description?.en ?? "No description available.";

    // 3. Extract Cover Art (using the relationship data we included)
    const coverArt = manga.relationships.find(r => r.type === "cover_art");
    const fileName = coverArt?.attributes?.fileName;
    const coverUrl = fileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`
      : null;

    // 4. Extract Genres (Tags)
    const genres = attributes.tags
      ?.map(tag => tag.attributes?.name?.en)
      .filter(Boolean) || [];

    return {
      title: attributes.title?.en || Object.values(attributes.title || {})[0] || "Unknown Title",
      coverUrl,
      description: desc,
      releaseDate: attributes.year || null, // Added year while we're at it
      totalChapters: attributes.lastChapter || null,
      latestChapter: null,
      genres: genres,
      images: [],
      source: "MangaDex"
    };

  } catch (err) {
    console.error("MangaDex fetch error:", err);
    return null;
  }
}