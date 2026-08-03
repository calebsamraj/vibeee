import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Image as ImageIcon, Music, 
  Copy, Check, RefreshCw, Sparkles, 
  Trash2, Play, Disc
} from 'lucide-react';
import { queryWithFallback } from './utils/CurationApi';
import { fetchSongDetails, searchCategoryTracks, getCurrentYear } from './utils/MusicApi';
import AmbientBackground from './components/AmbientBackground';
import Toast from './components/Toast';

const SAMPLE_IMAGES = [
  {
    id: 'cyberpunk-city',
    name: 'Neon Cyberpunk',
    url: '/samples/cyberpunk-city.jpg',
    description: 'A glowing futuristic city street with neon signs'
  },
  {
    id: 'nature-sunset',
    name: 'Serene Sunset',
    url: '/samples/nature-sunset.jpg',
    description: 'A beautiful valley with mountains and sunset glow'
  },
  {
    id: 'retro-cafe',
    name: 'Cozy Cafe',
    url: '/samples/retro-cafe.jpg',
    description: 'A warm cozy cafe interior with vintage details'
  }
];

export default function App() {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loadingSample, setLoadingSample] = useState(null);
  
  const [loadingStep, setLoadingStep] = useState(null); // 'curating' | null
  const [loadingStatus, setLoadingStatus] = useState('');
  const [results, setResults] = useState(null);
  const [interimResults, setInterimResults] = useState(null);
  
  const [songMetadata, setSongMetadata] = useState({});
  const [playingTrackUrl, setPlayingTrackUrl] = useState(null);
  const [bgMusicPlaying, setBgMusicPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  
  const [toast, setToast] = useState(null);
  const [copiedCaptionIndex, setCopiedCaptionIndex] = useState(null);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const audioRef = useRef(null);
  const bgAudioRef = useRef(null);

  // Trigger music emoji burst
  const triggerEmojiBurst = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX || (rect.left + rect.width / 2);
    const clickY = e.clientY || (rect.top + rect.height / 2);

    const emojisList = ["🎵", "🎶", "🎸", "🎹", "🎧", "✨", "🔥"];
    const newBurst = Array.from({ length: 8 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.5;
      const distance = 40 + Math.random() * 40;
      return {
        id: `${Date.now()}-${i}-${Math.random()}`,
        emoji: emojisList[Math.floor(Math.random() * emojisList.length)],
        x: clickX,
        y: clickY,
        targetX: clickX + Math.cos(angle) * distance,
        targetY: clickY + Math.sin(angle) * distance - 80 - Math.random() * 50,
        rotation: (Math.random() - 0.5) * 60,
      };
    });

    setFloatingEmojis((prev) => [...prev, ...newBurst]);

    // Clean up after 1 second
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => !newBurst.find(n => n.id === item.id)));
    }, 1000);
  };

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
    };
  }, []);

  // iOS Safari audio unlocker
  const unlockAudio = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.play().then(() => {
        audio.pause();
      }).catch(e => console.log("Audio unlock muted/prevented:", e));
    }
    const bgAudio = bgAudioRef.current;
    if (bgAudio) {
      bgAudio.play().then(() => {
        bgAudio.pause();
      }).catch(e => console.log("BG audio unlock muted/prevented:", e));
    }
  };

  const toggleBgMusic = () => {
    const bgAudio = bgAudioRef.current;
    if (!bgAudio) return;

    if (!bgAudio.src) {
      bgAudio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3';
      bgAudio.volume = 0.2;
    }

    if (bgMusicPlaying) {
      bgAudio.pause();
      setBgMusicPlaying(false);
    } else {
      // Pause any playing preview track
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingTrackUrl(null);
        setAudioProgress(0);
      }
      bgAudio.play().then(() => {
        setBgMusicPlaying(true);
      }).catch(e => {
        console.warn("BG audio play blocked, trying muted play:", e);
        bgAudio.muted = true;
        bgAudio.play().then(() => {
          bgAudio.muted = false;
          setBgMusicPlaying(true);
        }).catch(err => {
          console.error("Muted BG playback failed:", err);
          showToast("Audio blocked. Tap the screen to play ambient track.", "warning");
        });
      });
    }
  };
  
  const showToast = (message, type = 'error') => {
    setToast({ message, type });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.add('border-cyan-500', 'bg-cyan-950/10');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.remove('border-cyan-500', 'bg-cyan-950/10');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.remove('border-cyan-500', 'bg-cyan-950/10');
    }
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const getCacheKey = (file, sampleId) => {
    if (sampleId) return `vibelens_cache_sample_${sampleId}`;
    if (file && file.name) return `vibelens_cache_upload_${file.name}_${file.size}_${file.lastModified}`;
    return null;
  };

  const handleFileChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (JPG, PNG, or WebP).', 'error');
      return;
    }
    
    if (imagePreview && !imagePreview.startsWith('http')) {
      URL.revokeObjectURL(imagePreview);
    }
    
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackUrl(null);
      setAudioProgress(0);
    }

    setImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);
    setResults(null);
    setSongMetadata({});

    // Unlock audio for iOS Safari autoplay
    unlockAudio();

    // Trigger analysis automatically
    setTimeout(() => {
      handleAnalyze(file, objectUrl);
    }, 100);
  };

  const handleSelectSample = async (sample) => {
    setLoadingSample(sample.id);
    try {
      // Check cache first to avoid download/proxy
      const cacheKey = getCacheKey(null, sample.id);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        setResults(cachedData.results);
        setSongMetadata(cachedData.songMetadata || {});
        setImagePreview(sample.url);
        showToast('Sample loaded from cache!', 'success');
        return;
      }

      // Try to fetch via local Express proxy first to bypass CORS. Fall back to direct fetch if proxy fails.
      let response;
      try {
        response = await fetch(`/api/proxy-image?url=${encodeURIComponent(sample.url)}`);
        if (!response.ok) {
          throw new Error('Proxy returned non-OK status');
        }
      } catch (proxyError) {
        console.warn('Image proxy failed, falling back to direct fetch:', proxyError);
        response = await fetch(sample.url);
      }
      
      const blob = await response.blob();
      const file = new File([blob], `${sample.id}.jpg`, { type: 'image/jpeg' });
      file.id = sample.id;
      
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingTrackUrl(null);
        setAudioProgress(0);
      }

      setImageFile(file);
      setImagePreview(sample.url);
      setResults(null);
      setSongMetadata({});

      // Unlock audio for iOS Safari autoplay
      unlockAudio();

      // Trigger analysis automatically
      setTimeout(() => {
        handleAnalyze(file, sample.url);
      }, 100);
    } catch (err) {
      console.error(err);
      showToast('Failed to load sample image. Please upload your own.', 'error');
    } finally {
      setLoadingSample(null);
    }
  };

  const handleClearImage = () => {
    if (imagePreview && !imagePreview.startsWith('http')) {
      URL.revokeObjectURL(imagePreview);
    }
    
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackUrl(null);
      setAudioProgress(0);
    }

    setImageFile(null);
    setImagePreview('');
    setResults(null);
    setInterimResults(null);
    setSongMetadata({});
  };

  const handleAnalyze = async (overrideFile = null, overridePreview = null) => {
    const fileToAnalyze = overrideFile || imageFile;
    if (!fileToAnalyze) {
      showToast('Please upload or select an image to analyze.', 'error');
      return;
    }

    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackUrl(null);
      setAudioProgress(0);
    }

    setLoadingStep('curating');
    setLoadingStatus('Initializing AI models...');
    setResults(null);
    setInterimResults(null);
    setSongMetadata({});
    
    // Check if result is cached
    const cacheKey = getCacheKey(fileToAnalyze, fileToAnalyze.id);
    if (cacheKey) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          console.log("Loading curation results from cache!");
          setLoadingStatus("Retrieving cached payload...");
          setSongMetadata(cachedData.songMetadata || {});
          setResults(cachedData.results);
          showToast('Visual curation loaded from cache!', 'success');
          setLoadingStep(null);
          setLoadingStatus('');
          return;
        } catch (cacheErr) {
          console.warn("Failed to parse cached data:", cacheErr);
          localStorage.removeItem(cacheKey);
        }
      }
    }
    
    try {
      // Pass a dummy options object to maintain wrapper compatibility
      const dummyOptions = {
        captionsEnglish: true,
        captionsTamil: true,
        songsTamil: true,
        songsEnglish: true,
        songsHindi: true,
        songsTamilChristian: true
      };
      const curatedData = await queryWithFallback(fileToAnalyze, '', dummyOptions, setLoadingStatus);
      setInterimResults(curatedData);
      
      const metadataDict = {};
      
      // Parallel verification helper
      setLoadingStatus("Connecting to music search indexes...");
      const verifyRecommendations = async (recommendedSongsList) => {
        const verified = [];
        const usedPreviewUrls = new Set();
        
        // Process searches in parallel batches of 5 to run within seconds
        const batchSize = 5;
        for (let i = 0; i < recommendedSongsList.length; i += batchSize) {
          const batch = recommendedSongsList.slice(i, i + batchSize);
          setLoadingStatus(`Verifying previews (${i + 1}-${Math.min(i + batchSize, recommendedSongsList.length)} of ${recommendedSongsList.length})...`);
          
          const promises = batch.map(async (item) => {
            try {
              const details = await fetchSongDetails(item.song, { language: item.language });
              return { item, details };
            } catch (err) {
              console.warn(`Failed verification for song ${item.song}:`, err);
              return null;
            }
          });
          
          const batchResults = await Promise.all(promises);
          
          for (const res of batchResults) {
            if (res && res.details && res.details.previewUrl && !usedPreviewUrls.has(res.details.previewUrl)) {
              metadataDict[res.item.song] = res.details;
              usedPreviewUrls.add(res.details.previewUrl);
              verified.push({
                ...res.item,
                details: res.details
              });
            }
          }
        }
        
        // Sort by confidenceScore descending
        verified.sort((a, b) => b.confidenceScore - a.confidenceScore);
        return verified;
      };

      if (curatedData.recommendedSongs && curatedData.recommendedSongs.length > 0) {
        const verifiedPlaylist = await verifyRecommendations(curatedData.recommendedSongs);
        
        // Filter and keep only tracks that have verified previewUrl
        curatedData.recommendedSongs = verifiedPlaylist;
      } else {
        curatedData.recommendedSongs = [];
      }

      setSongMetadata(metadataDict);
      setResults(curatedData);
      
      // Cache the result
      if (cacheKey) {
        localStorage.setItem(cacheKey, JSON.stringify({
          results: curatedData,
          songMetadata: metadataDict
        }));
      }

      showToast('Visual curation completed successfully!', 'success');
    } catch (err) {
      console.error('Workflow error:', err);
      const msg = err.message || '';
      showToast(`Curation failed: ${msg || 'All AI pipelines failed'}. Please verify your API configurations.`, 'error');
    } finally {
      setLoadingStep(null);
      setLoadingStatus('');
    }
  };

  const togglePlay = (previewUrl) => {
    if (!previewUrl) return;

    // Pause ambient background music if playing
    if (bgAudioRef.current && !bgAudioRef.current.paused) {
      bgAudioRef.current.pause();
      setBgMusicPlaying(false);
    }

    const audio = audioRef.current;
    if (!audio) return;

    // Clicked on the currently playing track -> Pause it
    if (playingTrackUrl === previewUrl) {
      audio.pause();
      setPlayingTrackUrl(null);
      setAudioProgress(0);
      return;
    }

    // Stop any previously playing track preview and completely flush WebKit buffer to prevent overlap
    audio.pause();
    audio.src = '';
    audio.load();
    
    // Set new source
    audio.src = previewUrl;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        setPlayingTrackUrl(previewUrl);
        setAudioProgress(0);
      }).catch(e => {
        console.warn("Autoplay blocked by browser rules, attempting muted bypass:", e);
        audio.muted = true;
        audio.play().then(() => {
          audio.muted = false;
          setPlayingTrackUrl(previewUrl);
          setAudioProgress(0);
        }).catch(err => {
          console.error("Muted playback failed too:", err);
          showToast("Audio playback blocked. Tap again to play.", "warning");
          setPlayingTrackUrl(null);
        });
      });
    }
  };

  const copyToClipboard = (text, type, index = null) => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'caption') {
        setCopiedCaptionIndex(index);
        setTimeout(() => setCopiedCaptionIndex(null), 2000);
      } else if (type === 'hashtags') {
        setCopiedHashtags(true);
        setTimeout(() => setCopiedHashtags(false), 2000);
      }
      showToast('Copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy:', err);
      showToast('Failed to copy to clipboard.', 'error');
    });
  };

  // Helper renderer for song items
  const renderSongItem = (songItem, idx) => {
    const { song, language, confidenceScore, matchExplanation } = songItem;
    const meta = songMetadata[song] || {};
    const hasPreview = !!meta.previewUrl;
    const isCurrentPlaying = hasPreview && playingTrackUrl === meta.previewUrl;
    
    // Parse title & artist fallbacks
    const [fallbackTitle, fallbackArtist] = song.split(' - ');
    const displayTitle = meta.title || fallbackTitle || song;
    const displayArtist = meta.artist || fallbackArtist || "Unknown Artist";
    const displayDuration = meta.duration || "";

    return (
      <div 
        key={idx} 
        className={`group/song flex flex-col p-4 bg-slate-950/20 hover:bg-slate-950/40 rounded-2xl border transition-all duration-300 gap-3 ${
          isCurrentPlaying ? 'border-cyan-500/40 bg-cyan-950/5 shadow-[0_0_20px_rgba(6,182,212,0.05)]' : 'border-white/5 hover:border-cyan-500/20'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Album artwork container */}
            <div 
              onClick={(e) => {
                triggerEmojiBurst(e);
                hasPreview && togglePlay(meta.previewUrl);
              }}
              className={`w-12 h-12 rounded-xl border border-white/5 flex items-center justify-center shrink-0 relative overflow-hidden group-hover/song:shadow-md transition-all duration-300 ${
                hasPreview ? 'cursor-pointer' : ''
              } ${
                isCurrentPlaying ? 'shadow-lg shadow-cyan-500/20 border-cyan-500/30' : ''
              }`}
            >
              {meta.artworkUrl ? (
                <img 
                  src={meta.artworkUrl} 
                  alt="Album art" 
                  className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${
                    isCurrentPlaying ? 'animate-spin-slow scale-105' : 'group-hover/song:scale-105'
                  }`}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/20 to-teal-600/20 flex items-center justify-center">
                  <Disc className={`w-6 h-6 text-cyan-400 ${isCurrentPlaying ? 'animate-spin-slow' : ''}`} />
                </div>
              )}
              
              {/* Play/Pause overlay */}
              {hasPreview && (
                <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-300 ${
                  isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover/song:opacity-100'
                }`}>
                  {isCurrentPlaying ? (
                    <div className="flex gap-0.5 items-end justify-center w-5 h-5">
                      <span className="w-0.75 bg-cyan-400 animate-[bounce_0.8s_infinite_100ms] h-3"></span>
                      <span className="w-0.75 bg-cyan-400 animate-[bounce_0.8s_infinite_300ms] h-4"></span>
                      <span className="w-0.75 bg-cyan-400 animate-[bounce_0.8s_infinite_200ms] h-2.5"></span>
                    </div>
                  ) : (
                    <Play className="w-4 h-4 fill-cyan-400 text-cyan-400" />
                  )}
                </div>
              )}
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-sm font-semibold truncate transition-colors ${
                  isCurrentPlaying ? 'text-cyan-300' : 'text-slate-200 group-hover/song:text-cyan-300'
                }`}>
                  {displayTitle}
                </p>
                {displayDuration && (
                  <span className="text-[10px] text-slate-500 shrink-0 font-mono">({displayDuration})</span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {displayArtist}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Language and Confidence Badges */}
            <span className="text-[9px] uppercase font-bold text-slate-400 bg-slate-900/60 border border-slate-800 px-2 py-0.5 rounded-full shrink-0">
              {language}
            </span>
            <span className="text-[9px] font-bold text-cyan-400 bg-cyan-950/30 border border-cyan-500/20 px-2 py-0.5 rounded-full shrink-0">
              {confidenceScore}% Vibe
            </span>
            
            {hasPreview ? (
              <button
                onClick={(e) => {
                  triggerEmojiBurst(e);
                  togglePlay(meta.previewUrl);
                }}
                className={`h-9 px-3 rounded-xl border transition-all text-xs font-semibold cursor-pointer flex items-center justify-center ${
                  isCurrentPlaying 
                    ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
                }`}
                title={isCurrentPlaying ? "Pause Preview" : "Play Preview"}
              >
                {isCurrentPlaying ? "Pause" : "Play"}
              </button>
            ) : (
              <a 
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  triggerEmojiBurst(e);
                }}
                className="h-9 px-3 rounded-xl border border-slate-855 hover:border-red-500/30 bg-slate-900 text-slate-400 hover:text-red-400 transition-all text-xs font-semibold flex items-center justify-center cursor-pointer"
                title="Listen on YouTube"
              >
                Play YT
              </a>
            )}
          </div>
        </div>

        {/* Custom Progress Bar for Currently Playing Song */}
        {isCurrentPlaying && (
          <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden relative">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-teal-400 h-full transition-all duration-100 shadow-[0_0_8px_#06b6d4]" 
              style={{ width: `${audioProgress}%` }}
            ></div>
          </div>
        )}

        {/* Match Explanation */}
        {matchExplanation && (
          <p className="text-[11px] text-slate-400 leading-relaxed border-l border-cyan-500/30 pl-2">
            {matchExplanation}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 md:px-8 max-w-5xl mx-auto w-full relative">
      {/* Ambient Background */}
      <AmbientBackground imagePreview={imagePreview} />

      {/* Hidden Audio Elements for Mobile Autoplay Bypass */}
      <audio 
        ref={audioRef} 
        preload="auto" 
        playsInline 
        onEnded={() => {
          setPlayingTrackUrl(null);
          setAudioProgress(0);
        }} 
        onTimeUpdate={(e) => {
          const cur = e.target.currentTime;
          const dur = e.target.duration || 30;
          setAudioProgress((cur / dur) * 100);
        }}
        onError={() => {
          console.warn('Preview playback failed for the current track.');
          setPlayingTrackUrl(null);
          setAudioProgress(0);
          showToast('That preview failed to play. Try another track.', 'warning');
        }}
      />
      <audio 
        ref={bgAudioRef} 
        preload="auto" 
        loop 
        playsInline 
        onPlay={() => setBgMusicPlaying(true)}
        onPause={() => setBgMusicPlaying(false)}
      />

      {/* Toast Alert */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Premium Dynamic Island - Top Center Area */}
      <div className="z-30 w-full max-w-sm sticky top-4 mb-8">
        <div className="dynamic-island flex items-center justify-between px-6 py-3.5 w-full bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wider text-slate-300 font-mono">
              {loadingStep ? "ANALYZING IMAGE..." : playingTrackUrl ? "NOW PREVIEWING..." : "VIBELENS DECK"}
            </span>
          </div>
          
          <button
            onClick={toggleBgMusic}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold transition-all active:scale-95 cursor-pointer ${
              bgMusicPlaying
                ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-cyan-400'
            }`}
          >
            <Music className={`w-3 h-3 ${bgMusicPlaying ? 'animate-bounce' : ''}`} />
            <span>{bgMusicPlaying ? 'Stop Ambient' : 'Play Ambient'}</span>
          </button>
        </div>
      </div>

      {/* Flagship Device Frame wrapping the entire interface */}
      <div className="w-full max-w-4xl glass-panel rounded-[32px] overflow-hidden border border-white/10 bg-slate-950/60 shadow-[0_32px_64px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.05)] relative flex flex-col min-h-[640px] z-10">
        
        {/* Device Top Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
        
        {/* Main Header inside player */}
        <div className="px-8 pt-8 pb-4 flex flex-col sm:flex-row justify-between items-center border-b border-white/5 gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-black bg-gradient-to-r from-cyan-400 via-teal-300 to-pink-400 bg-clip-text text-transparent tracking-tight text-glow-cyan">
              VIBELENS
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">
              Flagship Curation Matrix
            </p>
          </div>
          <div className="text-slate-600 text-xs font-mono">
            SYS v1.2 // GEMINI ACTIVE
          </div>
        </div>

        {/* Content Body */}
        <div className="p-8 flex-1 flex flex-col gap-8">
          {loadingStep ? (
            /* Holographic Scanning state */
            <div className="flex-1 flex flex-col md:flex-row gap-8 items-center justify-center py-12 animate-slide-in">
              <div className="w-full md:w-1/2 flex flex-col items-center gap-6">
                
                {/* Immersive Vision Scanner Circle */}
                <div className="relative w-44 h-44 rounded-full border border-cyan-500/20 bg-slate-900/40 flex items-center justify-center glow-cyan">
                  {/* Rotating visual elements */}
                  <div className="absolute inset-2 rounded-full border border-dashed border-cyan-400/20 animate-spin-slow"></div>
                  
                  {/* Photo Thumbnail floating in center */}
                  {imagePreview && (
                    <div className="relative w-28 h-28 rounded-full border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] overflow-hidden animate-pulse-soft">
                      <img src={imagePreview} className="w-full h-full object-cover" alt="Scan Target" />
                      <div className="absolute top-0 left-0 right-0 h-1 bg-green-400 animate-scan-beam" style={{ animationDuration: '1.5s' }} />
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full text-cyan-400 font-mono">
                    MATRIX SEARCHING
                  </span>
                  <p className="text-sm font-semibold text-slate-200 mt-3">{loadingStatus}</p>
                </div>
              </div>

              {/* Progress Checklist */}
              <div className="w-full md:w-1/2 flex flex-col gap-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5 max-w-sm">
                {[
                  { key: "Analyzing visual aesthetic and tone...", label: "Aesthetic Analysis" },
                  { key: "Running visual mood and theme analysis...", label: "Mood & Theme Extraction" },
                  { key: "Generating captions and song matches...", label: "Social Caption Drafting" },
                  { key: "Aligning playlist track selections...", label: "Soundtrack Matching" },
                  { key: "Connecting to music search indexes...", label: "Searching Previews" },
                  { key: "Verifying previews", label: "Verifying Previews" }
                ].map((step, idx) => {
                  const statusList = [
                    "Analyzing visual aesthetic and tone...",
                    "Running visual mood and theme analysis...",
                    "Generating captions and song matches...",
                    "Aligning playlist track selections...",
                    "Connecting to music search indexes...",
                    "Verifying previews"
                  ];
                  let isCurrent = false;
                  let isCompleted = false;

                  const currentIdx = statusList.findIndex(s => loadingStatus.includes(s) || (s === "Verifying previews" && loadingStatus.includes("Verifying")));
                  
                  if (currentIdx === -1) {
                    if (idx === 0) isCurrent = true;
                  } else {
                    isCompleted = idx < currentIdx;
                    isCurrent = idx === currentIdx;
                  }
                  
                  return (
                    <div key={idx} className="flex items-center gap-3 transition-all duration-300">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border text-[10px] font-bold ${
                        isCompleted 
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : isCurrent
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 animate-pulse'
                            : 'bg-slate-900 border-slate-800 text-slate-600'
                      }`}>
                        {isCompleted ? "✓" : idx + 1}
                      </div>
                      <span className={`text-xs font-semibold ${
                        isCompleted 
                          ? 'text-slate-400 line-through decoration-slate-700/40'
                          : isCurrent
                            ? 'text-cyan-300 font-bold text-glow-cyan animate-pulse-soft'
                            : 'text-slate-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !results ? (
            /* Idle Upload State */
            <div className="flex-1 flex flex-col items-center justify-center py-10 animate-slide-in">
              
              {/* Drag Zone */}
              <div
                ref={dragRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-lg border border-dashed border-white/10 hover:border-cyan-500/40 rounded-3xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-spring bg-white/[0.01] hover:bg-cyan-500/[0.02] min-h-[300px] group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  className="hidden"
                />

                <div className="p-5 rounded-full bg-slate-900/60 border border-white/5 text-cyan-400 group-hover:scale-105 transition-spring shadow-lg">
                  <Upload className="w-6 h-6 animate-pulse-soft" />
                </div>
                
                <h3 className="text-base font-bold text-slate-200 mt-4 tracking-tight">
                  Upload Image for Curation
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                  Drag and drop a photo or click to open. AI will automatically analyze your look, expression, and background to recommend the perfect soundtrack.
                </p>
                <span className="mt-5 text-xs font-bold px-5 py-2.5 rounded-full bg-slate-900 border border-white/10 hover:border-cyan-500/30 text-slate-300 hover:text-slate-100 transition-colors">
                  Select File
                </span>
              </div>

              {/* Presets */}
              <div className="w-full max-w-lg mt-8">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 block mb-3 text-center">
                  Or load a pre-configured scenario
                </span>
                <div className="grid grid-cols-3 gap-3">
                  {SAMPLE_IMAGES.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => handleSelectSample(sample)}
                      disabled={loadingSample !== null}
                      className="group/btn relative rounded-2xl overflow-hidden border border-white/5 hover:border-cyan-500/40 aspect-square flex flex-col justify-end p-3 transition-spring cursor-pointer shadow-lg hover:shadow-cyan-950/20"
                    >
                      <img 
                        src={sample.url} 
                        alt={sample.name} 
                        className="absolute inset-0 object-cover w-full h-full brightness-50 group-hover/btn:scale-105 transition-all duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent z-10"></div>
                      
                      {loadingSample === sample.id ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-20">
                          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                        </div>
                      ) : null}
                      
                      <span className="relative z-20 text-[10px] font-bold text-slate-200 group-hover/btn:text-cyan-300 transition-colors text-left truncate w-full">
                        {sample.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Results View */
            <div className="flex-1 flex flex-col gap-8 animate-slide-in">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                
                {/* Left Side: Curated Image & Rationale */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  {/* Photo container */}
                  <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black/40 flex items-center justify-center max-h-[300px] group">
                    <img 
                      src={imagePreview} 
                      alt="Curated Preview" 
                      className="object-contain max-h-[300px] w-full"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent"></div>
                    <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
                      <span className="text-[9px] font-bold uppercase bg-cyan-500 text-slate-950 px-2.5 py-0.5 rounded-full shadow">
                        VIBE UNLOCKED
                      </span>
                      {results.recommendedSongs?.length > 0 && (
                        <span className="text-[9px] font-bold uppercase bg-slate-900/80 border border-white/10 text-slate-300 px-2.5 py-0.5 rounded-full">
                          {results.recommendedSongs[0]?.language} Vibe
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Look description */}
                  {results.lookDescription && (
                    <div className="glass-panel p-5 rounded-2xl border border-pink-500/20 bg-slate-950/40 flex flex-col gap-2 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-2xl"></div>
                      <h3 className="text-xs font-black text-pink-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        STYLE & LOOK GLOSS
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed italic">
                        "{results.lookDescription}"
                      </p>
                    </div>
                  )}

                  {/* Caption rationale */}
                  {results.captionExplanation && (
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-slate-950/20 flex flex-col gap-2">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        CURATION RATIONALE
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {results.captionExplanation}
                      </p>
                    </div>
                  )}

                  {/* Reset Deck */}
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="w-full py-3.5 rounded-2xl bg-slate-900 hover:bg-red-950/20 border border-white/5 hover:border-red-500/20 text-slate-400 hover:text-red-400 font-bold text-xs transition-spring active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>RESET DECK</span>
                  </button>
                </div>

                {/* Right Side: Song Playlists Container */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  
                  {/* Playlist deck wrapper */}
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border border-cyan-500/25 bg-slate-950/40 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-44 h-44 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <h3 className="text-sm font-black text-slate-200 flex items-center justify-between z-10">
                      <span className="flex items-center gap-2">
                        <Music className="w-4.5 h-4.5 text-cyan-400" />
                        RECOMMENDED SOUNDTRACK
                      </span>
                      <span className="text-[9px] uppercase font-bold text-cyan-400 tracking-widest bg-cyan-950/30 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
                        {results.recommendedSongs?.length || 0} TRACKS
                      </span>
                    </h3>

                    {results.recommendedSongs && results.recommendedSongs.length > 0 ? (
                      <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1 z-10">
                        {results.recommendedSongs.map((songItem, idx) => renderSongItem(songItem, idx))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-xs text-slate-500 italic">
                        No verified, playable preview tracks found for recommended songs.
                      </div>
                    )}
                  </div>

                  {/* Engine Badge */}
                  {results._modelUsed && (
                    <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-white/5 bg-slate-950/30 text-xs">
                      <span className="text-slate-500">COGNITIVE ENGINE</span>
                      <span className="font-mono text-cyan-400 font-bold bg-cyan-950/30 px-3 py-1 rounded-full border border-cyan-500/20">
                        {results._modelUsed}
                      </span>
                    </div>
                  )}

                </div>
              </div>

              {/* Captions and Hashtags section below grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                
                {/* Social Captions */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border border-white/5">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4.5 h-4.5 text-cyan-400" />
                    Captions & Quotes
                  </h3>

                  <div className="flex flex-col gap-3">
                    {/* English Captions */}
                    {results.captionsEnglish && results.captionsEnglish.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase text-cyan-400/80 tracking-widest block">English</span>
                        {results.captionsEnglish.map((caption, idx) => (
                          <div key={`en-${idx}`} className="bg-slate-950/40 border border-white/5 rounded-xl p-3 flex items-start gap-3 hover:border-cyan-500/25 transition-spring">
                            <p className="text-xs text-slate-200 leading-relaxed flex-1 select-all">{caption}</p>
                            <button
                              onClick={() => copyToClipboard(caption, 'caption', `en-${idx}`)}
                              className="p-1.5 rounded-lg bg-slate-900 border border-white/5 text-slate-500 hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
                            >
                              {copiedCaptionIndex === `en-${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tamil Captions */}
                    {results.captionsTamil && results.captionsTamil.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <span className="text-[10px] font-black uppercase text-cyan-400/80 tracking-widest block">Tamil</span>
                        {results.captionsTamil.map((caption, idx) => (
                          <div key={`ta-${idx}`} className="bg-slate-950/40 border border-white/5 rounded-xl p-3 flex items-start gap-3 hover:border-cyan-500/25 transition-spring">
                            <p className="text-xs text-slate-200 leading-relaxed flex-1 select-all">{caption}</p>
                            <button
                              onClick={() => copyToClipboard(caption, 'caption', `ta-${idx}`)}
                              className="p-1.5 rounded-lg bg-slate-900 border border-white/5 text-slate-500 hover:text-slate-202 transition-colors shrink-0 cursor-pointer"
                            >
                              {copiedCaptionIndex === `ta-${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Hashtags */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border border-white/5">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <span className="text-cyan-400 font-mono">#</span>
                      Trending Hashtags
                    </h3>
                    <button
                      onClick={() => copyToClipboard(results.hashtags?.join(' '), 'hashtags')}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-cyan-955/20 hover:bg-cyan-900/30 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                    >
                      {copiedHashtags ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>COPIED ALL</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>COPY ALL</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 p-3 bg-slate-955/30 rounded-2xl border border-white/5">
                    {results.hashtags?.map((tag, idx) => (
                      <span 
                        key={idx} 
                        className="text-[11px] font-medium px-2.5 py-1.5 rounded-xl bg-slate-900 border border-white/5 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/20 transition-spring select-all cursor-pointer"
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Footer inside player */}
        <div className="px-8 py-4 border-t border-white/5 bg-slate-950/30 flex justify-between items-center text-[10px] text-slate-600 font-mono">
          <span>COGNITIVE DECK v1.2</span>
          <span>© VIBELENS PROJECT</span>
        </div>

      </div>

      {/* Floating Emojis */}
      {floatingEmojis.map((item) => (
        <span
          key={item.id}
          className="fixed pointer-events-none select-none text-xl z-50 animate-emoji-float"
          style={{
            left: item.x,
            top: item.y,
            '--target-x': `${item.targetX - item.x}px`,
            '--target-y': `${item.targetY - item.y}px`,
            '--rotation': `${item.rotation}deg`,
          }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}
