/**
 * AI Service utility: Frontend API adapter to call backend proxy.
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
      throw new Error(data.message || "Server processed request but failed to return result");
    } else {
      const errText = await response.text();
      let errData = {};
      try { errData = JSON.parse(errText); } catch(e) {}
      throw new Error(errData.message || errText || `Server returned error status ${response.status}`);
    }
  } catch (e) {
    console.error("AI curation pipeline failed:", e);
    throw new Error("Free AI usage is temporarily unavailable. Please try again later.");
  }
}
