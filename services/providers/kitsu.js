// services/providers/kitsu.js

export async function fetchFromKitsu(title) {
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(title)}`
    );

    const json = await res.json();
    if (!json.data?.length) return null;

    const m = json.data[0].attributes;

   return {
  title: m.canonicalTitle ?? null,
  coverUrl: m.posterImage?.large ?? null,
  description: m.synopsis ?? null,
  releaseDate: m.startDate ?? null,
  totalChapters: m.chapterCount ?? null,
  latestChapter: m.chapterCount ?? null,
  genres: m.subtype ? [m.subtype] : [],
  images: [],
  source: "Kitsu"
};


  } catch (err) {
    console.log("Kitsu error:", err.message);
    return null;
  }
}
