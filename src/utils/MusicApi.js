/**
 * Music Search Utility using iTunes Search API.
 * Provides public, keyless access to song preview URLs and official artwork.
 * Uses JSONP to bypass CORS and Cross-Site Tracking Prevention on mobile iOS Safari and Android.
 */

function jsonpFetch(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'itunes_jsonp_' + Math.round(100000 * Math.random());
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

    document.body.appendChild(script);
  });
}

export async function fetchSongDetails(songString) {
  try {
    // Clean string by removing parentheses or brackets which might confuse search
    const cleanTerm = songString
      .replace(/[\(\)\[\]\-\:\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&media=music&limit=1`;
    
    // Request via JSONP to fully bypass CORS/tracking limits on iOS and Android
    const data = await jsonpFetch(url);
    
    if (data.results && data.results.length > 0) {
      const track = data.results[0];
      // Get higher resolution artwork by modifying the URL
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
  } catch (error) {
    console.warn(`Failed to fetch iTunes preview via JSONP for: "${songString}"`, error);
  }

  // Graceful fallback values
  return {
    success: false,
    previewUrl: null,
    artworkUrl: '',
    title: '',
    artist: '',
    trackViewUrl: ''
  };
}
