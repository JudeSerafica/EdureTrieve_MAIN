const Groq = require("groq-sdk");

// Use GROQ_API_KEY from environment variables
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("❌ Missing Groq API Key in environment variables.");
}

// ✅ Initialize Groq client
const groq = new Groq({
  apiKey,
});

// Main content generation function
const generateContent = async (prompt, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "llama-3.1-8b-instant", // Fast and free model
      });

      return chatCompletion.choices[0]?.message?.content || "";
    } catch (error) {
      if (error.status === 503 && attempt < retries - 1) {
        console.warn(`🔁 Groq 503 - retrying (${attempt + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        console.error("❌ Groq API error:", error.message || error);
        throw new Error("Failed to generate content from AI.");
      }
    }
  }
};

module.exports = { generateContent };

