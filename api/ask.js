// /api/ask.js — Gemini v1 (modelo correto) + logs de erro verbosos
// ENV: GEMINI_API_KEY, AUTH_TOKEN

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
    // Auth
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Body
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      messages = [],
      systemPrompt = "Você é o assistente do portfólio da Carol Levtchenko. Responda em PT-BR com clareza e objetividade.",
      knowledge = "",
      // ⚠️ sem prefixo "models/" aqui
      model = "gemini-2.5-flash",
      temperature = 0.7,
      topP = 0.95,
      topK = 40
    } = body;

    // Prompt único, compatível
    const historyTxt = messages
      .map(m => `${m.role === "assistant" ? "Assistente" : "Usuário"}: ${m.content}`)
      .join("\n");

    const fullPrompt =
`${systemPrompt}
${knowledge ? `\n### KNOWLEDGE\n${String(knowledge).slice(0, 100000)}\n` : ""}
### HISTÓRICO
${historyTxt || "Usuário: Oi!"}
`;

    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature, topP, topK }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const raw = await r.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!r.ok) {
      // também loga no servidor da Vercel para debug
      console.error("Gemini error", { status: r.status, statusText: r.statusText, raw });
      return res.status(500).json({
        error: "Gemini error",
        status: r.status,
        statusText: r.statusText,
        details: raw || data
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n") ||
      "(sem resposta)";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
