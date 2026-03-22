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
    const desc = attributes.description?.en ?? "No description available.";

    const coverArt = manga.relationships.find(r => r.type === "cover_art");
    const fileName = coverArt?.attributes?.fileName;
    
    let coverDataUri = null;

    if (fileName) {
      // 1. Target the smaller file size to keep the Base64 payload light
      const coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg`;
      
      try {
        // 2. Fetch the image server-side
        const imageRes = await fetch(coverUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        
        // 3. Convert to Base64 Data URI
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        coverDataUri = `data:image/jpeg;base64,${base64}`;
      } catch (imgErr) {
        console.error("Failed to convert cover to Base64:", imgErr);
        // Fallback to the raw URL just in case the buffer fails
        coverDataUri = coverUrl; 
      }
    }

    const genres = attributes.tags
      ?.map(tag => tag.attributes?.name?.en)
      .filter(Boolean) || [];

    return {
      title: attributes.title?.en || Object.values(attributes.title || {})[0] || "Unknown Title",
      coverUrl: coverDataUri, // 4. Return the Base64 string instead of the raw URL
      description: desc,
      releaseDate: attributes.year || null,
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