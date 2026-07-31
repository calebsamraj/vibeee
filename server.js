import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Disable TLS rejection for local SSL inspect proxies
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

// CORS Image Proxy for sample images
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Missing url parameter');
  }
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).send('Error proxying image');
  }
});

// Helper to clean markdown block wrappers and parse JSON
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

// Check if a response status or error indicates rate limits / quota issues
function isRetryableError(status, text = "") {
  if (status === 429 || status >= 500) {
    return true;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("daily limit") ||
    lower.includes("limit exceeded") ||
    lower.includes("too many requests") ||
    lower.includes("unavailable")
  ) {
    return true;
  }
  return false;
}

// 1. Google Gemini API Call
async function callGemini(base64Data, mimeType, apiKey, prompt) {
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
    throw { status: response.status, message: `Gemini API returned error: ${textContent}` };
  }

  const result = JSON.parse(textContent);
  const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw { status: 500, message: "Empty candidate text from Gemini response" };
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Gemini 3.5 Flash" };
}

// 2. Groq API Call
async function callGroq(base64Data, mimeType, apiKey, prompt) {
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
    throw { status: response.status, message: `Groq API returned error: ${textContent}` };
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw { status: 500, message: "Empty choices response from Groq API" };
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Groq (Llama 3.2 Vision)" };
}

// 3. OpenRouter Free Call
async function callOpenRouter(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  
  const openRouterModels = [
    "openrouter/free",
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
      console.log(`[VibeLens Server] Attempting OpenRouter model: ${model}`);
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
          "HTTP-Referer": "http://localhost:5173",
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

      console.log(`[VibeLens Server] OpenRouter Success using model: ${model}`);
      return { ...cleanAndParseJson(responseText), _modelUsed: `OpenRouter (${model})` };
    } catch (e) {
      console.warn(`[VibeLens Server] OpenRouter model ${model} failed:`, e.message || e);
      lastErr = e;
    }
  }

  throw { status: 500, message: `All OpenRouter models failed. Last error: ${lastErr?.message || lastErr}` };
}

// 4. DeepSeek API Call
async function callDeepSeek(apiKey, prompt) {
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
    throw { status: response.status, message: `DeepSeek API returned error: ${textContent}` };
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw { status: 500, message: "Empty choices response from DeepSeek API" };
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "DeepSeek-V3" };
}

// Curate endpoint
app.post('/api/curate', async (req, res) => {
  const { image, mimeType, options } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, message: "Missing image file" });
  }

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
4. "captionExplanation": A 1-2 sentence description explaining the mood and tone of the generated captions and why they fit the visual elements of this specific picture.
5. "songExplanation": A 1-2 sentence explanation detailing why these specific song recommendations and music genres were chosen to complement the visual aesthetics, setting, and mood of the picture.

Ensure that your response conforms strictly to this JSON format and contains nothing else (no markdown wrappers like \`\`\`json, just raw JSON text):
{
  "captionsEnglish": ["caption 1", "caption 2", "caption 3"], // Populate ONLY if English is selected, otherwise empty array
  "captionsTamil": ["caption 1", "caption 2", "caption 3"],   // Populate ONLY if Tamil is selected, otherwise empty array
  "hashtags": ["#tag1", "#tag2", ...],
  "songsTamil": ["Song Title - Artist", ...],                  // Populate ONLY if Tamil is selected, otherwise empty array
  "songsEnglish": ["Song Title - Artist", ...],                // Populate ONLY if English is selected, otherwise empty array
  "songsHindi": ["Song Title - Artist", ...],                  // Populate ONLY if Hindi is selected, otherwise empty array
  "songsTamilChristian": ["Song Title - Artist", ...],         // Populate ONLY if Tamil Christian is selected, otherwise empty array
  "captionExplanation": "Brief explanation of why the captions fit the photo context.",
  "songExplanation": "Brief explanation of why the songs fit the photo vibe."
}`;

  // Read environment API keys securely (backward compatible with user's .env prefixes)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;

  const providers = [];
  
  if (deepseekKey && deepseekKey.trim()) {
    providers.push({
      name: "DeepSeek API",
      fn: () => callDeepSeek(deepseekKey.trim(), systemPrompt)
    });
  }

  if (geminiKey && geminiKey.trim()) {
    providers.push({
      name: "Gemini Free API",
      fn: () => callGemini(image, mimeType || "image/jpeg", geminiKey.trim(), systemPrompt)
    });
  }
  
  if (groqKey && groqKey.trim()) {
    providers.push({
      name: "Groq Free API",
      fn: () => callGroq(image, mimeType || "image/jpeg", groqKey.trim(), systemPrompt)
    });
  }

  if (openrouterKey && openrouterKey.trim()) {
    providers.push({
      name: "OpenRouter Free API",
      fn: () => callOpenRouter(image, mimeType || "image/jpeg", openrouterKey.trim(), systemPrompt)
    });
  }

  console.log(`[VibeLens Server] Received request. Found ${providers.length} primary providers in configuration.`);

  // 1. Try standard free key-based APIs in order
  for (const provider of providers) {
    try {
      console.log(`[VibeLens Server] Attempting request using: ${provider.name}`);
      const result = await provider.fn();
      if (result) {
        console.log(`[VibeLens Server] Success! Handled by: ${provider.name}`);
        return res.json({ success: true, result });
      }
    } catch (err) {
      // Log errors securely (do not leak keys or full auth trace)
      const isRetryable = isRetryableError(err.status, err.message);
      console.warn(`[VibeLens Server] ${provider.name} failed. Status: ${err.status || 'unknown'}. Retryable: ${isRetryable}`);
      console.warn(`[VibeLens Server] Error log summary: ${err.message ? err.message.substring(0, 150) : err}`);
      
      // If it is not retryable (e.g. invalid syntax or wrong key), we log it but continue fallback rotation anyway.
    }
  }

  // 2. Exhausted standard API fallback -> return failure
  console.warn(`[VibeLens Server] All primary AI keys exhausted/failed.`);
  return res.status(500).json({ 
    success: false, 
    message: "Primary free AI APIs are exhausted or rate-limited. Falling back to client-side direct request..." 
  });
});

// Production: Serve frontend static assets from 'dist'
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[VibeLens Server] Running on http://localhost:${PORT}`);
  console.log(`[VibeLens Server] Environment Keys Configured:`);
  console.log(` - Gemini API Key: ${process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY ? "YES" : "NO"}`);
  console.log(` - Groq API Key: ${process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY ? "YES" : "NO"}`);
  console.log(` - OpenRouter API Key: ${process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY ? "YES" : "NO"}`);
});
