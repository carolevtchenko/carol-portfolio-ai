// Arquivo: api/feedback.js
import { google } from 'googleapis';

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

    // --- Auth do Assistente
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- Parse body
    const body = req.body;
    
    // ⚠️ ATUALIZADO: messageId adicionado à desestruturação
    const {
      feedback,
      assistantResponse,
      originalQuestion,
      timestamp,
      messageId, // <-- AGORA INCLUÍDO
    } = body;

    // ----------------------------------------------------
    // 1. AUTENTICAÇÃO
    // ----------------------------------------------------
    if (!process.env.GCP_SERVICE_ACCOUNT_JSON || !SPREADSHEET_ID) {
        return res.status(500).json({ error: "Google Sheets credentials or Spreadsheet ID missing." });
    }
    
    const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // ----------------------------------------------------
    // 2. INSERÇÃO DOS DADOS NA PLANILHA
    // ----------------------------------------------------
    const sheetName = 'Feedback Log'; // Ajuste este nome, se necessário
    
    // ⚠️ ATUALIZADO: messageId adicionado como o quinto valor (coluna E)
    const values = [
      [
        new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), 
        feedback,
        originalQuestion,
        assistantResponse,
        messageId, // <-- NOVO VALOR A SER INSERIDO
      ],
    ];

    const resource = { values };
    
    // O range 'A:E' agora mapeia para as 5 colunas acima
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:E`, 
      valueInputOption: 'USER_ENTERED',
      resource,
    });
    
    console.log("Feedback salvo com sucesso na Planilha do Google.");

    // Retorna 200 OK
    return res.status(200).json({ success: true, savedToSheet: true });

  } catch (err) {
    console.error("Erro ao salvar feedback na Planilha:", err.message);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}