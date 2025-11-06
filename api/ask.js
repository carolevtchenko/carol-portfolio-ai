export default async function handler(req, res) {
  try {
    // --- CORS (logo no início)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.status(204).end();

    // --- Apenas POST
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // --- Auth por token
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- Parse body
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const {
      messages = [],
      systemPrompt = "You are Carol Levtchenko’s professional portfolio assistant. Answer in English unless asked otherwise.",
      knowledge = "",
      // ⚠️ no v1 NÃO usar prefixo "models/"
      model = "gemini-2.5-flash",
      temperature = 0.7,
      topP = 0.95,
      topK = 40,
      maxOutputTokens = 1024,
    } = body;

    // --- Concatena system + knowledge + histórico em um único prompt (compatível com v1)
    const historyTxt = (messages || [])
      .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
      .join("\n");

    const fullPrompt =
`${systemPrompt}
${knowledge ? `\n### KNOWLEDGE\n${String(knowledge).slice(0, 100000)}` : ""}
### HISTORY
${historyTxt || "User: Hi!"}
`;

    // --- Chamada v1 (query param ?key=)
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature, topP, topK, maxOutputTokens }
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
      // loga no servidor (aparece nos logs da Vercel)
      console.error("Gemini v1 error", { status: r.status, statusText: r.statusText, body: raw });
      return res.status(500).json({
        error: "Gemini error",
        status: r.status,
        statusText: r.statusText,
        details: raw || data
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n") ||
      "(no reply)";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
