// /api/ask.js — Gemini com fallback (v1 → v1beta)
// Env: GEMINI_API_KEY, AUTH_TOKEN

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  try {
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    let {
      messages = [],
      systemPrompt = "Você é o assistente do portfólio da Carol.",
      knowledge = "",
      model = "gemini-1.5-flash-latest",
    } = body;

    const conversation = messages
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n");

    const fullPrompt = `${systemPrompt}\n\nContexto adicional:\n${knowledge}\n\nHistórico:\n${conversation}`;

    async function callGemini({ apiVersion, modelName }) {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        }),
      });
      return r;
    }

    // 1) Tenta v1 + modelo “latest”
    let resp = await callGemini({ apiVersion: "v1", modelName: model });
    if (!resp.ok) {
      const txt = await resp.text();

      // Se for NOT_FOUND (modelo/versão), tenta v1beta + 1.0-pro
      if (resp.status === 404 || /NOT_FOUND|v1beta/i.test(txt)) {
        resp = await callGemini({ apiVersion: "v1beta", modelName: "gemini-1.0-pro" });
        if (!resp.ok) {
          const det2 = await resp.text();
          return res.status(500).json({ error: "Gemini error", details: det2 });
        }
      } else {
        return res.status(500).json({ error: "Gemini error", details: txt });
      }
    }

    const data = await resp.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
