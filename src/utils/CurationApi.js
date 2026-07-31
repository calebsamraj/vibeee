/**
 * Curation API utility: Client-side AI adapter and direct fallback router
 * using Gemini, Groq, and OpenRouter free tiers.
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
  
  // Find first '{' and last '}' to extract only the valid JSON block
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  } else {
    // Fallback standard clean
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(json)?/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON:", cleaned);
    throw new Error(`AI returned invalid JSON: ${e.message}`);
  }
}

// Timeout helper (30 seconds limit)
const fetchWithTimeout = (url, options, timeoutMs = 30000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout of ${timeoutMs}ms exceeded`));
    }, timeoutMs);

    fetch(url, options)
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

// 1. Google Gemini Direct Call
async function callGeminiDirect(base64Data, mimeType, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  }, 30000);

  const textContent = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini API returned error: ${textContent}`);
  }

  const result = JSON.parse(textContent);
  const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error("Empty candidate text from Gemini response");
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Gemini 3.5 Flash [Direct Client]" };
}

// 2. Groq Direct Call
async function callGroqDirect(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const requestBody = {
    model: "llama-3.2-11b-vision-preview",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`
            }
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  }, 30000);

  const textContent = await response.text();
  if (!response.ok) {
    throw new Error(`Groq API returned error: ${textContent}`);
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw new Error("Empty choices response from Groq API");
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Groq (Llama 3.2 Vision) [Direct Client]" };
}

// 3. OpenRouter Direct Call (with model rotation fallback)
async function callOpenRouterDirect(base64Data, mimeType, apiKey, prompt, onStatusChange) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  
  const openRouterModels = [
    "openrouter/free", // Automates free vision routing
    "google/gemini-3.5-flash:free",
    "google/gemini-2.5-flash:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "meta-llama/llama-3.2-90b-vision-instruct:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "qwen/qwen-2-vl-7b-instruct:free"
  ];

  let lastErr = null;
  for (const model of openRouterModels) {
    try {
      if (onStatusChange) onStatusChange(`Calling OpenRouter (${model})...`);
      const requestBody = {
        model: model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ],
        temperature: 0.7
      };

      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "VibeLens"
        },
        body: JSON.stringify(requestBody)
      }, 30000);

      const textContent = await response.text();
      if (!response.ok) {
        throw new Error(`Model ${model} failed with status ${response.status}: ${textContent}`);
      }

      const result = JSON.parse(textContent);
      const responseText = result.choices?.[0]?.message?.content;
      if (!responseText) {
        throw new Error(`Empty choices response for model ${model}`);
      }

      return { ...cleanAndParseJson(responseText), _modelUsed: `OpenRouter (${model}) [Direct Client]` };
    } catch (e) {
      console.warn(`[Client Direct] OpenRouter model ${model} failed:`, e.message || e);
      lastErr = e;
    }
  }

  throw new Error(`All OpenRouter models failed. Last error: ${lastErr?.message || lastErr}`);
}

// 4. DeepSeek Direct Call
async function callDeepSeekDirect(apiKey, prompt) {
  const url = 'https://api.deepseek.com/chat/completions';
  const requestBody = {
    model: "deepseek-chat",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  }, 30000);

  const textContent = await response.text();
  if (!response.ok) {
    throw new Error(`DeepSeek API returned error: ${textContent}`);
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw new Error("Empty choices response from DeepSeek API");
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "DeepSeek-V3 [Direct Client]" };
}

// Client-side Direct Fallback router
async function runClientSideFallback(base64Data, mimeType, options, onStatusChange) {
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

  // Read Vite env variables
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const deepseekKey = import.meta.env.VITE_DEEPSEEK_API_KEY;

  // Build client direct providers list
  const providers = [];

  if (deepseekKey && deepseekKey.trim()) {
    providers.push({
      name: "DeepSeek API",
      fn: () => callDeepSeekDirect(deepseekKey.trim(), systemPrompt)
    });
  }

  if (geminiKey && geminiKey.trim()) {
    providers.push({
      name: "Gemini Free API",
      fn: () => callGeminiDirect(base64Data, mimeType, geminiKey.trim(), systemPrompt)
    });
  }

  if (groqKey && groqKey.trim()) {
    providers.push({
      name: "Groq Free API",
      fn: () => callGroqDirect(base64Data, mimeType, groqKey.trim(), systemPrompt)
    });
  }

  if (openrouterKey && openrouterKey.trim()) {
    providers.push({
      name: "OpenRouter Free API",
      fn: () => callOpenRouterDirect(base64Data, mimeType, openrouterKey.trim(), systemPrompt, onStatusChange)
    });
  }

  let lastError = null;
  for (const provider of providers) {
    try {
      if (onStatusChange) onStatusChange(`Switching to direct client-side call via ${provider.name}...`);
      const result = await provider.fn();
      if (result) {
        return result;
      }
    } catch (e) {
      console.warn(`[Client Direct] Curation through ${provider.name} failed:`, e.message || e);
      lastError = e;
    }
  }

  throw new Error(lastError?.message || "All client-side direct API curations failed.");
}

// Main exported adapter that delegates to the backend proxy with client-side fallback
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
      // If server explicitly requested client fallback (or returned rate-limits/limitations)
      if (onStatusChange) onStatusChange("Server API limits exhausted. Running direct client-side fallback...");
      return await runClientSideFallback(base64Data, mimeType, options, onStatusChange);
    } else {
      const errText = await response.text();
      let errData = {};
      try { errData = JSON.parse(errText); } catch(e) {}
      
      if (onStatusChange) onStatusChange("Server error. Running direct client-side fallback...");
      return await runClientSideFallback(base64Data, mimeType, options, onStatusChange);
    }
  } catch (e) {
    console.warn("Server connection failed. Attempting direct client-side fallback:", e);
    try {
      if (onStatusChange) onStatusChange("Connection failed. Running direct client-side fallback...");
      return await runClientSideFallback(base64Data, mimeType, options, onStatusChange);
    } catch (directErr) {
      console.error("All curation pipelines failed:", directErr);
      throw new Error("Free AI usage is temporarily exhausted. Please try again tomorrow.");
    }
  }
}
