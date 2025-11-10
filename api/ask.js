// pages/api/ask.js
import { Index } from "@upstash/vector"; // ⬅️ MUDANÇA
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Inicializar o cliente Gemini (para Chat)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. ⬇️ INICIALIZAÇÃO DO NOVO BANCO UPSTASH ⬇️
const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    // --- CORS e Auth (Mantido) ---
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 3. Parse do Body (Mantido)
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const { messages = [] } = body;
    if (!messages.length) {
        return res.status(400).json({ error: "No messages provided." });
    }

    const lastUserMessage = messages[messages.length - 1];
    const userQuery = lastUserMessage.content;

    // 4. ⬇️ MUDANÇA: Fazer a Busca por Similaridade (RAG)
    // O Upstash Vector cuida de criar o embedding da *pergunta* para nós!
    console.log(`Buscando contexto para: "${userQuery}"`);
    const searchResults = await index.query({
        data: userQuery, // Envia o texto da pergunta
        topK: 4, // Pede os 4 chunks mais relevantes
        includeData: true, // Pede para incluir o texto (data)
    });

    // Filtra resultados com baixa relevância (score < 0.7)
    const relevantChunks = searchResults
      .filter(r => r.score > 0.70)
      .map(r => r.data); // 'data' é onde o Upstash armazena o texto

    const context = relevantChunks.join("\n\n---\n\n");
    console.log(`Contexto encontrado: ${relevantChunks.length} chunks.`);


    // 5. Montar o Histórico para o Gemini (Mantido)
    const history = messages.slice(0, -1)
    .filter(m => m.id !== 'carol-intro') // <-- ADICIONADO: Remove a mensagem inicial da Carol
    .map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
    }));

    // 6. Montar o System Prompt + Contexto (Mantido)
    const systemPrompt = `You are Carol Levtchenko's professional portfolio assistant.
Answer in English unless asked otherwise.
Be concise, helpful, and friendly.
Base your answers *only* on the context provided below. If the answer is not in the context, say "I'm sorry, I don't have information about that."

--- CONTEXT FROM THE PORTFOLIO ---
${context || "No context found for this query."}
--- END OF CONTEXT ---
`;

    // 7. Chamar o Gemini (Mantido)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(userQuery);
    
    const response = result.response;
    const reply = response.text();

    return res.status(200).json({ reply: reply || "(no reply)" });

  } catch (err) {
    // 8. Tratamento de Erro (Mantido)
    console.error("Gemini/RAG error", err);
    let userFriendlyError;
    const errCode = err.status || err.code;

    if (err.message.includes("rate limit")) {
        userFriendlyError = "I'm sorry, the model for this AI assistant is busy right now. Please try sending your question again in a few seconds.";
    } else if (err.message.includes("blocked") || (err.response && err.response.promptFeedback && err.response.promptFeedback.blockReason)) {
        userFriendlyError = "Your question was blocked due to safety reasons. Please try rephrasing it.";
    } else {
        userFriendlyError = "An unexpected internal error occurred. My apologies, please try sending your message again.";
    }

    return res.status(500).json({
        error: userFriendlyError,
        details: String(err?.message || err)
    });
  }
}