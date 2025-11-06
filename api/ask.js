// /api/ask.js — Gemini v1 com parse robusto
// ENV necessárias: GEMINI_API_KEY, AUTH_TOKEN

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
    // Auth simples por header
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Corpo da requisição
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      messages = [],
      systemPrompt = "Você é o assistente do portfólio da Carol Levtchenko. Responda com clareza e objetividade em PT-BR.",
      knowledge = "",
      model = "models/gemini-2.5-flash",
      temperature = 0.7,
      topP = 0.95,
      topK = 40,
    } = body;

    // Converte histórico para o formato do Gemini
    // Roles aceitos: "user" e "model"
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    }));

    // System instruction recomendado pela API
    const systemInstruction = {
      role: "system",
      parts: [{
        text: `${systemPrompt}${knowledge ? `\n\n### KNOWLEDGE\n${String(knowledge).slice(0, 100000)}` : ""}`
      }]
    };

    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const payload = {
      systemInstruction,
      contents,
      generationConfig: { temperature, topP, topK }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Parse robusto: tenta JSON, senão devolve texto bruto
    const raw = await r.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!r.ok) {
      return res.status(500).json({ error: "Gemini error", details: data });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n") ??
      "(sem resposta)";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
