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

// 1. Google Gemini API Call (with model rotation fallback)
async function callGemini(base64Data, mimeType, apiKey, prompt) {
  const models = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
  ];

  let lastErr = null;
  for (const model of models) {
    try {
      console.log(`[VibeLens Server] Attempting Gemini model: ${model}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
        throw new Error(`Model ${model} failed with status ${response.status}: ${textContent}`);
      }

      const result = JSON.parse(textContent);
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error(`Empty candidate text from Gemini response for model ${model}`);
      }

      console.log(`[VibeLens Server] Gemini Success using model: ${model}`);
      const displayName = model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { ...cleanAndParseJson(responseText), _modelUsed: `Gemini (${displayName})` };
    } catch (e) {
      console.warn(`[VibeLens Server] Gemini model ${model} failed:`, e.message || e);
      lastErr = e;
    }
  }

  throw { status: 500, message: `All Gemini models failed. Last error: ${lastErr?.message || lastErr}` };
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
    "mistralai/mistral-medium-latest",
    "mistralai/mistral-medium-3-5",
    "mistralai/mistral-medium-3-5-26-04",
    "mistralai/mistral-medium-3",
    "meta-llama/llama-4-scout",
    "meta-llama/llama-4-scout:free",
    "meta-llama/llama-3.2-11b-vision-instruct",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "meta-llama/llama-3.3-70b-instruct",
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1-distill-qwen-32b",
    "qwen/qwq-32b",
    "qwen/qwen-2.5-coder-32b-instruct",
    "mistralai/mistral-small-24b-instruct-2501",
    "meta-llama/llama-guard-3-8b",
    "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/ibm-granite/granite-4.0-h-micro",
    "@cf/moonshotai/kimi-k2.6",
    "@cf/moonshotai/kimi-k2.7-code",
    "@cf/nvidia/nemotron-3-120b-a12b",
    "@cf/openai/gpt-oss-120b",
    "@cf/openai/gpt-oss-20b",
    "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/zai-org/glm-4.7-flash",
    "@cf/zai-org/glm-5.2",
    "google/gemma-2b-it",
    "google/gemma-7b-it",
    "meta-llama/llama-2-7b-chat",
    "mistralai/mistral-7b-instruct",
    "openrouter/free",
    "google/gemini-3.5-flash:free",
    "google/gemini-2.5-flash:free",
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

// Nvidia NIM Call
async function callNvidia(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const requestBody = {
    model: "meta/llama-3.2-11b-vision-instruct",
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
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  }, 30000);

  const textContent = await response.text();
  if (!response.ok) {
    throw { status: response.status, message: `Nvidia NIM API returned error: ${textContent}` };
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw { status: 500, message: "Empty choices response from Nvidia NIM API" };
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Nvidia NIM (Llama 3.2 Vision)" };
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

// Mistral API Call
async function callMistral(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://api.mistral.ai/v1/chat/completions';
  const requestBody = {
    model: "pixtral-12b-2409",
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
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  }, 30000);

  const textContent = await response.text();
  if (!response.ok) {
    throw { status: response.status, message: `Mistral API returned error: ${textContent}` };
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw { status: 500, message: "Empty choices response from Mistral API" };
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Mistral (Pixtral 12B)" };
}

// Cohere API Call
async function callCohere(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://api.cohere.com/v2/chat';
  const requestBody = {
    model: "command-a-vision-07-2025",
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
    ]
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
    throw { status: response.status, message: `Cohere API returned error: ${textContent}` };
  }

  const result = JSON.parse(textContent);
  const responseText = result.message?.content?.[0]?.text;
  if (!responseText) {
    throw { status: 500, message: "Empty response content from Cohere API" };
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Cohere (Command A Vision)" };
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

  const songEraLabel = options.songEra ? `${options.songEra} Hits` : "Latest Hits";

  let tamilEraRangeInstruction = "";
  if (options.songEra === 'latest') {
    tamilEraRangeInstruction = "Latest Hits (Release year 2010 to Present Year, trending chartbusters)";
  } else if (options.songEra === '2010s') {
    tamilEraRangeInstruction = "Tamil Hits of 2010s (Release year 2010 to Present Year nostalgic throwbacks)";
  } else if (options.songEra === '2000s') {
    tamilEraRangeInstruction = "Tamil Hits of 2000s (Release year 2000 to Present Year iconic classics)";
  } else if (options.songEra === '90s') {
    tamilEraRangeInstruction = "Tamil Hits of 90s (Release year before 2000, specifically 1990 - 1999)";
  } else if (options.songEra === '80s') {
    tamilEraRangeInstruction = "Tamil Retro Hits of 80s (Release year before 1990, specifically 1980 - 1989)";
  } else {
    tamilEraRangeInstruction = "Latest Hits (2010 to present)";
  }

  let captionStyleInstruction = "Each caption should be short and creative (1-2 lines).";
  if (options.captionStyle === 'one_line') {
    captionStyleInstruction = "Each generated caption must be exactly 1 line long (a single sentence or short line).";
  } else if (options.captionStyle === 'two_lines') {
    captionStyleInstruction = "Each generated caption must be exactly 2 lines long (two short sentences or lines).";
  } else if (options.captionStyle === 'three_words') {
    captionStyleInstruction = "Each generated caption must consist of exactly 3 words (e.g., 'Retro cozy vibes').";
  }

  let captionPlatformInstruction = "";
  if (options.captionPlatform === 'story') {
    captionPlatformInstruction = "The generated captions are specifically for an Instagram Story. They must be extremely short, aesthetic, punchy, and designed to look good as a text overlay overlaying a story picture.";
  } else if (options.captionPlatform === 'reel') {
    captionPlatformInstruction = "The generated captions are specifically for an Instagram Reel. They must contain strong viewer hooks to increase watch retention (e.g. 'Wait for the end...', 'Vibe check...'), a brief description, and a clear call to action (e.g. 'Save this for later', 'Tag a friend').";
  } else {
    captionPlatformInstruction = "The generated captions are specifically for an Instagram Post. They should be creative and engaging, with standard readability spacing, followed by standard hashtags.";
  }

  const systemPrompt = `You are a social media and music curation expert. Your task is to analyze the provided image and generate:
1. For each selected language for captions/quotes (${selectedCaptionLangs.join(', ')}):
   Generate 3 highly creative, engaging, and different styles of social media captions or quotes (e.g., one witty, one poetic/quote, one direct/engaging) in that language.
   CRITICAL LENGTH REQUIREMENT: ${captionStyleInstruction}
   CRITICAL PLATFORM STYLE REQUIREMENT: ${captionPlatformInstruction}
2. 5-8 relevant, trending hashtags (including standard ones and some specific to the vibe of the image).
3. For each selected language for songs (${selectedSongLangs.join(', ')}):
   Generate 2-3 song recommendations (Format: "Song Title - Artist") that specifically match the background vibe, visual atmosphere, setting, and aesthetic tone of the image.
   
   CRITICAL SONG ERA/PLATFORM RULES:
   - For TAMIL songs: The songs MUST belong to the following era/generation: ${tamilEraRangeInstruction}. Ensure that these song suggestions are extremely popular, mainstream, and well-known Tamil songs from that category, so that high-quality audio previews can be successfully fetched from public databases.
   - For TAMIL CHRISTIAN songs: Recommend Christian worship/devotional songs in Tamil from the specified era/category (or well-known classics if era-specific worship hits are sparse) that match the serene, grateful, peaceful, or spiritual vibe of the setting. Note: Only suggest well-known songs with publicly available preview clips.
   - For ENGLISH and HINDI songs: Do NOT restrict them by the Selected Era. Instead, recommend top-rated, mainstream hits on Spotify that perfectly suit the image's background setting, genre, and aesthetic tone (e.g., electronic/synthpop for futuristic/neon photos; chill, lofi, or acoustic for cafe/warm photos; ambient or acoustic for sunset/nature photos).
4. "captionExplanation": A 1-2 sentence description explaining the mood and tone of the generated captions and why they fit the visual elements of this specific picture.
5. "songExplanation": A 1-2 sentence explanation detailing why these specific song recommendations and music genres were chosen to complement the visual aesthetics, setting, and mood of the picture.
6. "lookDescription": If there is a person (or people) in the photo, write a 2-3 sentence engaging description analyzing their appearance, clothing look, style, accessories, colors, expressions, aesthetic vibe, and what details make their look stand out (its "gloss" or highlights). If there is no person in the photo, return an empty string.

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
  "songExplanation": "Brief explanation of why the songs fit the photo vibe.",
  "lookDescription": "Brief description of the person's look and style, or empty string if no person is present."
}`;

  // Read environment API keys securely (backward compatible with user's .env prefixes)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY || process.env.VITE_MISTRAL_API_KEY;
  const cohereKey = process.env.COHERE_API_KEY || process.env.VITE_COHERE_API_KEY;

  const providers = [];
  
  if (openrouterKey && openrouterKey.trim()) {
    providers.push({
      name: "OpenRouter Free API",
      fn: () => callOpenRouter(image, mimeType || "image/jpeg", openrouterKey.trim(), systemPrompt)
    });
  }

  if (nvidiaKey && nvidiaKey.trim()) {
    providers.push({
      name: "Nvidia NIM API",
      fn: () => callNvidia(image, mimeType || "image/jpeg", nvidiaKey.trim(), systemPrompt)
    });
  }

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

  if (mistralKey && mistralKey.trim()) {
    providers.push({
      name: "Mistral Free API",
      fn: () => callMistral(image, mimeType || "image/jpeg", mistralKey.trim(), systemPrompt)
    });
  }

  if (cohereKey && cohereKey.trim()) {
    providers.push({
      name: "Cohere Free API",
      fn: () => callCohere(image, mimeType || "image/jpeg", cohereKey.trim(), systemPrompt)
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

module.exports = app;
