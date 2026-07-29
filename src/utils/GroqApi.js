export async function queryGroqModel(imageFile, apiKey) {
  const base64Data = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const systemPrompt = `You are a social media and music curation expert. Your task is to analyze the provided image and generate:
1. 3 highly creative, engaging, and different styles of social media captions (e.g., one witty, one poetic, one direct/engaging).
2. 5-8 relevant, trending hashtags (including standard ones and some specific to the vibe of the image).
3. 2-3 Tamil song recommendations (Format: "Song Title - Artist") matching the mood, tone, or setting of the image.
4. 2-3 international/English song recommendations (Format: "Song Title - Artist") matching the same mood/tone.

Ensure that your response conforms strictly to the requested JSON schema with the following format:
{
  "captions": ["caption 1", "caption 2", "caption 3"],
  "hashtags": ["#tag1", "#tag2", ...],
  "tamilSongs": ["Song Title - Artist", ...],
  "globalSongs": ["Song Title - Artist", ...]
}`;

  const requestBody = {
    model: "llama-3.2-11b-vision-preview",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this image and return the requested JSON object."
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
    throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errText}`);
  }

  const result = await response.json();
  const textContent = result.choices?.[0]?.message?.content;
  if (!textContent) {
    throw new Error("No response content from Groq API");
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
