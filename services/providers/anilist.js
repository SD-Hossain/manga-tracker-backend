export async function fetchFromAniList(title) {
  const query = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: MANGA) {
          title {
            romaji
            english
            native
          }
          description(asHtml: false)
          chapters
          genres
          coverImage {
            large
          }
          startDate {
            year
            month
            day
          }
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { search: title }
    })
  });

  const data = await response.json();
  const mediaList = data?.data?.Page?.media;

  if (!mediaList || !mediaList.length) return null;

  // Pick best match by title similarity
  function clean(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const cleanedSearch = clean(title);

let best = mediaList.find(m => {
  const romaji = clean(m.title.romaji || "");
  const english = clean(m.title.english || "");
  return romaji.includes(cleanedSearch) || english.includes(cleanedSearch);
});

if (!best) best = mediaList[0];


 return {
  title: best.title?.english || best.title?.romaji || best.title?.native || null,
  coverUrl: best.coverImage?.large ?? null,
  description: best.description ?? null,
  releaseDate: best.startDate?.year
    ? `${best.startDate.year}-${best.startDate.month || "01"}-${best.startDate.day || "01"}`
    : null,
  totalChapters: best.chapters ?? null,
  latestChapter: best.chapters ?? null,
  genres: best.genres ?? [],
  images: [],
  source: "AniList"
};

}
