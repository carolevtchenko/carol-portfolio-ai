// Arquivo: api/feedback.js

export default async function handler(req, res) {
  try {
    // --- CORS e Método (para aceitar requisições de outros domínios)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // --- Auth (usando o mesmo token de segurança do api/ask.js)
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- Parse body (espera o payload do frontend)
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const {
      feedback,           // 'Yes' ou 'No'
      messageId,          // ID da bolha de feedback
      assistantResponse,  // O texto da resposta avaliada
      originalQuestion,   // A pergunta que gerou a resposta
      timestamp,
      // ... outros campos (user_id, etc.)
    } = body;

    // =======================================================
    // ⚠️ AQUI VOCÊ ADICIONA SUA LÓGICA DE ARMAZENAMENTO REAL!
    // Exemplo:
    // await db.collection('feedback').insert({ 
    //     feedback, assistantResponse, originalQuestion, timestamp 
    // });
    // =======================================================
    
    // Loga no console para fins de debug (visível nos logs da Vercel)
    console.log("FEEDBACK RECEBIDO:", body);

    // Retorna 200 OK
    return res.status(200).json({ success: true, received: body });
  } catch (err) {
    console.error("Feedback server error", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}