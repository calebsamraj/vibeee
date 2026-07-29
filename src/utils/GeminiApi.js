export async function queryGeminiModel(imageFile, apiKey) {
  const base64Data = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const prompt = `You are a social media and music curation expert. Your task is to analyze the provided image and generate:
1. 3 highly creative, engaging, and different styles of social media captions (e.g., one witty, one poetic, one direct/engaging).
2. 5-8 relevant, trending hashtags (including standard ones and some specific to the vibe of the image).
3. 2-3 Tamil song recommendations (Format: "Song Title - Artist") matching the mood, tone, or setting of the image.
4. 2-3 international/English song recommendations (Format: "Song Title - Artist") matching the same mood/tone.

Ensure that your response conforms strictly to the requested JSON schema.`;

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
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          captions: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Array of 3 creative social media captions."
          },
          hashtags: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Array of 5-8 relevant trending hashtags."
          },
          tamilSongs: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Array of 2-3 Tamil song recommendations (Format: 'Song Title - Artist') matching the vibe."
          },
          globalSongs: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Array of 2-3 international/English song recommendations (Format: 'Song Title - Artist') matching the vibe."
          }
        },
        required: ["captions", "hashtags", "tamilSongs", "globalSongs"]
      }
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
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errText}`);
  }

  const result = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error("No response content from Gemini API");
  }

  return JSON.parse(textContent.trim());
}

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
