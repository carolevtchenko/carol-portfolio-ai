import { Resend } from 'resend'
import fetch from 'node-fetch'; 

// --- Variável Global ---
const resend = new Resend(process.env.RESEND_API_KEY)
// --- Variável Global da IA ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; // NOTA: O modelo no seu código de e-mail era "gemini-1.5-flash", mantive esse.

// --- HELPER FUNCTIONS (Mantidas) ---
function toPlainText(input = '') {
  let s = String(input).replace(/\r\n/g, '\n')
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  return s
}
function tidyLines(s = '') {
  return s
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2000-\u200B]/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n+/, '')
    .replace(/\n+\s*$/, '')
}
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
function normalizeUrl(u = '') {
  const s = String(u).trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://s`
}
// --- FIM DOS HELPER FUNCTIONS ---


// ----------------------------------------------------------------------
// FUNÇÃO DE SUMARIZAÇÃO DA IA (MANTIDA)
// ----------------------------------------------------------------------
async function summarizeConversation(conversationText) {
    if (!GEMINI_API_KEY) {
        return "⚠️ Não foi possível gerar o resumo. A chave da API Gemini está ausente.";
    }

    const systemPrompt = `
        You are an expert summary generator. Analyze the following conversation history between a User and Carol's Assistant. 
        Your task is to identify and summarize the key topics discussed.
        
        Rules:
        1. Identify the 3 to 5 main topics or groups of related questions.
        2. Provide a brief, engaging summary (2-3 sentences max) for each topic.
        3. Format the output strictly as a clean, unordered markdown list.
           **The title/name of each topic must be in bold markdown (e.g., * **Topic Name:** Summary...).**
        4. DO NOT include any conversation metadata, greetings, or the final signature.
        5. DO NOT include the assistant's initial welcome message or any explicit feedback messages (e.g., 'Yes', 'No', 'Thanks for your feedback!').
        6. EXCLUDE any topics related to the *process* of sending the chat history via email (e.g., offering to send the email, asking for a name, asking for an email address). Focus only on the professional content discussed.
    `;

    const fullPrompt = systemPrompt + "\n\n### CONVERSATION TEXT\n" + conversationText;
    
    const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
                generationConfig: { 
                    temperature: 0.2, 
                    maxOutputTokens: 1024 
                }
            })
        });

        const raw = await r.json();

        if (!r.ok || !raw.candidates?.[0]?.content?.parts) {
            console.error("Gemini API Error:", raw);
            return "⚠️ Failed to generate summary due to AI service error.";
        }

        return raw.candidates[0].content.parts.map(p => p.text).join('\n');
    } catch (e) {
        console.error("Error during AI summarization fetch:", e);
        return "⚠️ Failed to generate summary due to server connection error.";
    }
}
// ----------------------------------------------------------------------


