// Arquivo: api/feedback.js
import { google } from 'googleapis';

// Coloque o ID da sua Planilha no Vercel como uma variável de ambiente SHEET_ID
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

    // --- Auth do Assistente (mantida por segurança)
    const expected = `Bearer ${process.env.AUTH_TOKEN}`;
    if (!process.env.AUTH_TOKEN || (req.headers.authorization || "") !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- Parse body
    const body = req.body;
    
    const {
      feedback,
      assistantResponse,
      originalQuestion,
      timestamp,
      // ... messageId, etc.
    } = body;

    // ----------------------------------------------------
    // 1. AUTENTICAÇÃO COM A CHAVE JSON DA CONTA DE SERVIÇO
    // ----------------------------------------------------
    if (!process.env.GCP_SERVICE_ACCOUNT_JSON || !SPREADSHEET_ID) {
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
    const sheetName = 'Sheet1'; // Ou o nome da sua aba (ex: 'Feedback Log')
    
    // Os dados a serem inseridos, na ordem das colunas da sua planilha
    const values = [
      [
        new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), // Formato legível
        feedback,
        originalQuestion,
        assistantResponse,
        // Adicione aqui outros campos (messageId, etc.)
      ],
    ];

    const resource = { values };
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:E`, // Ajuste 'A:E' para a sua faixa de colunas
      valueInputOption: 'USER_ENTERED',
      resource,
    });
    
    console.log("Feedback salvo com sucesso na Planilha do Google.");

    // Retorna 200 OK
    return res.status(200).json({ success: true, savedToSheet: true });

  } catch (err) {
    console.error("Erro ao salvar feedback na Planilha:", err.message);
    // Em caso de falha, retorna 500 para debug, mas mantém o frontend informado.
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}