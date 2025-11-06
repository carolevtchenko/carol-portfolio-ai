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
    const {
      messages = [],
      systemPrompt = "You are a helpful portfolio assistant.",
      knowledge = "",
      model = "gpt-4o-mini",
      temperature = 0.2,
    } = body;

    const sys = [{
      role: "system",
      content: `${systemPrompt}${knowledge ? `\n\n### KNOWLEDGE\n${String(knowledge).slice(0,100000)}` : ""}`,
    }];

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [...sys, ...messages.map(({ role, content }) => ({ role, content }))],
      }),
    });

    if (!openaiRes.ok) {
      const details = await openaiRes.text();
      return res.status(500).json({ error: "OpenAI error", details });
    }

    const data = await openaiRes.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
