// Arquivo: api/feedback.js
import { google } from 'googleapis';

// Certifique-se de que SHEET_ID está configurado nas variáveis de ambiente do Vercel
const SPREADSHEET_ID = process.env.SHEET_ID; 

export default async function handler(req, res) {
  try {
    // --- CORS e Método
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
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
    const body = req.body;
    
    // Desestrutura os 5 campos (certifique-se de que o payload do front-end é enviado corretamente)
    const {
      feedback,
      assistantResponse,
      originalQuestion,
      timestamp,
      messageId, 
    } = body;

    // ----------------------------------------------------
    // 1. VERIFICAÇÃO DE CREDENCIAIS E AUTENTICAÇÃO
    // ----------------------------------------------------
    if (!process.env.GCP_SERVICE_ACCOUNT_JSON || !SPREADSHEET_ID) {
        // Loga um erro claro no Vercel se as variáveis estiverem faltando
        console.error("ERRO: Credenciais ou ID da Planilha faltando.");
        return res.status(500).json({ error: "Google Sheets credentials or Spreadsheet ID missing." });
    }
    
    // Converte a string JSON da variável de ambiente de volta para um objeto
    const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // ----------------------------------------------------
    // 2. INSERÇÃO DOS DADOS NA PLANILHA
    // ----------------------------------------------------
    // ⚠️ ATUALIZE O NOME DA ABA SE 'Feedback Log' NÃO FOR O NOME EXATO
    const sheetName = 'Sheet1'; 
    
    // Os dados a serem inseridos, na ordem das colunas da sua planilha (A, B, C, D, E)
    const values = [
      [
        new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), // Coluna A: Timestamp formatado
        feedback,                 // Coluna B: Yes/No
        originalQuestion,         // Coluna C: Pergunta Original
        assistantResponse,        // Coluna D: Resposta do Assistente
        messageId,                // Coluna E: Message ID
      ],
    ];

    const resource = { values };
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:E`, // Faixa que cobre as 5 colunas acima
      valueInputOption: 'USER_ENTERED',
      resource,
    });
    
    console.log("Feedback salvo com sucesso na Planilha do Google.");

    // Retorna 200 OK
    return res.status(200).json({ success: true, savedToSheet: true });

  } catch (err) {
    console.error("Erro fatal ao salvar feedback na Planilha:", err.message);
    // Em caso de falha, retorna 500 para debug.
    return res.status(500).json({ error: "Server error: Failed to log feedback", details: String(err?.message || err) });
  }
}