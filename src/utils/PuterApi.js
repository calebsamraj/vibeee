/**
 * Puter API utility with direct key calling and Puter keyless AI model fallbacks.
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

// Clean markdown tags and parse JSON
function cleanAndParseJson(text) {
  let cleaned = text.trim();
  // Remove markdown code block wrappers if present
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

// Direct Groq call with custom key
async function queryGroqModelDirect(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const requestBody = {
    model: "llama-3.2-11b-vision-preview",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const textContent = result.choices?.[0]?.message?.content;
  if (!textContent) {
    throw new Error("No response content from Groq API");
  }

  return cleanAndParseJson(textContent);
}

// Direct Gemini call with custom key
async function queryGeminiModelDirect(base64Data, mimeType, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error("No response content from Gemini API");
  }

  return cleanAndParseJson(textContent);
}

// Direct OpenRouter Free Call
async function queryOpenRouterModelDirect(base64Data, mimeType, apiKey, prompt) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const requestBody = {
    model: "meta-llama/llama-3.2-11b-vision-instruct:free",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "VibeLens"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const textContent = result.choices?.[0]?.message?.content;
  if (!textContent) {
    throw new Error("No response content from OpenRouter API");
  }

  return cleanAndParseJson(textContent);
}

// Puter keyless call
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

// Main exported fallback logic
export async function queryWithFallback(imageFile, customKey, options, onStatusChange) {
  const base64Data = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';
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
  "captionsEnglish": ["caption 1", "caption 2", "caption 3"], // Populate ONLY if English is selected, otherwise empty array
  "captionsTamil": ["caption 1", "caption 2", "caption 3"],   // Populate ONLY if Tamil is selected, otherwise empty array
  "hashtags": ["#tag1", "#tag2", ...],
  "songsTamil": ["Song Title - Artist", ...],                  // Populate ONLY if Tamil is selected, otherwise empty array
  "songsEnglish": ["Song Title - Artist", ...],                // Populate ONLY if English is selected, otherwise empty array
  "songsHindi": ["Song Title - Artist", ...],                  // Populate ONLY if Hindi is selected, otherwise empty array
  "songsTamilChristian": ["Song Title - Artist", ...]          // Populate ONLY if Tamil Christian is selected, otherwise empty array
}`;

  // Read environment API keys
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  // Build Primary API Checklist
  const primaryApis = [];

  // If a custom key is passed, prioritize it first
  if (customKey && customKey.trim()) {
    const key = customKey.trim();
    if (key.startsWith('gsk_')) {
      primaryApis.push({
        name: 'Custom Groq API Key',
        fn: () => queryGroqModelDirect(base64Data, mimeType, key, systemPrompt)
      });
    } else if (key.startsWith('sk-or-')) {
      primaryApis.push({
        name: 'Custom OpenRouter API Key',
        fn: () => queryOpenRouterModelDirect(base64Data, mimeType, key, systemPrompt)
      });
    } else {
      primaryApis.push({
        name: 'Custom Gemini API Key',
        fn: () => queryGeminiModelDirect(base64Data, mimeType, key, systemPrompt)
      });
    }
  }

  // Append standard env keys in preference order (Gemini -> Groq -> OpenRouter Free)
  if (geminiKey && geminiKey.trim()) {
    primaryApis.push({
      name: 'Gemini API (Primary)',
      fn: () => queryGeminiModelDirect(base64Data, mimeType, geminiKey.trim(), systemPrompt)
    });
  }

  if (groqKey && groqKey.trim()) {
    primaryApis.push({
      name: 'Groq API (Secondary)',
      fn: () => queryGroqModelDirect(base64Data, mimeType, groqKey.trim(), systemPrompt)
    });
  }

  if (openrouterKey && openrouterKey.trim()) {
    primaryApis.push({
      name: 'OpenRouter Free API (Tertiary)',
      fn: () => queryOpenRouterModelDirect(base64Data, mimeType, openrouterKey.trim(), systemPrompt)
    });
  }

  // 1. Run through Primary APIs
  for (const api of primaryApis) {
    try {
      if (onStatusChange) onStatusChange(`Analyzing with ${api.name}...`);
      const result = await api.fn();
      if (result) {
        return result;
      }
    } catch (e) {
      console.warn(`${api.name} failed:`, e);
    }
  }

  // 2. Puter Keyless Fallback Chain (only runs if primary keys fail/exhausted or not provided)
  if (onStatusChange) {
    if (primaryApis.length > 0) {
      onStatusChange("Primary API limits exhausted. Switching to Puter...");
    } else {
      onStatusChange("No Primary API keys configured. Using Puter...");
    }
  }

  const fallbackModels = [
    { provider: 'Gemini 3.6', name: 'gemini-3.6-flash' },
    { provider: 'Gemini 3.5', name: 'gemini-3.5-flash' },
    { provider: 'OpenAI GPT-4o', name: 'gpt-4o-mini' },
    { provider: 'Kimi K3', name: 'moonshotai/kimi-k3' },
    { provider: 'OpenAI GPT-5.6', name: 'gpt-5.6-luna' }
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

  throw new Error(`All models in fallback chain failed. Last error: ${lastError?.message || 'Unknown error'}`);
}
