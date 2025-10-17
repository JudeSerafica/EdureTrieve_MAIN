import Groq from "groq-sdk";

// Use GROQ_API_KEY from environment variables
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("❌ Missing Groq API Key in environment variables.");
}

// ✅ Initialize Groq client
const groq = new Groq({
  apiKey,
});

// Main content generation function with RAG support
const generateContent = async (prompt, userId = null, retries = 3) => {
  let enhancedPrompt = prompt;

  // If userId is provided, fetch user's modules for RAG
  if (userId) {
    try {
      const { getModulesByUserId } = require('./moduleModel');
      const userModules = await getModulesByUserId(userId);

      if (userModules && userModules.length > 0) {
        // Simple relevance filtering: find modules that contain keywords from the prompt
        const promptWords = prompt.toLowerCase().split(/\s+/);
        const relevantModules = userModules.filter(module => {
          const titleWords = module.title.toLowerCase().split(/\s+/);
          const descWords = module.description.toLowerCase().split(/\s+/);

          // Check if any prompt word appears in title or description
          return promptWords.some(word =>
            word.length > 2 && (titleWords.includes(word) || descWords.includes(word))
          );
        });

        // If no modules are highly relevant, include all modules but limit to top 3
        const modulesToUse = relevantModules.length > 0 ? relevantModules : userModules.slice(0, 3);

        // Extract content from relevant modules
        const moduleContent = modulesToUse.map(module =>
          `Module: ${module.title}\nContent: ${module.description.substring(0, 1000)}${module.description.length > 1000 ? '...' : ''}\n`
        ).join('\n');

        enhancedPrompt = `Context from your uploaded modules:\n${moduleContent}\n\nUser question: ${prompt}\n\nPlease answer based on the provided context when relevant, or use your general knowledge if the context doesn't contain the information.`;
      }
    } catch (error) {
      console.warn("⚠️ Failed to fetch user modules for RAG:", error.message);
      // Continue without RAG if module fetching fails
    }
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: enhancedPrompt,
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

export { generateContent };

