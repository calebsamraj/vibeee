/**
 * Music Search Utility using iTunes & Deezer Search APIs.
 * Provides public, keyless access to song preview URLs and official artwork.
 * Uses JSONP to bypass CORS and Cross-Site Tracking Prevention on mobile iOS Safari and Android.
 *
 * Responsibilities:
 *  - Search real tracks via iTunes (primary) / Deezer (fallback)
 *  - Verify that the returned track is actually the requested song (not a
 *    remix / cover / karaoke / unrelated track)
 *  - Verify the release year against the requested era/current-year rule
 *    whenever the provider gives us a release date
 *  - Guarantee that anything returned to the caller has a real, playable
 *    `previewUrl` -- AI-generated metadata (release dates, artwork, etc.)
 *    is never trusted, only provider metadata is.
 */

// ---------------------------------------------------------------------------
// Low level JSONP transport (bypasses CORS on iTunes/Deezer public endpoints)
// ---------------------------------------------------------------------------
function jsonpFetch(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'music_jsonp_' + Math.round(100000 * Math.random());
    let timeoutId;

    window[callbackName] = (data) => {
      clearTimeout(timeoutId);
      cleanup();
      resolve(data);
    };

    const script = document.createElement('script');
    script.src = `${url}&callback=${callbackName}`;
    script.async = true;

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Script loading error"));
    };

    // Timeout fallback (6 seconds)
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Request timeout"));
    }, 6000);

    // Mount to document head for priority loading in WebKit
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Era / release-year helpers
// ---------------------------------------------------------------------------
export function getCurrentYear() {
  return new Date().getFullYear();
}

// Returns [minYear, maxYear] (inclusive) for a given era key, or null if the
// era is unknown / not applicable (e.g. English & Hindi are not era-locked).
export function getEraRange(era, currentYear = getCurrentYear()) {
  switch (era) {
    case 'latest':
      return [currentYear, currentYear];
    case '2010s':
      return [2010, 2019];
    case '2000s':
      return [2000, 2009];
    case '90s':
      return [1990, 1999];
    case '80s':
      return [1980, 1989];
    default:
      return null;
  }
}

