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
    if (
      !process.env.AUTH_TOKEN ||
      (req.headers.authorization || "") !== expected
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const {
      messages = [],
      systemPrompt = "Você é o assistente do portfólio da Carol Levtchenko.",
      knowledge = "",
      model = "models/gemini-2.5-flash",
      temperature = 0.7,
    } = body;

    const sys = [
      {
        role: "system",
        content: `${systemPrompt}${
          knowledge ? `\n\n### KNOWLEDGE\n${String(knowledge).slice(0, 100000)}` : ""
        }`,
      },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [...sys, ...messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] }))],
          generationConfig: { temperature },
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(500).json({ error: "Gemini error", details: data });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "(sem resposta)";
    return res.status(200).json({ reply });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Server error", details: String(err?.message || err) });
  }
}