// ⬇️ FUNÇÃO DO HISTÓRICO (LÓGICA CORRIGIDA) ⬇️
function generateHistoryHtml(rawConversationText) {
    const lines = rawConversationText.split('\n');
    const blocks = [];
    const fontStack = "'Manrope', Arial, sans-serif";

    // --- (MUDANÇA APLICADA AQUI) ---
    // Agrupa linhas órfãs na mensagem anterior
    for (const line of lines) {
        if (line.trim().length === 0) continue; // Pula linhas em branco
        
        // Se a linha começa com um prefixo de 'role', é uma nova mensagem
        if (line.startsWith('User: ') || line.startsWith('Assistant: ')) {
            blocks.push(line);
        } else {
            // Se não começa, é uma continuação da mensagem anterior
            if (blocks.length > 0) {
                blocks[blocks.length - 1] += '\n' + line; // Adiciona a linha ao bloco anterior
            }
            // (Ignora linhas órfãs no início)
        }
    }
    // --- (FIM DA MUDANÇA) ---

    // Agora 'blocks' contém as mensagens agrupadas corretamente.
    // O código .map() abaixo funciona como estava.
    return blocks.map(block => {
        const parts = block.split(': ');
        if (parts.length < 2) return ''; 

        const role = parts[0].trim();
        const content = parts.slice(1).join(': ').trim();
        const isUser = role === 'User';
        
        const align = isUser ? 'right' : 'left';
        const bgColor = isUser ? '#E8F5FF' : '#F0F0F0'; 
        const headerColor = '#555555'; // Cor unificada
        const headerAlign = align; 
        const textColor = '#1a1a1a';

        const displayName = isUser ? 'You' : "Carol's Assistant"; 
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const headerText = `${displayName} - ${dateStr} | ${timeStr}`;
        
        // Converte o markdown do conteúdo da bolha
        const processedContent = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // 1. Converte bold
            .replace(/\n/g, '<br/>'); // 2. Converte quebras de linha

        return `
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td>
                        <table align="${align}" border="0" cellspacing="0" cellpadding="0" style="max-width: 75%; border-collapse: collapse;"> 
                            <tr>
                                <td style="font-size: 11px; color: ${headerColor}; padding: 0 5px 4px 5px; font-weight: 600; font-family: ${fontStack}; text-align: ${headerAlign};">
                                    ${headerText}
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color: ${bgColor}; color: ${textColor}; padding: 12px; border-radius: 10px; font-size: 14px; line-height: 1.5; font-family: ${fontStack};">
                                    ${processedContent} </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            <div style="height: 10px; line-height: 10px; font-size: 10px;">&nbsp;</div>
        `;
    }).join('');
}
// ⬆️ FIM DA FUNÇÃO ⬆️


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const body = req.body;
  const fontStack = "'Manrope', Arial, sans-serif"; // Nossa fonte
  
  // ----------------------------------------------------------------------
  // 1. CHAVE DE DECISÃO: O NOVO FLUXO (AI ASSISTANT)
  // ----------------------------------------------------------------------
  if (body.raw_conversation_text && body.email_template) {
    const { to_email, user_name, raw_conversation_text, email_template } = body;
    
    if (!to_email || !email_template) {
        return res.status(400).json({ error: 'Campos obrigatórios do Assistente ausentes (e-mail ou template)' });
    }
    
    try {
        // A. Processamento da IA (Sumarização)
        const topicSummary = await summarizeConversation(raw_conversation_text);
        
        // B. Geração do HTML do Histórico (PURO)
        const historyHtml = generateHistoryHtml(raw_conversation_text);

        // ------------------------------------------------------------
        // C. MONTAGEM FINAL DO TEMPLATE (LÓGICA DE ERRO MANTIDA)
        // ------------------------------------------------------------
        
        let processedTemplate = email_template; // Define template inicial

        // 1. Verificar Resumo e Injetar
        if (topicSummary.startsWith('⚠️')) {
            // Se a sumarização falhou, remove o placeholder (não mostra nada)
            processedTemplate = processedTemplate.replace('[[TOPIC_SUMMARY_PLACEHOLDER]]', '');
        } else {
            // Se teve sucesso, formata e injeta o resumo
            // A lógica de conversão .replace() já lida com o novo formato bold
            const topicSummaryHtml = topicSummary
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*/g, '•')
                .replace(/\n/g, '<br/>');

            processedTemplate = processedTemplate.replace('[[TOPIC_SUMMARY_PLACEHOLDER]]',
                `<div style="padding: 10px 0 20px 0; font-size: 14px; line-height: 1.5; color: #1a1a1a; font-family: ${fontStack};">${topicSummaryHtml}</div>`
            );
        }
        
        // 2. Converte \n para <br> APENAS no template de TEXTO.
        processedTemplate = processedTemplate.replace(/\n/g, '<br/>');

        // 3. AGORA, substituímos o placeholder pelo HTML PURO. (aplicando a fonte)
        const finalHtml = processedTemplate.replace('[[CONVERSATION_HISTORY]]', `
            <div style="padding-top: 20px; padding-bottom: 10px; font-weight: bold; font-size: 16px; font-family: ${fontStack};">
                History of conversation:
            </div>
            ${historyHtml}
        `); 
        
        // 4. Estilização do Wrapper Principal
        const htmlWrapper = `
            <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>Portfolio - AI chat history</title> <style type="text/css">
                    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600&display=swap');
                </style>
                </head>
            <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: ${fontStack};">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td style="padding: 20px 0 30px 0;">
                            <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                                <tr>
                                    <td style="padding: 30px 30px 10px 30px; color: #1a1a1a; font-family: ${fontStack}; font-size: 14px; line-height: 1.6;">
                                        ${finalHtml}
                                    </td>
                                </tr>
                                </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        const data = await resend.emails.send({
            // (REMETENTE DO FLUXO AI)
            from: 'Carol Levtchenko <ai.assistant@carol-levtchenko.com>',
            to: to_email,
            subject: 'Portfolio - AI chat history',
            html: htmlWrapper, 
        });

        return res.status(200).json({ success: true, flow: "AI_SUMMARY", data });
        
    } catch (error) {
        console.error('Erro ao enviar e-mail (AI Flow):', error)
        return res.status(500).json({ error: 'Erro ao enviar o e-mail (Fluxo AI)' })
    }
  } 
  
  // ----------------------------------------------------------------------
  // 2. FLUXO EXISTENTE (FALLBACK) - (MANTIDO)
  // ----------------------------------------------------------------------
  else {
    const { to_email, message, link, linkLabel, signature, displayLink } = body

    if (!to_email || !message || !link || !linkLabel || !signature) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' })
    }

    try {
      const msg = escapeHtml(tidyLines(toPlainText(message)))
      const sig = escapeHtml(tidyLines(toPlainText(signature)))

      const href = normalizeUrl(link) 
      const linkText = escapeHtml((displayLink && displayLink.trim()) || link) 

      const html = `
        <div style="font-family: ${fontStack}; font-size: 14px; color: #000000;">
          <div style="margin: 0; white-space: pre-line;">${msg}</div>
          <br />
          <div style="margin: 0;">
            ${escapeHtml(linkLabel)}: <a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a>
          </div>
          <br />
          <div style="margin: 0; white-space: pre-line;">${sig}</div>
        </div>
      `
      const data = await resend.emails.send({
        // (REMETENTE DO FLUXO ORIGINAL/REMINDER)
        from: 'Carol Levtchenko <reminder@carol-levtchenko.com>',
        to: to_email,
        subject: 'Portfolio - Senior Product Designer',
        html,
      })

      return res.status(200).json({ success: true, flow: "ORIGINAL_LINK", data })
    } catch (error) {
      console.error('Erro ao enviar e-mail (Original Flow):', error)
      return res.status(500).json({ error: 'Erro ao enviar o e-mail (Fluxo Original)' })
    }
  }
}