import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Image as ImageIcon, Music, 
  Copy, Check, RefreshCw, Sparkles, 
  Trash2, Play, Disc
} from 'lucide-react';
import { queryWithFallback } from './utils/CurationApi';
import { fetchSongDetails } from './utils/MusicApi';
import ThreeBackground from './components/ThreeBackground';
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
  
  const [options, setOptions] = useState({
    captionsEnglish: true,
    captionsTamil: true,
    songsTamil: true,
    songsEnglish: true,
    songsHindi: true,
    songsTamilChristian: true,
    songEra: 'latest', // 'latest', '2010s', '2000s', '90s', '80s'
    captionStyle: 'one_line', // 'one_line', 'two_lines', 'three_words'
    captionPlatform: 'post' // 'post', 'story', 'reel'
  });
  
  const [activeStep, setActiveStep] = useState(1);
  const [songMetadata, setSongMetadata] = useState({});
  const [playingTrackUrl, setPlayingTrackUrl] = useState(null);
  const [bgMusicPlaying, setBgMusicPlaying] = useState(false);
  
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
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setResults(null);
    setSongMetadata({});
  };

  const handleSelectSample = async (sample) => {
    setLoadingSample(sample.id);
    try {
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
      
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingTrackUrl(null);
      }

      setImageFile(file);
      setImagePreview(sample.url);
      setResults(null);
      setSongMetadata({});
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
    }

    setImageFile(null);
    setImagePreview('');
    setResults(null);
    setSongMetadata({});
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      showToast('Please upload or select an image to analyze.', 'error');
      return;
    }
    
    // Ensure at least one caption and one song language is selected
    if (!options.captionsEnglish && !options.captionsTamil) {
      showToast('Please select at least one language for captions.', 'error');
      return;
    }
    if (!options.songsTamil && !options.songsEnglish && !options.songsHindi) {
      showToast('Please select at least one language for song recommendations.', 'error');
      return;
    }

    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackUrl(null);
    }

    setLoadingStep('curating');
    setLoadingStatus('Initializing AI models...');
    setResults(null);
    setSongMetadata({});
    
    try {
      const curatedData = await queryWithFallback(imageFile, '', options, setLoadingStatus);
      
      const metadataDict = {};
      const finalTamilChristian = [];

      // Filter and verify Tamil Christian songs
      if (curatedData.songsTamilChristian && curatedData.songsTamilChristian.length > 0) {
        for (let i = 0; i < curatedData.songsTamilChristian.length; i++) {
          const song = curatedData.songsTamilChristian[i];
          setLoadingStatus(`Verifying Christian soundtrack preview (${i + 1}/${curatedData.songsTamilChristian.length})...`);
          const details = await fetchSongDetails(song);
          if (details && details.previewUrl) {
            metadataDict[song] = details;
            finalTamilChristian.push(song);
          } else {
            console.log(`Filtering out Tamil Christian song without preview: ${song}`);
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        curatedData.songsTamilChristian = finalTamilChristian;
      }

      // Fetch standard playlist songs
      const standardSongs = [
        ...(curatedData.songsTamil || []),
        ...(curatedData.songsEnglish || []),
        ...(curatedData.songsHindi || [])
      ];

      for (let i = 0; i < standardSongs.length; i++) {
        const song = standardSongs[i];
        setLoadingStatus(`Fetching audio previews (${i + 1}/${standardSongs.length})...`);
        const details = await fetchSongDetails(song);
        metadataDict[song] = details;
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      setSongMetadata(metadataDict);
      setResults(curatedData);
      showToast('Visual curation completed successfully!', 'success');
    } catch (err) {
      console.error('Workflow error:', err);
      const msg = err.message || '';
      showToast(`Curation failed: ${msg || 'All AI pipelines failed'}. Please verify your API key configurations.`, 'error');
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
      }).catch(e => {
        console.warn("Autoplay blocked by browser rules, attempting muted bypass:", e);
        audio.muted = true;
        audio.play().then(() => {
          audio.muted = false;
          setPlayingTrackUrl(previewUrl);
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
  const renderSongItem = (song, idx) => {
    const meta = songMetadata[song] || {};
    const hasPreview = !!meta.previewUrl;
    const isCurrentPlaying = hasPreview && playingTrackUrl === meta.previewUrl;
    
    // Parse title & artist fallbacks
    const [fallbackTitle, fallbackArtist] = song.split(' - ');
    const displayTitle = meta.title || fallbackTitle || song;
    const displayArtist = meta.artist || fallbackArtist || "Unknown Artist";

    return (
      <div 
        key={idx} 
        className={`group/song flex items-center justify-between p-3.5 bg-slate-950/30 hover:bg-slate-950/50 rounded-2xl border transition-all duration-300 ${
          isCurrentPlaying ? 'border-cyan-500/40 bg-cyan-950/5' : 'border-white/5 hover:border-cyan-500/20'
        }`}
      >
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
            <p className={`text-sm font-semibold truncate transition-colors ${
              isCurrentPlaying ? 'text-cyan-300' : 'text-slate-200 group-hover/song:text-cyan-300'
            }`}>
              {displayTitle}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {displayArtist}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPreview ? (
            <button
              onClick={(e) => {
                triggerEmojiBurst(e);
                togglePlay(meta.previewUrl);
              }}
              className={`h-10 px-3 md:px-4 rounded-xl border transition-all text-xs font-semibold cursor-pointer flex items-center justify-center ${
                isCurrentPlaying 
                  ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
              }`}
              title={isCurrentPlaying ? "Pause Preview" : "Play Preview"}
            >
              {isCurrentPlaying ? "Pause" : "Preview"}
            </button>
          ) : (
            <a 
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                triggerEmojiBurst(e);
              }}
              className="h-10 px-3 md:px-4 rounded-xl border border-slate-850 hover:border-red-500/30 bg-slate-900 text-slate-400 hover:text-red-400 transition-all text-xs font-semibold flex items-center justify-center cursor-pointer"
              title="Listen on YouTube"
            >
              Play on YT
            </a>
          )}

          <a 
            href={meta.trackViewUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              triggerEmojiBurst(e);
            }}
            className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 transition-colors shrink-0 flex items-center justify-center"
            title={meta.trackViewUrl ? "Listen to Full Track" : "Listen on YouTube"}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 md:px-8 max-w-7xl mx-auto w-full relative">
      {/* 3D Background */}
      <ThreeBackground />

      {/* Hidden Audio Elements for Mobile Autoplay Bypass */}
      <audio 
        ref={audioRef} 
        preload="auto" 
        playsInline 
        onEnded={() => setPlayingTrackUrl(null)} 
      />
      <audio 
        ref={bgAudioRef} 
        preload="auto" 
        loop 
        playsInline 
        onPlay={() => setBgMusicPlaying(true)}
        onPause={() => setBgMusicPlaying(false)}
      />

      {/* Background Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-cyan-900/10 blur-[120px] pointer-events-none animate-pulse-soft"></div>
      <div className="absolute bottom-[10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-teal-900/10 blur-[120px] pointer-events-none animate-pulse-soft" style={{ animationDelay: '1.5s' }}></div>

      {/* Toast Alert */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header */}
      <header className="w-full flex flex-col md:flex-row justify-between items-center gap-6 mb-12 pb-6 border-b border-white/5 z-10">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent text-glow-cyan">
              VibeLens
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-md">
            AI Image Captioner, Hashtag Generator & Cross-Language Music Curator (Powered by Free Gemini & Groq APIs)
          </p>
        </div>

        <button
          onClick={toggleBgMusic}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-lg ${
            bgMusicPlaying
              ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400 shadow-cyan-900/10'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/20'
          }`}
        >
          <Music className={`w-4 h-4 ${bgMusicPlaying ? 'animate-bounce' : ''}`} />
          {bgMusicPlaying ? 'Stop Ambient Music' : 'Play Ambient Music'}
        </button>
      </header>

      {/* Main Grid Area */}
      <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 z-10 flex-1">
        {/* Left Side: Upload & Control Panel */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-6 border-2 border-cyan-500/20 bg-slate-950/70 shadow-[6px_6px_0px_rgba(6,182,212,0.15)]">
            <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-cyan-400" />
              Curation Station
            </h2>

            {results ? (
              <div className="flex flex-col gap-5 animate-slide-in">
                {/* Uploaded Preview Image */}
                <div className="relative rounded-2xl overflow-hidden border-2 border-cyan-500/20 shadow-2xl max-h-[300px] w-full flex items-center justify-center bg-black/40">
                  <img 
                    src={imagePreview} 
                    alt="Curated Preview" 
                    className="object-contain max-h-[300px] w-full"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 z-10">
                    <span className="text-[10px] font-black uppercase bg-cyan-500 text-slate-950 px-2 py-0.5 rounded shadow">
                      Curation Active
                    </span>
                    <span className="text-[10px] font-black uppercase bg-slate-900 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
                      {options.captionPlatform}
                    </span>
                    <span className="text-[10px] font-black uppercase bg-slate-900 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
                      {options.captionStyle.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 p-4 bg-slate-900/40 rounded-2xl border border-white/5">
                  <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest">Active Preferences</h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500">Caption Languages:</span>
                      <span className="text-slate-300">
                        {[options.captionsEnglish && "English", options.captionsTamil && "Tamil"].filter(Boolean).join(', ')}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500">Song Categories:</span>
                      <span className="text-slate-300">
                        {[
                          options.songsTamil && "Tamil", 
                          options.songsTamilChristian && "Tamil Christian",
                          options.songsEnglish && "English",
                          options.songsHindi && "Hindi"
                        ].filter(Boolean).join(', ')}
                      </span>
                    </div>
                    {options.songsTamil && (
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-500">Tamil Song Era:</span>
                        <span className="text-slate-300 bg-cyan-950/40 border border-cyan-500/20 px-2 rounded-md capitalize">
                          {options.songEra}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleClearImage();
                    setActiveStep(1);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/30 hover:bg-red-950/10 text-slate-400 hover:text-red-400 font-semibold text-sm transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Curation & Reset Deck</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Step Indicators */}
                <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-2xl border border-white/5 select-none">
                  {[
                    { number: 1, label: "Upload" },
                    { number: 2, label: "Captions" },
                    { number: 3, label: "Soundtrack" }
                  ].map((s) => {
                    const isActive = activeStep === s.number;
                    const isCompleted = activeStep > s.number;
                    return (
                      <div key={s.number} className="flex items-center gap-1.5 flex-1 justify-center first:justify-start last:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (s.number === 1 || (s.number === 2 && imagePreview) || (s.number === 3 && imagePreview && (options.captionsEnglish || options.captionsTamil))) {
                              setActiveStep(s.number);
                            }
                          }}
                          disabled={!imagePreview && s.number > 1}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border transition-all duration-300 ${
                            isActive 
                              ? 'bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 border-cyan-450 text-slate-950 shadow-glow-cyan/20 scale-105 cursor-pointer'
                              : isCompleted
                                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 cursor-pointer'
                                : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {isCompleted ? "✓" : s.number}
                        </button>
                        <span className={`text-[10px] font-black uppercase tracking-wider hidden sm:inline ${
                          isActive ? 'text-cyan-400 text-glow-cyan' : isCompleted ? 'text-slate-355' : 'text-slate-600'
                        }`}>
                          {s.label}
                        </span>
                        {s.number < 3 && <div className="h-0.5 bg-slate-850 flex-1 mx-1.5 rounded"></div>}
                      </div>
                    );
                  })}
                </div>

                {/* Step 1: Upload Media */}
                {activeStep === 1 && (
                  <div className="flex flex-col gap-5 animate-slide-in">
                    {/* Drag and Drop Zone */}
                    <div
                      ref={dragRef}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => !imagePreview && fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 min-h-[280px] relative overflow-hidden group ${
                        imagePreview 
                          ? 'border-cyan-500/20 bg-slate-950/20' 
                          : 'border-slate-800 hover:border-cyan-500/50 bg-slate-900/10 hover:bg-cyan-950/5'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                        className="hidden"
                      />

                      {imagePreview ? (
                        <div className="w-full h-full flex flex-col items-center gap-4 relative">
                          <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl max-h-[220px] w-full flex items-center justify-center bg-black/40">
                            <img 
                              src={imagePreview} 
                              alt="Uploaded Preview" 
                              className="object-contain max-h-[220px] w-full"
                            />
                          </div>
                          {/* Control Buttons */}
                          <div className="flex items-center gap-3 mt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-350 hover:text-slate-100 border border-slate-850 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Change Image</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearImage();
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-red-950/20 text-slate-400 hover:text-red-400 border border-slate-850 hover:border-red-500/20 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                          {imageFile && (
                            <div className="flex justify-between items-center w-full px-2">
                              <span className="text-xs text-slate-400 truncate max-w-[200px]">{imageFile.name}</span>
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                                {(imageFile.size / (1024 * 1024)).toFixed(2)} MB
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-4 rounded-full bg-cyan-950/20 border border-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                            <Upload className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-250">Drag & drop your image here</p>
                            <p className="text-xs text-slate-500 mt-1">Supports JPG, PNG, WebP</p>
                          </div>
                          <span className="mt-3 text-xs font-semibold px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-slate-100 transition-colors">
                            Select File
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sample Preset Images Section */}
                    {!imagePreview && (
                      <div className="animate-slide-in">
                        <span className="text-xs font-semibold text-slate-400 block mb-3">Or choose a sample image:</span>
                        <div className="grid grid-cols-3 gap-3">
                          {SAMPLE_IMAGES.map((sample) => (
                            <button
                              key={sample.id}
                              onClick={() => handleSelectSample(sample)}
                              disabled={loadingSample !== null}
                              className="group/btn relative rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-500/40 aspect-square flex flex-col justify-end p-2 transition-all duration-300 focus:outline-none hover:shadow-lg hover:shadow-cyan-900/10 cursor-pointer"
                            >
                              <img 
                                src={sample.url} 
                                alt={sample.name} 
                                className="absolute inset-0 object-cover w-full h-full brightness-50 group-hover/btn:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent"></div>
                              {loadingSample === sample.id ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10">
                                  <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                                </div>
                              ) : null}
                              <span className="relative z-10 text-[10px] font-bold text-slate-200 group-hover/btn:text-cyan-300 transition-colors truncate w-full text-left">
                                {sample.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {imagePreview && (
                      <button
                        type="button"
                        onClick={() => setActiveStep(2)}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 text-slate-950 font-black text-sm hover:opacity-95 shadow-lg shadow-cyan-600/20 active:scale-95 transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-[3px_3px_0px_#0891b2]"
                      >
                        <span>Configure Captions</span>
                        <span>→</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Step 2: Configure Captions */}
                {activeStep === 2 && (
                  <div className="flex flex-col gap-5 animate-slide-in">
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-4">
                      <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        Caption Preferences
                      </h3>
                      
                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-2">Captions & Quotes Language:</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-350 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={options.captionsEnglish}
                              onChange={(e) => setOptions({ ...options, captionsEnglish: e.target.checked })}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                            />
                            English
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-355 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={options.captionsTamil}
                              onChange={(e) => setOptions({ ...options, captionsTamil: e.target.checked })}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                            />
                            Tamil
                          </label>
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-2">Caption Length / Format:</span>
                        <select
                          value={options.captionStyle}
                          onChange={(e) => setOptions({ ...options, captionStyle: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all cursor-pointer font-medium"
                        >
                          <option value="one_line">1 Line Caption (Clean & descriptive)</option>
                          <option value="two_lines">2 Lines Caption (Engaging & detailed)</option>
                          <option value="three_words">3 Words Caption (Minimalist & aesthetic)</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-2">Target Social Platform:</span>
                        <select
                          value={options.captionPlatform}
                          onChange={(e) => setOptions({ ...options, captionPlatform: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all cursor-pointer font-medium"
                        >
                          <option value="post">Instagram Post (Standard, storytelling, rich hashtags)</option>
                          <option value="story">Instagram Story (Short, punchy aesthetic overlays)</option>
                          <option value="reel">Instagram Reel (Viewer hook, retention description, CTA)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveStep(1)}
                        className="flex-1 py-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-[3px_3px_0px_rgba(255,255,255,0.05)]"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!options.captionsEnglish && !options.captionsTamil) {
                            showToast('Please select at least one language for captions.', 'error');
                            return;
                          }
                          setActiveStep(3);
                        }}
                        className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 text-slate-950 font-black text-sm hover:opacity-95 shadow-lg active:scale-95 transition-all duration-300 cursor-pointer shadow-[3px_3px_0px_#0891b2]"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Configure Music */}
                {activeStep === 3 && (
                  <div className="flex flex-col gap-5 animate-slide-in">
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-4">
                      <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
                        <Music className="w-4 h-4 text-cyan-400 animate-pulse" />
                        Soundtrack Preferences
                      </h3>

                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-2">Song Playlists Language / Category:</span>
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-350 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={options.songsTamil}
                              onChange={(e) => setOptions({ ...options, songsTamil: e.target.checked })}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                            />
                            Tamil
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-350 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={options.songsTamilChristian}
                              onChange={(e) => setOptions({ ...options, songsTamilChristian: e.target.checked })}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                            />
                            Tamil Christian
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-350 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={options.songsEnglish}
                              onChange={(e) => setOptions({ ...options, songsEnglish: e.target.checked })}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                            />
                            English
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-350 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={options.songsHindi}
                              onChange={(e) => setOptions({ ...options, songsHindi: e.target.checked })}
                              className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                            />
                            Hindi
                          </label>
                        </div>
                      </div>

                      {options.songsTamil ? (
                        <div className="animate-slide-in">
                          <span className="text-xs text-slate-400 font-medium block mb-2">Tamil Song Era / Generation:</span>
                          <select
                            value={options.songEra}
                            onChange={(e) => setOptions({ ...options, songEra: e.target.value })}
                            className="w-full bg-slate-905 border border-slate-800 hover:border-slate-700 text-slate-205 text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all cursor-pointer font-medium"
                          >
                            <option value="latest">Latest Hits (2010 to Present Year)</option>
                            <option value="2010s">2010s Hits (2010 to Present Year - Throwbacks)</option>
                            <option value="2000s">2000s Hits (2000 to Present Year Classics)</option>
                            <option value="90s">90s Hits (Before 2000, 1990 - 1999)</option>
                            <option value="80s">80s Retro (Before 1990, 1980 - 1989)</option>
                          </select>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic bg-slate-950/20 p-3.5 rounded-xl border border-white/5">
                          Tamil Song Era selection is only active when Tamil soundtrack curations are enabled.
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveStep(2)}
                        className="py-3.5 px-5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-[3px_3px_0px_rgba(255,255,255,0.05)]"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={loadingStep !== null || !imageFile}
                        className={`flex-1 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 cursor-pointer shadow-xl transition-all duration-350 shadow-[3px_3px_0px_#0891b2] ${
                          imageFile && loadingStep === null
                            ? 'bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 text-slate-950 hover:opacity-95 shadow-cyan-600/25 hover:shadow-cyan-600/35 hover:-translate-y-0.5 active:scale-95'
                            : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {loadingStep ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            <span>Analyze Vibe ✨</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Results & Animation Area */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          {/* Loading States */}
          {loadingStep && (
            <div className="glass-panel p-8 md:p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-8 min-h-[450px] animate-slide-in border border-cyan-500/20 bg-gradient-to-b from-slate-900/60 to-slate-950/80 shadow-glow-cyan/5">
              {/* Spinning Disc with Pulse Rings */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-32 h-32 rounded-full bg-cyan-500/10 animate-ping duration-1000"></div>
                <div className="absolute w-28 h-28 rounded-full bg-teal-500/5 animate-pulse duration-700"></div>
                <div className="w-24 h-24 rounded-full border-4 border-slate-800 border-t-cyan-400 border-r-pink-400 animate-spin flex items-center justify-center bg-slate-950">
                  <Disc className="w-10 h-10 text-cyan-400 animate-spin-slow" />
                </div>
              </div>
              
              <div className="flex flex-col gap-6 max-w-md w-full">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl font-bold text-slate-100 text-glow-cyan">
                    {loadingStatus}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Your photo's aesthetic is being analyzed across multiple AI models.
                  </p>
                </div>

                {/* Steps Checklist */}
                <div className="flex flex-col gap-2.5 text-left bg-slate-950/40 p-4.5 rounded-2xl border border-white/5">
                  {[
                    { key: "Analyzing visual aesthetic and tone...", label: "Visual Tone & Aesthetic Analysis" },
                    { key: "Running visual mood and theme analysis...", label: "Visual Mood & Theme Extraction" },
                    { key: "Generating captions and song matches...", label: "Social Media Caption Styling" },
                    { key: "Aligning playlist track selections...", label: "Curating Music Playlist Recommendations" },
                    { key: "Assembling final curation payload...", label: "Assembling Final Curation Package" }
                  ].map((step, idx) => {
                    const statusList = [
                      "Analyzing visual aesthetic and tone...",
                      "Running visual mood and theme analysis...",
                      "Generating captions and song matches...",
                      "Aligning playlist track selections...",
                      "Assembling final curation payload..."
                    ];
                    const currentIdx = statusList.indexOf(loadingStatus);
                    const isCompleted = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    
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
                            ? 'text-slate-400 line-through decoration-slate-600/40'
                            : isCurrent
                              ? 'text-cyan-300 font-bold text-glow-cyan animate-pulse-soft'
                              : 'text-slate-500'
                        }`}>
                          {step.label}
                        </span>
                        {isCurrent && (
                          <span className="flex h-2 w-2 relative ml-auto">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Prompt State when no results and not loading */}
          {!loadingStep && !results && (
            <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-4 min-h-[400px] border-dashed border-slate-800/80 bg-slate-950/5 animate-slide-in">
              <div className="p-5 rounded-full bg-slate-900 border border-slate-800 text-slate-500">
                <Sparkles className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-300">Ready for Curation</h3>
                <p className="text-sm text-slate-500 max-w-sm mt-2">
                  Upload an image, set your curation preferences, and hit "Analyze Vibe" to generate social captions and custom music recommendations.
                </p>
              </div>
            </div>
          )}

          {/* Results Render Area */}
          {!loadingStep && results && (
            <div className="grid grid-cols-1 gap-6 animate-slide-in">
              {/* 3D Music Visualizer & Deck */}
              <div className="glass-panel p-6 rounded-3xl flex flex-col sm:flex-row items-center gap-6 border-2 border-cyan-500/30 bg-slate-950/70 shadow-[0_20px_50px_rgba(6,182,212,0.15),inset_0_2px_4px_rgba(255,255,255,0.05)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/5 rounded-full blur-3xl pointer-events-none"></div>
                
                {/* 3D Spinning Record Player Graphic */}
                <div className="relative w-36 h-36 shrink-0 flex items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 shadow-[4px_4px_0px_#0891b2] p-2">
                  <div className="absolute top-2 left-2 text-[9px] font-mono text-cyan-500 font-bold uppercase tracking-wider">A-SIDE</div>
                  <div className="absolute bottom-2 right-2 text-[9px] font-mono text-pink-500 font-bold uppercase tracking-wider">STEREO</div>
                  
                  {/* Vinyl Record */}
                  <div 
                    className={`w-28 h-28 rounded-full bg-slate-950 border-4 border-slate-800 flex items-center justify-center relative shadow-[inset_0_0_20px_rgba(0,0,0,0.9),0_10px_20px_rgba(0,0,0,0.5)] ${playingTrackUrl ? 'animate-spin' : 'animate-spin-slow'}`} 
                    style={{ animationDuration: playingTrackUrl ? '3s' : '15s' }}
                  >
                    {/* Vinyl grooves */}
                    <div className="absolute inset-2 rounded-full border border-slate-900/60"></div>
                    <div className="absolute inset-4 rounded-full border border-slate-900/60"></div>
                    <div className="absolute inset-6 rounded-full border border-slate-900/60"></div>
                    <div className="absolute inset-8 rounded-full border border-slate-900/60"></div>
                    
                    {/* Center Label */}
                    <div className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center border-2 border-slate-950 shadow-inner">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-950"></div>
                    </div>
                  </div>
                  
                  {/* Stylus needle */}
                  <div 
                    className={`absolute top-3 right-3 w-1.5 h-12 bg-slate-400 origin-top transform transition-transform duration-500 ${playingTrackUrl ? 'rotate-[25deg]' : 'rotate-0'}`} 
                    style={{ borderRadius: '4px' }}
                  >
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-slate-300 rounded-sm border border-slate-500"></div>
                  </div>
                </div>
                
                {/* Deck metadata & visualizer bars */}
                <div className="flex-1 flex flex-col gap-3.5 w-full">
                  <div>
                    <span className="text-[10px] uppercase font-extrabold tracking-wider bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-400">
                      SAM GENZ Deck v1.0
                    </span>
                    <h3 className="text-xl font-black text-slate-100 mt-2 text-glow-cyan">
                      {playingTrackUrl ? "NOW PLAYING PREVIEW" : "I DESCRIBED YOUR PICTURE"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium truncate">
                      {playingTrackUrl 
                        ? "Pulsing audio frequencies aligned with your visual aesthetic."
                        : "Select any song below to load into the synthesizer deck."}
                    </p>
                  </div>
                  
                  {/* Glowing 3D visualizer bars */}
                  <div className="h-10 flex items-end gap-1 bg-slate-900/50 p-2 rounded-xl border border-white/5 shadow-inner">
                    {Array.from({ length: 24 }).map((_, idx) => {
                      const randomDelays = ["0.1s", "0.3s", "0.5s", "0.2s", "0.4s", "0.6s"];
                      const delay = randomDelays[idx % randomDelays.length];
                      return (
                        <div 
                          key={idx} 
                          className={`flex-1 rounded-t-sm transition-all duration-300 ${
                            playingTrackUrl 
                              ? 'bg-gradient-to-t from-cyan-500 to-pink-500 animate-visualizer-bar' 
                              : 'bg-slate-800 h-1.5'
                          }`}
                          style={{ 
                            animationDelay: delay,
                            height: playingTrackUrl ? undefined : '6px'
                          }}
                        ></div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {results._modelUsed && (
                <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-cyan-500/20 bg-cyan-950/10 shadow-[2px_2px_0px_#06b6d4]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span className="text-xs text-slate-300 font-medium">Curated by AI Engine:</span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1 rounded-full shadow-glow-cyan">
                    {results._modelUsed}
                  </span>
                </div>
              )}

              {results.lookDescription && (
                <div className="glass-panel p-6 rounded-3xl flex flex-col gap-3 border-2 border-pink-500/40 bg-slate-950/70 shadow-[6px_6px_0px_rgba(236,72,153,0.3)]">
                  <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-pink-400" />
                    Subject's Style & Look ("Gloss")
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {results.lookDescription}
                  </p>
                </div>
              )}
              
              {/* Captions Block */}
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-2 border-cyan-500/30 bg-slate-950/70 shadow-[6px_6px_0px_rgba(6,182,212,0.3)]">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  Social Media Captions & Quotes
                </h3>
                
                {/* English Captions */}
                {options.captionsEnglish && results.captionsEnglish && results.captionsEnglish.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block mt-2">English</span>
                    {results.captionsEnglish.map((caption, idx) => {
                      const styles = ["✨ Vibe", "🔮 Poetry", "🎯 Punchy"];
                      return (
                        <div key={`en-${idx}`} className="bg-slate-950/35 border border-white/5 rounded-2xl p-4 flex items-start gap-4 hover:border-cyan-500/20 transition-all duration-300">
                          <div className="flex flex-col gap-1 shrink-0">
                            <span className="text-[10px] font-bold text-cyan-400/80 uppercase tracking-widest">
                              {styles[idx] || "Caption"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-200 leading-relaxed flex-1 pt-0.5 select-all">
                            {caption}
                          </p>
                          <button
                            onClick={() => copyToClipboard(caption, 'caption', `en-${idx}`)}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all shrink-0 active:scale-95 cursor-pointer"
                            title="Copy Caption"
                          >
                            {copiedCaptionIndex === `en-${idx}` ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tamil Captions */}
                {options.captionsTamil && results.captionsTamil && results.captionsTamil.length > 0 && (
                  <div className="flex flex-col gap-3 mt-4">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">Tamil</span>
                    {results.captionsTamil.map((caption, idx) => {
                      const styles = ["✨ Vibe", "🔮 Poetry", "🎯 Punchy"];
                      return (
                        <div key={`ta-${idx}`} className="bg-slate-950/35 border border-white/5 rounded-2xl p-4 flex items-start gap-4 hover:border-cyan-500/20 transition-all duration-300">
                          <div className="flex flex-col gap-1 shrink-0">
                            <span className="text-[10px] font-bold text-cyan-400/80 uppercase tracking-widest">
                              {styles[idx] || "Caption"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-200 leading-relaxed flex-1 pt-0.5 select-all">
                            {caption}
                          </p>
                          <button
                            onClick={() => copyToClipboard(caption, 'caption', `ta-${idx}`)}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all shrink-0 active:scale-95 cursor-pointer"
                            title="Copy Caption"
                          >
                            {copiedCaptionIndex === `ta-${idx}` ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {results.captionExplanation && (
                  <div className="mt-4 p-4 rounded-2xl bg-cyan-950/10 border border-cyan-500/10 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-cyan-400 font-semibold block mb-0.5">Vibe Analysis:</strong>
                      {results.captionExplanation}
                    </div>
                  </div>
                )}
              </div>

              {/* Hashtags Block */}
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-2 border-slate-800 bg-slate-950/70 shadow-[6px_6px_0px_rgba(59,130,246,0.3)]">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                    <span className="text-cyan-400 font-mono">#</span>
                    Trending Hashtags
                  </h3>
                  <button
                    onClick={() => copyToClipboard(results.hashtags?.join(' '), 'hashtags')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-300 border border-cyan-500/20 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                  >
                    {copiedHashtags ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied All</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2 p-3 bg-slate-950/20 rounded-2xl border border-white/5">
                  {results.hashtags?.map((tag, idx) => (
                    <span 
                      key={idx} 
                      className="text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 transition-all duration-300 select-all cursor-pointer"
                    >
                      {tag.startsWith('#') ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>
              </div>

              {/* Song Playlists Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Tamil Songs Playlist */}
                {options.songsTamil && results.songsTamil && results.songsTamil.length > 0 && (
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-2 border-cyan-500/30 bg-slate-950/70 shadow-[6px_6px_0px_rgba(6,182,212,0.3)]">
                    <h3 className="text-base font-black text-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Music className="w-5 h-5 text-cyan-400" />
                        Tamil Curations
                      </span>
                      <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider bg-cyan-950/30 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                        Tamil
                      </span>
                    </h3>
                    
                    <div className="flex flex-col gap-3">
                      {results.songsTamil.map((song, idx) => renderSongItem(song, idx))}
                    </div>
                  </div>
                )}

                {/* Tamil Christian Songs Playlist */}
                {options.songsTamilChristian && results.songsTamilChristian && results.songsTamilChristian.length > 0 && (
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-2 border-emerald-500/30 bg-slate-950/70 shadow-[6px_6px_0px_rgba(16,185,129,0.3)]">
                    <h3 className="text-base font-black text-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Music className="w-5 h-5 text-emerald-400" />
                        Tamil Christian Curations
                      </span>
                      <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider bg-emerald-950/30 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        Christian (Tamil)
                      </span>
                    </h3>
                    
                    <div className="flex flex-col gap-3">
                      {results.songsTamilChristian.map((song, idx) => renderSongItem(song, idx))}
                    </div>
                  </div>
                )}

                {/* English Songs Playlist */}
                {options.songsEnglish && results.songsEnglish && results.songsEnglish.length > 0 && (
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-2 border-blue-500/30 bg-slate-950/70 shadow-[6px_6px_0px_rgba(59,130,246,0.3)]">
                    <h3 className="text-base font-black text-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Music className="w-5 h-5 text-blue-400" />
                        English Curations
                      </span>
                      <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider bg-blue-950/30 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        English
                      </span>
                    </h3>
                    
                    <div className="flex flex-col gap-3">
                      {results.songsEnglish.map((song, idx) => renderSongItem(song, idx))}
                    </div>
                  </div>
                )}

                {/* Hindi Songs Playlist */}
                {options.songsHindi && results.songsHindi && results.songsHindi.length > 0 && (
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-2 border-teal-500/30 bg-slate-950/70 shadow-[6px_6px_0px_rgba(20,184,166,0.3)]">
                    <h3 className="text-base font-black text-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Music className="w-5 h-5 text-teal-400" />
                        Hindi Curations
                      </span>
                      <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider bg-teal-950/30 border border-teal-500/20 px-2 py-0.5 rounded-full">
                        Hindi
                      </span>
                    </h3>
                    
                    <div className="flex flex-col gap-3">
                      {results.songsHindi.map((song, idx) => renderSongItem(song, idx))}
                    </div>
                  </div>
                )}

              </div>

              {results.songExplanation && (
                <div className="glass-panel p-6 rounded-3xl flex flex-col gap-3 bg-cyan-950/10 border border-cyan-500/10">
                  <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Music className="w-4 h-4 text-cyan-400 animate-pulse" />
                    Visual Soundtrack Rationale
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {results.songExplanation}
                  </p>
                </div>
              )}

              {/* Reset CTA */}
              <div className="flex justify-center mt-2 animate-slide-in">
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="px-8 py-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 hover:bg-slate-800/40 text-slate-300 hover:text-slate-100 font-semibold text-sm transition-all duration-300 active:scale-95 shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin-slow" />
                  <span>Reset & Analyze Another Image</span>
                </button>
              </div>

            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-8 mt-12 border-t border-white/5 z-10">
        <p className="text-xs text-slate-600 flex items-center justify-center gap-1.5">
          <span>Powered by Free Gemini, Groq & OpenRouter APIs.</span>
        </p>
      </footer>
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
