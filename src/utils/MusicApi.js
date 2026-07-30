/**
 * Music Search Utility using iTunes & Deezer Search APIs.
 * Provides public, keyless access to song preview URLs and official artwork.
 * Uses JSONP to bypass CORS and Cross-Site Tracking Prevention on mobile iOS Safari and Android.
 */

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

    script.onerror = (err) => {
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

function verifyMatch(track, songString) {
  const parts = songString.split('-');
  const expectedTitle = parts[0] ? parts[0].trim().toLowerCase() : '';
  const expectedArtist = parts[1] ? parts[1].trim().toLowerCase() : '';
  
  const trackTitle = track.trackName ? track.trackName.toLowerCase() : '';
  const trackArtist = track.artistName ? track.artistName.toLowerCase() : '';
  
  // Title keywords check (words with length > 1)
  const titleKeywords = expectedTitle.split(/[\s\-\:\.\(\)\[\]]+/g).filter(w => w.length > 1);
  let titleMatches = 0;
  for (const word of titleKeywords) {
    if (trackTitle.includes(word)) titleMatches++;
  }
  
  // Artist keywords check
  const artistKeywords = expectedArtist.split(/[\s\-\:\.\(\)\[\]]+/g).filter(w => w.length > 1);
  let artistMatches = 0;
  for (const word of artistKeywords) {
    if (trackArtist.includes(word)) artistMatches++;
  }
  
  const titleOk = titleKeywords.length === 0 || titleMatches > 0;
  const artistOk = artistKeywords.length === 0 || artistMatches > 0;
  
  return titleOk && artistOk;
}

function verifyDeezerMatch(track, songString) {
  const parts = songString.split('-');
  const expectedTitle = parts[0] ? parts[0].trim().toLowerCase() : '';
  const expectedArtist = parts[1] ? parts[1].trim().toLowerCase() : '';
  
  const trackTitle = track.title ? track.title.toLowerCase() : '';
  const trackArtist = track.artist && track.artist.name ? track.artist.name.toLowerCase() : '';
  
  // Title keywords check
  const titleKeywords = expectedTitle.split(/[\s\-\:\.\(\)\[\]]+/g).filter(w => w.length > 1);
  let titleMatches = 0;
  for (const word of titleKeywords) {
    if (trackTitle.includes(word)) titleMatches++;
  }
  
  // Artist keywords check
  const artistKeywords = expectedArtist.split(/[\s\-\:\.\(\)\[\]]+/g).filter(w => w.length > 1);
  let artistMatches = 0;
  for (const word of artistKeywords) {
    if (trackArtist.includes(word)) artistMatches++;
  }
  
  const titleOk = titleKeywords.length === 0 || titleMatches > 0;
  const artistOk = artistKeywords.length === 0 || artistMatches > 0;
  
  return titleOk && artistOk;
}

async function queryITunes(term, songString) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=3`;
    const data = await jsonpFetch(url);
    if (data && data.results && data.results.length > 0) {
      for (const track of data.results) {
        if (verifyMatch(track, songString)) {
          const highResArtwork = track.artworkUrl100 
            ? track.artworkUrl100.replace('100x100bb.jpg', '350x350bb.jpg')
            : '';

          return {
            success: true,
            previewUrl: track.previewUrl,
            artworkUrl: highResArtwork,
            title: track.trackName,
            artist: track.artistName,
            trackViewUrl: track.trackViewUrl
          };
        }
      }
    }
  } catch (e) {
    console.warn(`iTunes search failed for term "${term}":`, e);
  }
  return null;
}

async function queryDeezer(term, songString) {
  try {
    // Deezer uses output=jsonp for CORS bypass
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&output=jsonp`;
    const data = await jsonpFetch(url);
    if (data && data.data && data.data.length > 0) {
      for (const track of data.data) {
        if (verifyDeezerMatch(track, songString)) {
          return {
            success: true,
            previewUrl: track.preview, // direct MP3 link
            artworkUrl: track.album ? track.album.cover_medium : '',
            title: track.title,
            artist: track.artist ? track.artist.name : '',
            trackViewUrl: track.link
          };
        }
      }
    }
  } catch (e) {
    console.warn(`Deezer search failed for term "${term}":`, e);
  }
  return null;
}

export async function fetchSongDetails(songString) {
  // 1. Clean terms
  const cleanTerm = songString
    .replace(/[\(\)\[\]\-\:\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Step 1: Query iTunes full term
  let details = await queryITunes(cleanTerm, songString);
  if (details) return details;

  // Step 2: Query Deezer full term
  details = await queryDeezer(cleanTerm, songString);
  if (details) return details;

  // Step 3: Query iTunes just the title (if string contains a hyphen)
  if (songString.includes('-')) {
    const parts = songString.split('-');
    const titleOnly = parts[0]
      .replace(/[\(\)\[\]\:\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (titleOnly.length > 1) {
      details = await queryITunes(titleOnly, songString);
      if (details) return details;
      
      details = await queryDeezer(titleOnly, songString);
      if (details) return details;
    }
  }

  // Step 4: Query iTunes/Deezer just the artist name (if string contains a hyphen)
  if (songString.includes('-')) {
    const parts = songString.split('-');
    const artistOnly = parts[1]
      .replace(/[\(\)\[\]\:\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (artistOnly.length > 1) {
      details = await queryITunes(artistOnly, songString);
      if (details) return details;
      
      details = await queryDeezer(artistOnly, songString);
      if (details) return details;
    }
  }

  // Return no previewUrl if no verified match is found (avoids playing wrong songs)
  const [fallbackTitle, fallbackArtist] = songString.split(' - ');
  return {
    success: false,
    previewUrl: null,
    artworkUrl: '',
    title: fallbackTitle ? fallbackTitle.trim() : songString,
    artist: fallbackArtist ? fallbackArtist.trim() : 'Curated Recommendation',
    trackViewUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(songString)}`
  };
}
