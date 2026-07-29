import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, Key, Eye, EyeOff, Music, 
  Copy, Check, RefreshCw, AlertCircle, Sparkles, HelpCircle, 
  Trash2, Play, Disc, ArrowRight
} from 'lucide-react';
import { queryGeminiModel } from './utils/GeminiApi';
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
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('vibelens_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [showKey, setShowKey] = useState(false);
  const [isKeySaved, setIsKeySaved] = useState(!!localStorage.getItem('vibelens_gemini_api_key') || !!import.meta.env.VITE_GEMINI_API_KEY);
  
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loadingSample, setLoadingSample] = useState(null);
  
  const [loadingStep, setLoadingStep] = useState(null); // 'gemini' | null
  const [results, setResults] = useState(null);
  
  const [toast, setToast] = useState(null);
  const [copiedCaptionIndex, setCopiedCaptionIndex] = useState(null);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  
  const showToast = (message, type = 'error') => {
    setToast({ message, type });
  };

  const handleSaveKey = (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      showToast('Please enter a valid API Key.', 'error');
      return;
    }
    localStorage.setItem('vibelens_gemini_api_key', apiKey.trim());
    setIsKeySaved(true);
    showToast('Gemini API Key saved successfully.', 'success');
  };

  const handleClearKey = () => {
    localStorage.removeItem('vibelens_gemini_api_key');
    setApiKey('');
    setIsKeySaved(false);
    showToast('Gemini API Key disconnected.', 'info');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.add('border-purple-500', 'bg-purple-950/10');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.remove('border-purple-500', 'bg-purple-950/10');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.remove('border-purple-500', 'bg-purple-950/10');
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
    
    // Revoke previous local object URL to prevent memory leaks
    if (imagePreview && !imagePreview.startsWith('http')) {
      URL.revokeObjectURL(imagePreview);
    }
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setResults(null);
  };

  const handleSelectSample = async (sample) => {
    setLoadingSample(sample.id);
    try {
      const response = await fetch(sample.url);
      const blob = await response.blob();
      const file = new File([blob], `${sample.id}.jpg`, { type: 'image/jpeg' });
      
      setImageFile(file);
      setImagePreview(sample.url);
      setResults(null);
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
    setImageFile(null);
    setImagePreview('');
    setResults(null);
  };

  const handleAnalyze = async () => {
    if (!apiKey.trim()) {
      showToast('Please enter your Gemini API Key first.', 'error');
      return;
    }
    if (!imageFile) {
      showToast('Please upload or select an image to analyze.', 'error');
      return;
    }

    setLoadingStep('gemini');
    setResults(null);
    
    try {
      // Direct multimodal Gemini call
      const curatedData = await queryGeminiModel(imageFile, apiKey.trim());
      setResults(curatedData);
      showToast('Visual curation completed successfully!', 'success');
    } catch (err) {
      console.error('Workflow error:', err);
      showToast(err.message || 'An error occurred during processing.', 'error');
    } finally {
      setLoadingStep(null);
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

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 md:px-8 max-w-7xl mx-auto w-full relative">
      {/* Background Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none animate-pulse-soft"></div>
      <div className="absolute bottom-[10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-900/10 blur-[120px] pointer-events-none animate-pulse-soft" style={{ animationDelay: '1.5s' }}></div>

      {/* Toast Alert */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Header & Token Auth Section */}
      <header className="w-full flex flex-col md:flex-row justify-between items-center gap-6 mb-12 pb-6 border-b border-white/5 z-10">
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 via-violet-300 to-blue-400 bg-clip-text text-transparent text-glow-purple">
              VibeLens
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-md">
            AI Image Captioner, Hashtag Generator & Cross-Language Music Curator (Powered by Gemini)
          </p>
        </div>

        {/* Gemini API Key Panel */}
        <form onSubmit={handleSaveKey} className="glass-panel px-4 py-3 rounded-2xl flex items-center gap-3 w-full md:w-auto max-w-md">
          <div className="text-purple-400">
            <Key className="w-5 h-5" />
          </div>
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter Gemini API Key"
              disabled={isKeySaved}
              className="bg-transparent text-sm border-none focus:outline-none focus:ring-0 text-slate-200 placeholder:text-slate-500 w-full pr-8 py-0.5"
            />
            {apiKey && !isKeySaved && (
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          {isKeySaved ? (
            <button
              type="button"
              onClick={handleClearKey}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/40 border border-red-500/20 transition-all cursor-pointer shrink-0"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="submit"
              className="text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 transition-all cursor-pointer shrink-0"
            >
              Connect
            </button>
          )}
        </form>
      </header>

      {/* Main Grid Area */}
      <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 z-10 flex-1">
        {/* Left Side: Upload & Control Panel */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-6">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-400" />
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
                  ? 'border-purple-500/20 bg-slate-950/20' 
                  : 'border-slate-800 hover:border-purple-500/50 bg-slate-900/10 hover:bg-purple-950/5'
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
                        className="p-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-lg transition-transform hover:scale-105"
                        title="Replace Image"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearImage();
                        }}
                        className="p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg transition-transform hover:scale-105"
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
                  <div className="p-4 rounded-full bg-purple-950/20 border border-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform duration-300 shadow-inner">
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
                      className="group/btn relative rounded-xl overflow-hidden border border-slate-800 hover:border-purple-500/40 aspect-square flex flex-col justify-end p-2 transition-all duration-300 focus:outline-none hover:shadow-lg hover:shadow-purple-900/10"
                    >
                      <img 
                        src={sample.url} 
                        alt={sample.name} 
                        className="absolute inset-0 object-cover w-full h-full brightness-50 group-hover/btn:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent"></div>
                      {loadingSample === sample.id ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10">
                          <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                        </div>
                      ) : null}
                      <span className="relative z-10 text-[10px] font-bold text-slate-200 group-hover/btn:text-purple-300 transition-colors truncate w-full text-left">
                        {sample.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Analyze Trigger */}
            <button
              onClick={handleAnalyze}
              disabled={loadingStep !== null || !imageFile}
              className={`w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xl transition-all duration-300 ${
                imageFile && loadingStep === null
                  ? 'bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 text-white hover:opacity-95 shadow-purple-600/25 hover:shadow-purple-600/35 hover:-translate-y-0.5'
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
                {/* Rotating colored gradient loader ring */}
                <div className="w-24 h-24 rounded-full border-4 border-slate-800 border-t-purple-500 border-r-blue-500 animate-spin"></div>
                <Disc className="w-10 h-10 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin-slow" />
              </div>
              <div className="flex flex-col gap-2 max-w-sm">
                <h3 className="text-lg font-semibold text-slate-100">
                  Curating vibe with Gemini AI...
                </h3>
                <p className="text-sm text-slate-400">
                  Our multimodal AI is processing the image pixels directly to write creative social captions and curate cross-language song playlists in real time.
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
                  Upload an image and hit "Analyze Vibe" to generate social captions and custom song recommendation playlists using Gemini.
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
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  Social Media Captions
                </h3>
                
                <div className="flex flex-col gap-3">
                  {results.captions?.map((caption, idx) => {
                    const styles = ["✨ Vibe", "🔮 Poetry", "🎯 Punchy"];
                    return (
                      <div key={idx} className="bg-slate-950/35 border border-white/5 rounded-2xl p-4 flex items-start gap-4 hover:border-purple-500/20 transition-all duration-300">
                        <div className="flex flex-col gap-1 shrink-0">
                          <span className="text-[10px] font-bold text-purple-400/80 uppercase tracking-widest">
                            {styles[idx] || "Caption"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed flex-1 pt-0.5 select-all">
                          {caption}
                        </p>
                        <button
                          onClick={() => copyToClipboard(caption, 'caption', idx)}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all shrink-0 active:scale-95"
                          title="Copy Caption"
                        >
                          {copiedCaptionIndex === idx ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hashtags Block */}
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <span className="text-purple-400 font-mono">#</span>
                    Trending Hashtags
                  </h3>
                  <button
                    onClick={() => copyToClipboard(results.hashtags?.join(' '), 'hashtags')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-500/20 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
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
                      className="text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-purple-300 hover:border-purple-500/30 transition-all duration-300 select-all cursor-pointer"
                    >
                      {tag.startsWith('#') ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>
              </div>

              {/* Song Playlists Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Tamil Songs Playlist */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-l-2 border-l-red-500/40">
                  <h3 className="text-base font-bold text-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Music className="w-5 h-5 text-red-400" />
                      Tamil Curations
                    </span>
                    <span className="text-[10px] uppercase font-bold text-red-400 tracking-wider bg-red-950/30 border border-red-500/20 px-2 py-0.5 rounded-full">
                      Regional
                    </span>
                  </h3>
                  
                  <div className="flex flex-col gap-3">
                    {results.tamilSongs?.map((song, idx) => {
                      const [title, artist] = song.split(' - ');
                      return (
                        <div 
                          key={idx} 
                          className="group/song flex items-center justify-between p-3.5 bg-slate-950/30 hover:bg-slate-950/50 rounded-2xl border border-white/5 hover:border-red-500/20 transition-all duration-300"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/20 to-purple-600/20 border border-white/5 flex items-center justify-center shrink-0 relative overflow-hidden group-hover/song:shadow-md group-hover/song:shadow-red-500/10 transition-shadow">
                              <Disc className="w-5 h-5 text-red-400 group-hover/song:animate-spin-slow" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-200 truncate group-hover/song:text-red-300 transition-colors">
                                {title || song}
                              </p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {artist || "Unknown Artist"}
                              </p>
                            </div>
                          </div>
                          <a 
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-colors shrink-0"
                            title="Listen on YouTube"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Global Songs Playlist */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 border-l-2 border-l-blue-500/40">
                  <h3 className="text-base font-bold text-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Music className="w-5 h-5 text-blue-400" />
                      Global Curations
                    </span>
                    <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider bg-blue-950/30 border border-blue-500/20 px-2 py-0.5 rounded-full">
                      International
                    </span>
                  </h3>
                  
                  <div className="flex flex-col gap-3">
                    {results.globalSongs?.map((song, idx) => {
                      const [title, artist] = song.split(' - ');
                      return (
                        <div 
                          key={idx} 
                          className="group/song flex items-center justify-between p-3.5 bg-slate-950/30 hover:bg-slate-950/50 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all duration-300"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-white/5 flex items-center justify-center shrink-0 relative overflow-hidden group-hover/song:shadow-md group-hover/song:shadow-blue-500/10 transition-shadow">
                              <Disc className="w-5 h-5 text-blue-400 group-hover/song:animate-spin-slow" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-200 truncate group-hover/song:text-blue-300 transition-colors">
                                {title || song}
                              </p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {artist || "Unknown Artist"}
                              </p>
                            </div>
                          </div>
                          <a 
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/30 text-slate-400 hover:text-blue-400 transition-colors shrink-0"
                            title="Listen on YouTube"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-8 mt-12 border-t border-white/5 z-10">
        <p className="text-xs text-slate-600 flex items-center justify-center gap-1.5">
          <span>Runs fully client-side. Powered by Google Gemini AI.</span>
        </p>
      </footer>
    </div>
  );
}
