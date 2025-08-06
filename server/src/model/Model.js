const { GoogleGenerativeAI } = require("@google/generative-ai");

// Prefer GEMINI_API_KEY but fall back to REACT_APP_... if running in frontend-like env
const apiKey = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("❌ Missing Gemini API Key in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// Main content generation function
const generateContent = async (prompt, retries = 3) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      if (error.status === 503 && attempt < retries - 1) {
        console.warn(`🔁 Gemini 503 - retrying (${attempt + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        console.error("❌ Gemini API error:", error.message || error);
        throw new Error("Failed to generate content from AI.");
      }
    }
  }
};

module.exports = { generateContent };

