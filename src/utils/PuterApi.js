/**
 * Puter API utility: Frontend API adapter and client-side Puter keyless fallback.
 */

// Helper to convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// Clean markdown blocks and parse JSON
function cleanAndParseJson(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON:", cleaned);
    throw new Error(`AI returned invalid JSON: ${e.message}`);
  }
}

// Browser-side keyless Puter call
async function queryPuterModel(dataUrl, prompt, modelName) {
  if (!window.puter) {
    throw new Error("Puter SDK is not loaded. Make sure the script is loaded.");
  }

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }
  ];

  const response = await window.puter.ai.chat(messages, { model: modelName });
  
  let text = "";
  if (typeof response === 'string') {
    text = response;
  } else if (response && response.message && typeof response.message.content === 'string') {
    text = response.message.content;
  } else if (response && typeof response.text === 'string') {
    text = response.text;
  } else {
    text = JSON.stringify(response);
  }

  return text;
}

// Client-side keyless Puter fallback chain
async function runClientSidePuterFallback(base64Data, mimeType, options, onStatusChange) {
  const dataUrl = `data:${mimeType};base64,${base64Data}`;
  
  const selectedCaptionLangs = [];
  if (options.captionsEnglish) selectedCaptionLangs.push("English");
  if (options.captionsTamil) selectedCaptionLangs.push("Tamil");

  const selectedSongLangs = [];
  if (options.songsTamil) selectedSongLangs.push("Tamil");
  if (options.songsEnglish) selectedSongLangs.push("English");
  if (options.songsHindi) selectedSongLangs.push("Hindi");
  if (options.songsTamilChristian) selectedSongLangs.push("Tamil Christian");

  const systemPrompt = `You are a social media and music curation expert. Your task is to analyze the provided image and generate:
1. For each selected language for captions/quotes (${selectedCaptionLangs.join(', ')}):
   Generate 3 highly creative, engaging, and different styles of social media captions or quotes (e.g., one witty, one poetic/quote, one direct/engaging) in that language.
2. 5-8 relevant, trending hashtags (including standard ones and some specific to the vibe of the image).
3. For each selected language for songs (${selectedSongLangs.join(', ')}):
   Generate 2-3 song recommendations (Format: "Song Title - Artist") that specifically match the background vibe, visual atmosphere, setting, and aesthetic tone of the image (for example, if the background has cyberpunk/neon elements, recommend synthwave/electronic music; if it is a cozy indoor cafe setting, recommend lofi/acoustic/jazz; if it is an outdoor nature/sunset setting, recommend ambient/chill/indie music). If "Tamil Christian" is selected, recommend Christian worship/devotional songs in Tamil that match the serene, grateful, peaceful, or spiritual vibe of the setting.

Ensure that your response conforms strictly to this JSON format and contains nothing else (no markdown wrappers like \`\`\`json, just raw JSON text):
{
  "captionsEnglish": ["caption 1", "caption 2", "caption 3"],
  "captionsTamil": ["caption 1", "caption 2", "caption 3"],
  "hashtags": ["#tag1", "#tag2", ...],
  "songsTamil": ["Song Title - Artist", ...],
  "songsEnglish": ["Song Title - Artist", ...],
  "songsHindi": ["Song Title - Artist", ...],
  "songsTamilChristian": ["Song Title - Artist", ...]
}`;

  const fallbackModels = [
    { provider: 'Gemini 3.6', name: 'gemini-3.6-flash' },
    { provider: 'Gemini 3.5', name: 'gemini-3.5-flash' },
    { provider: 'OpenAI GPT-4o', name: 'gpt-4o-mini' },
    { provider: 'Kimi K3', name: 'moonshotai/kimi-k3' }
  ];

  let lastError = null;
  for (const model of fallbackModels) {
    try {
      if (onStatusChange) onStatusChange(`Switching to Free Puter API (${model.provider})...`);
      const resultText = await queryPuterModel(dataUrl, systemPrompt, model.name);
      if (resultText) {
        return cleanAndParseJson(resultText);
      }
    } catch (e) {
      console.warn(`Puter call with model ${model.name} failed:`, e);
      lastError = e;
    }
  }

  throw new Error(lastError?.message || "Puter fallback failed");
}

// Main exported adapter that delegates to the backend proxy
export async function queryWithFallback(imageFile, customKey, options, onStatusChange) {
  const base64Data = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  try {
    if (onStatusChange) onStatusChange("Connecting to VibeLens server...");
    
    const response = await fetch('/api/curate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: base64Data,
        mimeType,
        options
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return data.result;
      }
      
      // Backend returned error or explicitly instructed client-side Puter fallback
      if (data.usePuterFallback) {
        if (onStatusChange) onStatusChange("Primary API limits exhausted. Running final fallback...");
        return await runClientSidePuterFallback(base64Data, mimeType, options, onStatusChange);
      }
      throw new Error(data.message || "Server processed request but failed to return result");
    } else {
      const errText = await response.text();
      let errData = {};
      try { errData = JSON.parse(errText); } catch(e) {}
      
      if (errData.usePuterFallback) {
        if (onStatusChange) onStatusChange("Primary API limits exhausted. Running final fallback...");
        return await runClientSidePuterFallback(base64Data, mimeType, options, onStatusChange);
      }
      throw new Error(`Server returned error status ${response.status}: ${errData.message || errText}`);
    }
  } catch (e) {
    console.warn("Primary API pipeline failed. Attempting browser-side Puter.js fallback:", e);
    // If backend connection fails entirely, try client-side Puter as last resort
    try {
      if (onStatusChange) onStatusChange("Connection limits reached. Running final fallback...");
      return await runClientSidePuterFallback(base64Data, mimeType, options, onStatusChange);
    } catch (puterErr) {
      console.error("All AI curation pipelines failed:", puterErr);
      throw new Error("Free AI usage is temporarily unavailable. Please try again later.");
    }
  }
}
