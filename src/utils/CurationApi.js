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

// 1. Google Gemini Direct Call (with model rotation fallback)
async function callGeminiDirect(base64Data, mimeType, apiKey, prompt) {
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
      console.log(`[Client Direct] Attempting Gemini model: ${model}`);
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

      console.log(`[Client Direct] Gemini Success using model: ${model}`);
      const displayName = model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { ...cleanAndParseJson(responseText), _modelUsed: `Gemini (${displayName}) [Direct Client]` };
    } catch (e) {
      console.warn(`[Client Direct] Gemini model ${model} failed:`, e.message || e);
      lastErr = e;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastErr?.message || lastErr}`);
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

// Nvidia NIM Direct Call
async function callNvidiaDirect(base64Data, mimeType, apiKey, prompt) {
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
    throw new Error(`Nvidia NIM API returned error: ${textContent}`);
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw new Error("Empty choices response from Nvidia NIM API");
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Nvidia NIM (Llama 3.2 Vision) [Direct Client]" };
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

// Mistral Direct Call
async function callMistralDirect(base64Data, mimeType, apiKey, prompt) {
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
    throw new Error(`Mistral API returned error: ${textContent}`);
  }

  const result = JSON.parse(textContent);
  const responseText = result.choices?.[0]?.message?.content;
  if (!responseText) {
    throw new Error("Empty choices response from Mistral API");
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Mistral (Pixtral 12B) [Direct Client]" };
}

// Cohere Direct Call
async function callCohereDirect(base64Data, mimeType, apiKey, prompt) {
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
    throw new Error(`Cohere API returned error: ${textContent}`);
  }

  const result = JSON.parse(textContent);
  const responseText = result.message?.content?.[0]?.text;
  if (!responseText) {
    throw new Error("Empty response content from Cohere API");
  }

  return { ...cleanAndParseJson(responseText), _modelUsed: "Cohere (Command A Vision) [Direct Client]" };
}

// Client-side Direct Fallback router
async function runClientSideFallback(base64Data, mimeType, options, onStatusChange) {
  const activeLangs = Object.entries(options?.selectedLanguages || {})
    .filter(([_, active]) => active)
    .map(([lang, _]) => lang.charAt(0).toUpperCase() + lang.slice(1))
    .join(', ');

  const langConstraint = activeLangs 
    ? `Recommend songs ONLY in these languages: ${activeLangs}. Do not suggest songs from other languages.` 
    : 'Recommend songs across these languages: Tamil, English, Hindi, Malayalam, and Telugu.';

  const systemPrompt = `You are a social media and music curation expert. Your task is to analyze the provided image and generate:
1. Three highly creative, engaging, and different styles of social media captions/quotes in English.
2. Three highly creative, engaging, and different styles of social media captions/quotes in Tamil.
3. 5-8 relevant, trending hashtags (including standard ones and some specific to the vibe of the image).
4. A list of 20 to 25 recommended songs (Format: "Song Title - Artist") that specifically match the background vibe, visual atmosphere, setting, pose, clothing look, facial expressions, lighting, colors, and aesthetic tone of the image.
   CRITICAL RECOMMENDATION RULES:
   - ${langConstraint}
   - Include Christian worship/gospel songs (only when appropriate for the image, such as if it shows a serene, spiritual setting, church, cross, or peaceful grateful mood).
   - Prioritize latest trending songs while also including timeless classics that perfectly fit the photo.
   - You must rank them by confidence score (0 to 100).
   - For each song, provide a brief 1-sentence explanation of why it fits the photo.
5. "captionExplanation": A 1-2 sentence description explaining the mood and tone of the generated captions and why they fit the visual elements of this specific picture.
6. "lookDescription": If there is a person (or people) in the photo, write a 2-3 sentence engaging description analyzing their appearance, clothing look, style, accessories, colors, expressions, aesthetic vibe, and what details make their look stand out (its "gloss" or highlights). If there is no person in the photo, return an empty string.

Ensure that your response conforms strictly to this JSON format and contains nothing else (no markdown wrappers like \`\`\`json, just raw JSON text):
{
  "captionsEnglish": ["caption 1", "caption 2", "caption 3"],
  "captionsTamil": ["caption 1", "caption 2", "caption 3"],
  "hashtags": ["#tag1", "#tag2", ...],
  "recommendedSongs": [
    {
      "song": "Song Title - Artist",
      "language": "Tamil",
      "confidenceScore": 95,
      "matchExplanation": "Matches the cinematic neon background and introspective facial expression."
    }
  ],
  "captionExplanation": "Brief explanation of why the captions fit the photo context.",
  "lookDescription": "Brief description of the person's look and style, or empty string if no person is present."
}`;

  // Read Vite env variables
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const nvidiaKey = import.meta.env.VITE_NVIDIA_API_KEY;
  const deepseekKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
  const mistralKey = import.meta.env.VITE_MISTRAL_API_KEY;
  const cohereKey = import.meta.env.VITE_COHERE_API_KEY;

  // Build client direct providers list
  const providers = [];

  if (openrouterKey && openrouterKey.trim()) {
    providers.push({
      name: "OpenRouter Free API",
      fn: () => callOpenRouterDirect(base64Data, mimeType, openrouterKey.trim(), systemPrompt, onStatusChange)
    });
  }

  if (nvidiaKey && nvidiaKey.trim()) {
    providers.push({
      name: "Nvidia NIM API",
      fn: () => callNvidiaDirect(base64Data, mimeType, nvidiaKey.trim(), systemPrompt)
    });
  }

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

  if (mistralKey && mistralKey.trim()) {
    providers.push({
      name: "Mistral Free API",
      fn: () => callMistralDirect(base64Data, mimeType, mistralKey.trim(), systemPrompt)
    });
  }

  if (cohereKey && cohereKey.trim()) {
    providers.push({
      name: "Cohere Free API",
      fn: () => callCohereDirect(base64Data, mimeType, cohereKey.trim(), systemPrompt)
    });
  }

  let lastError = null;
  for (const provider of providers) {
    try {
      if (onStatusChange) onStatusChange("Running visual mood and theme analysis...");
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
    if (onStatusChange) onStatusChange("Analyzing visual aesthetic and tone...");
    
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
      if (onStatusChange) onStatusChange("Generating captions and song matches...");
      return await runClientSideFallback(base64Data, mimeType, options, onStatusChange);
    } else {
      const errText = await response.text();
      let errData = {};
      try { errData = JSON.parse(errText); } catch(e) {}
      
      if (onStatusChange) onStatusChange("Aligning playlist track selections...");
      return await runClientSideFallback(base64Data, mimeType, options, onStatusChange);
    }
  } catch (e) {
    console.warn("Server connection failed. Attempting direct client-side fallback:", e);
    try {
      if (onStatusChange) onStatusChange("Assembling final curation payload...");
      return await runClientSideFallback(base64Data, mimeType, options, onStatusChange);
    } catch (directErr) {
      console.error("All curation pipelines failed:", directErr);
      throw new Error("Free AI usage is temporarily exhausted. Please try again tomorrow.");
    }
  }
}
