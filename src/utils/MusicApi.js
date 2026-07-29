/**
 * Music Search Utility using iTunes Search API.
 * Provides public, keyless access to song preview URLs and official artwork.
 */

export async function fetchSongDetails(songString) {
  try {
    // Clean string by removing parentheses or brackets which might confuse search
    const cleanTerm = songString
      .replace(/[\(\)\[\]\-\:\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&media=music&limit=1`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`iTunes Search failed with status: ${response.status}`);
    }

    const data = await response.json();
    
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
    console.warn(`Failed to fetch iTunes preview for: "${songString}"`, error);
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
