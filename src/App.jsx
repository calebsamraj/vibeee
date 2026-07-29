import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Image as ImageIcon, Music, 
  Copy, Check, RefreshCw, Sparkles, 
  Trash2, Play, Disc
} from 'lucide-react';
import { queryWithFallback } from './utils/PuterApi';
import { fetchSongDetails } from './utils/MusicApi';
import ThreeBackground from './components/ThreeBackground';
import Toast from './components/Toast';

const SAMPLE_IMAGES = [
  {
    id: 'cyberpunk-city',
    name: 'Neon Cyberpunk',
    url: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?w=600&auto=format&fit=crop&q=80',
    description: 'A glowing futuristic city street with neon signs'
  },
  {
    id: 'nature-sunset',
    name: 'Serene Sunset',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=80',
    description: 'A beautiful valley with mountains and sunset glow'
  },
  {
    id: 'retro-cafe',
    name: 'Cozy Cafe',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop&q=80',
    description: 'A warm cozy cafe interior with vintage details'
  }
];

export default function App() {
  const [apiKey] = useState(() => {
    return import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  
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
    songsHindi: true
  });
  
  const [songMetadata, setSongMetadata] = useState({});
  const [playingTrackUrl, setPlayingTrackUrl] = useState(null);
  
  const [toast, setToast] = useState(null);
  const [copiedCaptionIndex, setCopiedCaptionIndex] = useState(null);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const audioRef = useRef(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);
  
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
      const response = await fetch(sample.url);
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
      const curatedData = await queryWithFallback(imageFile, apiKey, options, setLoadingStatus);
      
      setLoadingStatus('Fetching official artwork and audio previews...');
      const songsList = [
        ...(curatedData.songsTamil || []),
        ...(curatedData.songsEnglish || []),
        ...(curatedData.songsHindi || [])
      ];

      const metadataDict = {};
      await Promise.all(
        songsList.map(async (song) => {
          const details = await fetchSongDetails(song);
          metadataDict[song] = details;
        })
      );

      setSongMetadata(metadataDict);
      setResults(curatedData);
      showToast('Visual curation completed successfully!', 'success');
    } catch (err) {
      console.error('Workflow error:', err);
      showToast(err.message || 'An error occurred during processing.', 'error');
    } finally {
      setLoadingStep(null);
      setLoadingStatus('');
    }
  };

  const togglePlay = (previewUrl) => {
    if (!previewUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.onended = () => {
        setPlayingTrackUrl(null);
      };
    }

    if (playingTrackUrl === previewUrl) {
      audioRef.current.pause();
      setPlayingTrackUrl(null);
    } else {
      audioRef.current.pause();
      audioRef.current.src = previewUrl;
      audioRef.current.load();
      audioRef.current.play().catch(e => {
        console.warn("Playback blocked by browser autoplay rules:", e);
        showToast("Audio playback blocked. Interact with the page to play.", "warning");
      });
      setPlayingTrackUrl(previewUrl);
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
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Album artwork container */}
          <div 
            onClick={() => hasPreview && togglePlay(meta.previewUrl)}
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
          
          <div className="min-w-0">
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
          {hasPreview && (
            <button
              onClick={() => togglePlay(meta.previewUrl)}
              className={`p-2 rounded-xl border transition-all text-xs font-semibold cursor-pointer ${
                isCurrentPlaying 
                  ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
              }`}
              title={isCurrentPlaying ? "Pause Preview" : "Play Preview"}
            >
              {isCurrentPlaying ? "Pause" : "Preview"}
            </button>
          )}
          <a 
            href={meta.trackViewUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 transition-colors shrink-0"
            title={meta.trackViewUrl ? "Listen on Apple Music" : "Listen on YouTube"}
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
            AI Image Captioner, Hashtag Generator & Cross-Language Music Curator (Powered by Free Puter Fallbacks)
          </p>
        </div>
      </header>

      {/* Main Grid Area */}
      <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 z-10 flex-1">
        {/* Left Side: Upload & Control Panel */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-6">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-cyan-400" />
              Upload Image
            </h2>

            {/* Drag and Drop Zone */}
            <div
              ref={dragRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !imagePreview && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 min-h-[300px] relative overflow-hidden group ${
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
                <div className="w-full h-full flex flex-col items-center gap-4 animate-slide-in relative group/img">
                  <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl max-h-[320px] w-full flex items-center justify-center bg-black/40">
                    <img 
                      src={imagePreview} 
                      alt="Uploaded Preview" 
                      className="object-contain max-h-[320px] w-full"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl shadow-lg transition-transform hover:scale-105 cursor-pointer"
                        title="Replace Image"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearImage();
                        }}
                        className="p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg transition-transform hover:scale-105 cursor-pointer"
                        title="Delete Image"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
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
                    <p className="text-sm font-semibold text-slate-200">Drag & drop your image here</p>
                    <p className="text-xs text-slate-500 mt-1">Supports JPG, PNG, WebP</p>
                  </div>
                  <button
                    type="button"
                    className="mt-3 text-xs font-semibold px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
                  >
                    Select File
                  </button>
                </div>
              )}
            </div>

            {/* Sample Image Section */}
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

            {/* Curation Options */}
            {imagePreview && (
              <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-4 animate-slide-in">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Curation Preferences
                </h3>
                
                <div>
                  <span className="text-xs text-slate-400 font-medium block mb-2">Captions & Quotes Language:</span>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={options.captionsEnglish}
                        onChange={(e) => setOptions({ ...options, captionsEnglish: e.target.checked })}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                      />
                      English
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
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
                  <span className="text-xs text-slate-400 font-medium block mb-2">Song Playlists Language:</span>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={options.songsTamil}
                        onChange={(e) => setOptions({ ...options, songsTamil: e.target.checked })}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                      />
                      Tamil
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={options.songsEnglish}
                        onChange={(e) => setOptions({ ...options, songsEnglish: e.target.checked })}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20 bg-slate-900 w-4 h-4 cursor-pointer"
                      />
                      English
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
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
              </div>
            )}

            {/* Analyze Trigger */}
            <button
              onClick={handleAnalyze}
              disabled={loadingStep !== null || !imageFile}
              className={`w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xl transition-all duration-300 ${
                imageFile && loadingStep === null
                  ? 'bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 text-white hover:opacity-95 shadow-cyan-600/25 hover:shadow-cyan-600/35 hover:-translate-y-0.5'
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
                  <span>Analyze Vibe</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right Side: Results & Animation Area */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          {/* Loading States */}
          {loadingStep && (
            <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-6 min-h-[400px] animate-slide-in">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-slate-800 border-t-cyan-500 border-r-teal-500 animate-spin"></div>
                <Disc className="w-10 h-10 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin-slow" />
              </div>
              <div className="flex flex-col gap-2 max-w-sm">
                <h3 className="text-lg font-semibold text-slate-100">
                  {loadingStatus}
                </h3>
                <p className="text-sm text-slate-400">
                  Analyzing image features, styling social captions, and curating your custom playlist across languages.
                </p>
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
              
              {/* Captions Block */}
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
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
              </div>

              {/* Hashtags Block */}
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
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
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-l-2 border-l-cyan-500/40">
                    <h3 className="text-base font-bold text-slate-200 flex items-center justify-between">
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

                {/* English Songs Playlist */}
                {options.songsEnglish && results.songsEnglish && results.songsEnglish.length > 0 && (
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-l-2 border-l-blue-500/40">
                    <h3 className="text-base font-bold text-slate-200 flex items-center justify-between">
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
                  <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-l-2 border-l-teal-500/40">
                    <h3 className="text-base font-bold text-slate-200 flex items-center justify-between">
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

            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-8 mt-12 border-t border-white/5 z-10">
        <p className="text-xs text-slate-600 flex items-center justify-center gap-1.5">
          <span>Runs client-side. Powered by Free Puter AI Gateways.</span>
        </p>
      </footer>
    </div>
  );
}
