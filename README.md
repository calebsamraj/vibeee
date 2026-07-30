# VibeLens 🔮✨

**VibeLens** is a premium, client-side React single-page application (SPA) that acts as an **AI Image Captioner, Hashtag Generator, and Cross-Language Song Curator**. Powered by the **Google Gemini 3.5 Flash** multimodal API.

## 🚀 Features

* 📸 **Direct Image Curation**: Upload JPG, PNG, or WebP images via a drag-and-drop zone to extract visual themes and mood in real time.
* ⚡ **Unified Multimodal Pipeline**: Leverages Google Gemini's multimodal capabilities to analyze pixels directly and return schema-enforced, structured JSON in a single API call.
* 💬 **Creative Social Captions**: Generates three distinct styles of social media captions (✨ Vibe, 🔮 Poetry, and 🎯 Punchy) with copy-to-clipboard buttons.
* 🏷️ **Hashtag Generator**: Instantly curates 5–8 trending hashtags relevant to the image, featuring a single-click "Copy All" function.
* 🎵 **Cross-Language Playlists**: Recommends customized, matching playlists for both **Tamil (Regional)** and **Global (International)** songs. Includes slow-spinning vinyl record hover micro-animations and direct links to listen on YouTube.
* 🔒 **Sleek, Secure Auth**: Allows custom Gemini API key entry, securely saved in local memory, and supports environment variables (`.env`) for automated authentication.
* 🎨 **Premium Glassmorphic Design**: Built using **Tailwind CSS v4** with a responsive layout, custom neon glow effects, and fluid animations.

---

## 🛠️ Tech Stack

* **Framework**: React (Vite setup)
* **Styling**: Tailwind CSS v4
* **Icons**: `lucide-react`
* **Model**: Google Gemini 3.5 Flash (`gemini-3.5-flash`)

---

## 💻 Getting Started

### 1. Prerequisites
Ensure you have Node.js installed on your system.

### 2. Clone and Install Dependencies
```bash
npm install
```

### 3. Add your Gemini API Key
Create a `.env` file in the root directory (or use the template provided) and add your Gemini API Key:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```
*Note: You can also enter and connect your API Key directly within the web interface.*

### 4. Launch the Development Server
```bash
npm run dev
```
Open **[http://localhost:5173/](http://localhost:5173/)** in your browser to start curating!

### 5. Build for Production
To build the application:
```bash
npm run build
```
