export default async function handler(req, res) {
  try {
    // ... [Todo o seu código de CORS, Auth, Parse body, etc.] ...
    // ... [Até a chamada da API 'const r = await fetch(...)'] ...

    const raw = await r.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    // ------------------------------------------------------------------
    // ⬇️ TRATAMENTO DE ERROS HTTP (4xx, 5xx) ⬇️
    // ------------------------------------------------------------------
    if (!r.ok) {
        console.error("Gemini v1 error", { status: r.status, statusText: r.statusText, body: raw });

        let userFriendlyError;
        
        switch (r.status) {
            case 400: 
                userFriendlyError = "Your question was blocked due to safety reasons or is too long. Please try rephrasing it.";
                break;
            case 429: 
                userFriendlyError = "I'm sorry, the model for this AI assistant is busy right now. Please try sending your question again in a few seconds.";
                break;
            case 503: 
                userFriendlyError = "I'm sorry, the AI service is temporarily overloaded. Please try sending your question again in a few moments.";
                break;
            default: 
                userFriendlyError = "An unexpected internal error occurred. My apologies, please try sending your message again.";
        }
        
        return res.status(500).json({ 
            error: userFriendlyError, 
            status: r.status,
            statusText: r.statusText,
            details: raw || data
        });
    }
    // ------------------------------------------------------------------
    
    // ⬇️ NOVA LÓGICA (COM A MENSAGEM ESCOLHIDA) ⬇️

    // 1. Tente extrair a resposta
    const replyText =
      data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n");

    // 2. Verifique se a resposta existe
    if (!replyText) {
        // A API retornou 200 OK, mas sem texto
        console.warn("Gemini v1 warning: No reply text found (likely safety block)", { data });
        
        // 3. USE A SUA MENSAGEM DE ERRO PADRÃO (CONFORME SOLICITADO)
        return res.status(500).json({
            error: "An unexpected internal error occurred. My apologies, please try sending your message again.", 
            status: r.status, // Será 200
            statusText: "OK (No Content)",
            details: data
        });
    }
    
    // 4. Se tudo deu certo, retorne a resposta
    return res.status(200).json({ reply: replyText });

  } catch (err) {
    console.error("Server error", err);
    return res.status(500).json({ error: "An unexpected internal error occurred. My apologies, please try sending your message again.", details: String(err?.message || err) });
  }
}