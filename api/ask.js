export default async function handler(req, res) {
  try {
    // --- ✅ Configuração de CORS (logo no início)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");

    // --- ✅ Preflight (navegadores fazem isso antes do POST real)
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    // --- ✅ Apenas POST permitido
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // --- ✅ Autenticação simples (Bearer Token)
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      console.warn("Unauthorized request");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- ✅ Parse do corpo da requisição
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (err) {
      console.error("Invalid JSON:", err);
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const {
      messages = [],
      systemPrompt = "You are Carol Levtchenko's professional portfolio assistant.",
      knowledge = "",
      model = "models/gemini-2.5-flash",
      temperature = 0.3,
    } = body;

    // --- ✅ Prompt principal
    const sysPrompt = `${systemPrompt}${knowledge ? `\n\n### KNOWLEDGE\n${String(knowledge).slice(0, 100000)}` : ""}`;

    // --- ✅ Chamada ao Gemini API
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: sysPrompt }] },
            ...messages.map(({ role, content }) => ({
              role,
              parts: [{ text: content }],
            })),
          ],
          generationConfig: {
            temperature,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const text = await geminiRes.text();
      console.error("Gemini API Error:", text);
      return res.status(500).json({ error: "Gemini error", details: text });
    }

    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.output ||
      "I'm sorry, I couldn’t generate a response.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
