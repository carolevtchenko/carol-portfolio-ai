// /api/ask.js — Gemini v1 (modelo correto) + logs de erro verbosos
// ENV: GEMINI_API_KEY, AUTH_TOKEN
// CORS (coloque isso no início do handler, antes de qualquer return)
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Max-Age", "600"); // cache do preflight

if (req.method === "OPTIONS") {
  return res.status(204).end(); // 204 é melhor pra preflight
}


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
export default async function handler(req, res) {
  // 🔹 CORS (precisa vir logo no início)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600"); // cache preflight

  if (req.method === "OPTIONS") {
    return res.status(204).end(); // resposta para o preflight
  }

  // 🔹 Só aceita POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // 🔹 Autenticação simples com AUTH_TOKEN
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 🔹 Lê corpo da requisição
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const {
      messages = [],
      systemPrompt = "You are the professional portfolio assistant of Carol Levtchenko.",
      knowledge = "",
      model = "models/gemini-2.5-flash",
      temperature = 0.3,
    } = body;

    // 🔹 Monta o prompt principal
    const sysPrompt = `${systemPrompt}${knowledge ? `\n\n### KNOWLEDGE\n${String(knowledge).slice(0, 100000)}` : ""}`;

    // 🔹 Chamada à API do Gemini (Google Generative Language)
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

    // 🔹 Trata erros da API
    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini API Error:", errorText);
      return res.status(500).json({ error: "Gemini error", details: errorText });
    }

    // 🔹 Extrai a resposta
    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.output ||
      "";

    // 🔹 Retorna para o frontend
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
