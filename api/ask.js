// /api/ask.js  — versão para Google Gemini API
// Requer envs: GEMINI_API_KEY e AUTH_TOKEN

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  try {
    // segurança
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const {
      messages = [],
      systemPrompt = "Você é o assistente do portfólio da Carol.",
      knowledge = "",
      model = "gemini-1.5-flash", // modelo leve e gratuito
    } = body;

    // Monta o texto consolidado
    const conversation = messages
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n");

    const fullPrompt = `${systemPrompt}\n\nContexto adicional:\n${knowledge}\n\nHistórico:\n${conversation}`;

    // Chamada para Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: fullPrompt }],
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const details = await geminiRes.text();
      return res.status(500).json({ error: "Gemini error", details });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta.";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
