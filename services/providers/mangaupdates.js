//services/providers/mangaupdates.js

export async function fetchFromMangaUpdates(title) {
  try {
    // 🔍 STEP 1 — Search via API
    const searchRes = await fetch('https://api.mangaupdates.com/v1/series/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Searching for the exact title
      body: JSON.stringify({ search: title }) 
    });

    const searchData = await searchRes.json();

    // If no results are found, return null
    if (!searchData.results || searchData.results.length === 0) {
      return null;
    }

    // Get the ID of the top search result
    const seriesId = searchData.results[0].record.series_id;

    // 🔍 STEP 2 — Fetch specific series details via API
    const detailsRes = await fetch(`https://api.mangaupdates.com/v1/series/${seriesId}`);
    const details = await detailsRes.json();

    // ===============================
    // RETURN NORMALIZED DATA
    // ===============================
    
    let releaseDate = null;
    if (details.year && /^\d{4}$/.test(details.year)) {
      releaseDate = `${details.year}-01-01`;
    }

    return {
      title: details.title,
      // The API returns the description cleanly, no need to strip HTML manually
      description: details.description, 
      // The API often provides a high-res cover image url
      coverUrl: details.image?.url?.original || null, 
      // Map the genre objects to a simple array of strings
      genres: details.genres ? details.genres.map(g => g.genre) : [],
      status: details.status,
      releaseDate: releaseDate,
      totalChapters: null,
      latestChapter: null,
      images: [],

      source: "MangaUpdates" 
    };

  } catch (error) {
    console.error("Error fetching from MangaUpdates API:", error);
    return null;
  }
}