function extractReleaseYear(releaseDateStr) {
  if (!releaseDateStr) return null;
  const d = new Date(releaseDateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

// Only rejects a track when we actually *have* a release year to check
// against. If the provider gives us no release date, we don't punish the
// track for it -- we just can't confirm the era from metadata alone.
function eraMatches(releaseYear, era, currentYear) {
  const range = getEraRange(era, currentYear);
  if (!range) return true; // no era constraint requested
  if (releaseYear === null || releaseYear === undefined) return true; // unknown, don't reject
  return releaseYear >= range[0] && releaseYear <= range[1];
}

// ---------------------------------------------------------------------------
// Normalization + "is this actually the right song" verification
// ---------------------------------------------------------------------------

// Titles/labels that indicate a track is NOT the original/official release
// (remix, karaoke, cover, tribute, etc.) unless the user explicitly asked
// for one of these (i.e. the expected title itself contains the word).
const BAD_VERSION_KEYWORDS = [
  'karaoke', 'instrumental', 'tribute', 'cover version', 'made famous by',
  'in the style of', '8d audio', 'slowed', 'reverb', 'nightcore', 'sped up',
  'reaction', 'full movie', 'jukebox', 'lyrical video', 'lyric video',
  'audio jukebox', 'mashup', 'ringtone', 'bgm only', 'tamil dubbed'
];

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/feat\.?|ft\.?|featuring/g, ' ')
    .replace(/[\(\)\[\]\{\}\-\:\.\_\/,'"!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantWords(str) {
  return normalize(str).split(' ').filter(w => w.length > 1);
}

function containsBadVersionKeyword(trackTitle, expectedTitleNormalized) {
  const lowerTrack = trackTitle.toLowerCase();
  return BAD_VERSION_KEYWORDS.some(keyword => {
    if (!lowerTrack.includes(keyword)) return false;
    // If the user's own request also mentions this word (e.g. they *want*
    // a "remix" or "cover"), don't reject it.
    return !expectedTitleNormalized.includes(keyword.split(' ')[0]);
  });
}

function parseSongString(songString) {
  const parts = songString.split('-');
  const expectedTitle = parts[0] ? parts[0].trim() : '';
  const expectedArtist = parts[1] ? parts[1].trim() : '';
  return { expectedTitle, expectedArtist };
}

// Shared matching logic. `getTitle`/`getArtist` extract the relevant fields
// from the differently-shaped iTunes vs Deezer track objects.
function scoreMatch(track, songString, getTitle, getArtist) {
  const { expectedTitle, expectedArtist } = parseSongString(songString);
  const expectedTitleNorm = normalize(expectedTitle);

  const trackTitleRaw = getTitle(track) || '';
  const trackArtistRaw = getArtist(track) || '';

  if (containsBadVersionKeyword(trackTitleRaw, expectedTitleNorm)) {
    return { ok: false };
  }

  const titleKeywords = significantWords(expectedTitle);
  const trackTitleWords = new Set(significantWords(trackTitleRaw));
  let titleMatches = 0;
  for (const word of titleKeywords) {
    if (trackTitleWords.has(word) || trackTitleRaw.toLowerCase().includes(word)) titleMatches++;
  }
  const titleRatio = titleKeywords.length === 0 ? 1 : titleMatches / titleKeywords.length;

  const artistKeywords = significantWords(expectedArtist);
  const trackArtistLower = trackArtistRaw.toLowerCase();
  let artistMatches = 0;
  for (const word of artistKeywords) {
    if (trackArtistLower.includes(word)) artistMatches++;
  }
  const artistRatio = artistKeywords.length === 0 ? 1 : artistMatches / artistKeywords.length;

  // Title is the strongest signal (must have a solid majority-word match).
  // Artist is secondary since AI-suggested artist names (composer vs singer)
  // often don't line up exactly with provider metadata.
  const titleOk = titleKeywords.length === 0 || titleRatio >= 0.6 || titleMatches >= 2;
  const artistOk = artistKeywords.length === 0 || artistRatio > 0 || titleRatio >= 0.85;

  return { ok: titleOk && artistOk, titleRatio, artistRatio };
}

function verifyMatch(track, songString) {
  return scoreMatch(
    track,
    songString,
    t => t.trackName,
    t => t.artistName
  ).ok;
}

function verifyDeezerMatch(track, songString) {
  return scoreMatch(
    track,
    songString,
    t => t.title,
    t => (t.artist && t.artist.name) || ''
  ).ok;
}

// ---------------------------------------------------------------------------
// Provider queries
// ---------------------------------------------------------------------------

function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function standardizeItunesTrack(track) {
  const highResArtwork = track.artworkUrl100
    ? track.artworkUrl100.replace('100x100bb.jpg', '350x350bb.jpg')
    : '';
  const releaseYear = extractReleaseYear(track.releaseDate);

  return {
    success: true,
    previewUrl: track.previewUrl,
    artworkUrl: highResArtwork,
    title: track.trackName,
    artist: track.artistName,
    trackViewUrl: track.trackViewUrl,
    releaseDate: track.releaseDate || null,
    releaseYear,
    collectionName: track.collectionName || '',
    genre: track.primaryGenreName || '',
    duration: track.trackTimeMillis ? formatDuration(track.trackTimeMillis / 1000) : '',
    provider: 'itunes',
    _trackId: track.trackId
  };
}

function standardizeDeezerTrack(track) {
  return {
    success: true,
    previewUrl: track.preview, // direct MP3 link
    artworkUrl: track.album ? track.album.cover_medium : '',
    title: track.title,
    artist: track.artist ? track.artist.name : '',
    trackViewUrl: track.link,
    releaseDate: track.release_date || null,
    releaseYear: extractReleaseYear(track.release_date),
    collectionName: track.album ? track.album.title : '',
    genre: '',
    duration: track.duration ? formatDuration(track.duration) : '',
    provider: 'deezer',
    _trackId: track.id
  };
}

async function queryITunes(term, songString, opts = {}) {
  const { era, currentYear = getCurrentYear() } = opts;
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=10`;
    const data = await jsonpFetch(url);
    if (data && data.results && data.results.length > 0) {
      for (const track of data.results) {
        if (!track.previewUrl) continue;
        if (!verifyMatch(track, songString)) continue;
        const releaseYear = extractReleaseYear(track.releaseDate);
        if (era && !eraMatches(releaseYear, era, currentYear)) continue;
        return standardizeItunesTrack(track);
      }
    }
  } catch (e) {
    console.warn(`iTunes search failed for term "${term}":`, e);
  }
  return null;
}

async function queryDeezer(term, songString, opts = {}) {
  const { era, currentYear = getCurrentYear() } = opts;
  try {
    // Deezer uses output=jsonp for CORS bypass
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&output=jsonp`;
    const data = await jsonpFetch(url);
    if (data && data.data && data.data.length > 0) {
      for (const track of data.data) {
        if (!track.preview) continue;
        if (!verifyDeezerMatch(track, songString)) continue;
        const releaseYear = extractReleaseYear(track.release_date);
        // Deezer's search endpoint rarely includes release_date, so we only
        // enforce the era check when the field is actually present.
        if (era && releaseYear && !eraMatches(releaseYear, era, currentYear)) continue;
        return standardizeDeezerTrack(track);
      }
    }
  } catch (e) {
    console.warn(`Deezer search failed for term "${term}":`, e);
  }
  return null;
}

// Builds an ordered list of search term variations to try for a given
// song string, boosting Tamil / Tamil-Christian queries with extra
// language keywords so the correct-language original track surfaces first.
function buildSearchTerms(songString, opts = {}) {
  const { language } = opts;
  const { expectedTitle, expectedArtist } = parseSongString(songString);

  const cleanFull = normalize(songString);
  const cleanTitle = normalize(expectedTitle);
  const cleanArtist = normalize(expectedArtist);

  const terms = [];
  const pushUnique = (t) => {
    if (t && t.length > 1 && !terms.includes(t)) terms.push(t);
  };

  const languageBoost = language === 'tamil'
    ? ' tamil'
    : language === 'tamil_christian'
      ? ' tamil christian'
      : '';

  pushUnique(cleanFull);
  if (languageBoost) pushUnique(`${cleanTitle}${languageBoost}`);
  pushUnique(cleanTitle);
  if (languageBoost) pushUnique(`${cleanTitle} ${cleanArtist}${languageBoost}`);
  pushUnique(cleanArtist);

  return terms;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a single AI-suggested song ("Title - Artist") against real music
 * providers and return standardized, verified metadata. Returns
 * `{ success:false, previewUrl:null, ... }` if no verified playable match
 * could be found -- callers MUST treat that as "drop this song".
 *
 * opts:
 *   language: 'tamil' | 'tamil_christian' | 'english' | 'hindi'
 *   era:      'latest' | '2010s' | '2000s' | '90s' | '80s' | null
 *   currentYear: number (defaults to the real current year)
 */
export async function fetchSongDetails(songString, opts = {}) {
  const searchOpts = { ...opts, currentYear: opts.currentYear || getCurrentYear() };
  const terms = buildSearchTerms(songString, opts);

  for (const term of terms) {
    let details = await queryITunes(term, songString, searchOpts);
    if (details) return details;

    details = await queryDeezer(term, songString, searchOpts);
    if (details) return details;
  }

  // No verified match with a working preview -- never fall back to a wrong
  // song or a fake MP3. The caller is responsible for replacing this entry.
  const { expectedTitle, expectedArtist } = parseSongString(songString);
  return {
    success: false,
    previewUrl: null,
    artworkUrl: '',
    title: expectedTitle || songString,
    artist: expectedArtist || 'Curated Recommendation',
    trackViewUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(songString)}`,
    releaseDate: null,
    releaseYear: null,
    provider: null
  };
}

/**
 * Category-level fallback search: used when the AI's suggestions for a
 * whole category don't yield enough playable, era-correct songs. Searches
 * a list of generic-but-relevant terms (e.g. "Tamil 2026", "Tamil movie
 * songs 2026") and returns up to `needed` distinct, verified, playable
 * tracks -- never fabricated/fake MP3 entries.
 *
 * Returns an array of { songKey, details } where songKey is a
 * "Title - Artist" string suitable for use as the results array entry.
 */
export async function searchCategoryTracks(searchTerms, opts = {}, needed = 3, excludePreviewUrls = new Set()) {
  const { era, currentYear = getCurrentYear() } = opts;
  const found = [];
  const seenIds = new Set();

  for (const term of searchTerms) {
    if (found.length >= needed) break;
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=15`;
      const data = await jsonpFetch(url);
      if (data && data.results && data.results.length > 0) {
        for (const track of data.results) {
          if (found.length >= needed) break;
          if (!track.previewUrl) continue;
          if (excludePreviewUrls.has(track.previewUrl)) continue;
          if (seenIds.has(track.trackId)) continue;
          if (containsBadVersionKeyword(track.trackName || '', '')) continue;

          const releaseYear = extractReleaseYear(track.releaseDate);
          if (era && !eraMatches(releaseYear, era, currentYear)) continue;

          seenIds.add(track.trackId);
          const details = standardizeItunesTrack(track);
          const songKey = `${details.title} - ${details.artist}`;
          found.push({ songKey, details });
        }
      }
    } catch (e) {
      console.warn(`Category fallback search failed for term "${term}":`, e);
    }
  }

  // Try Deezer too if iTunes didn't fill the quota (era check best-effort).
  if (found.length < needed) {
    for (const term of searchTerms) {
      if (found.length >= needed) break;
      try {
        const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&output=jsonp`;
        const data = await jsonpFetch(url);
        if (data && data.data && data.data.length > 0) {
          for (const track of data.data) {
            if (found.length >= needed) break;
            if (!track.preview) continue;
            if (excludePreviewUrls.has(track.preview)) continue;
            if (seenIds.has(`d_${track.id}`)) continue;
            if (containsBadVersionKeyword(track.title || '', '')) continue;

            const releaseYear = extractReleaseYear(track.release_date);
            if (era && releaseYear && !eraMatches(releaseYear, era, currentYear)) continue;

            seenIds.add(`d_${track.id}`);
            const details = standardizeDeezerTrack(track);
            const songKey = `${details.title} - ${details.artist}`;
            found.push({ songKey, details });
          }
        }
      } catch (e) {
        console.warn(`Deezer category fallback search failed for term "${term}":`, e);
      }
    }
  }

  return found;
}
