// pages/api/sync-knowledge.js
import { Index } from "@upstash/vector"; // ⬅️ MUDANÇA
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Para o scraper (Puppeteer)
import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";

// Para ler seu arquivo de knowledge
import fs from "fs/promises";
import path from "path";

// --- Configurações do Scraper ---
const PORTFOLIO_URL = "https://carol-levtchenko.com/"; // ⚠️ MUDE AQUI
const PORTFOLIO_PASSWORD = process.env.PORTFOLIO_PASSWORD; // ⚠️ CRIE ESSA ENV VAR!
// ------------------------------

// ⬇️ INICIALIZAÇÃO DO NOVO BANCO UPSTASH ⬇️
const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});
// ⬆️ FIM DA INICIALIZAÇÃO ⬆️

async function getBrowserInstance() {
  const executablePath = await chromium.executablePath;
  if (!executablePath) {
    // Ambiente local
    const puppeteerLocal = (await import("puppeteer")).default;
    return puppeteerLocal.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
  }
  
  // Ambiente Vercel
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
}

// Função para fazer o scraping (NENHUMA MUDANÇA AQUI)
async function scrapePortfolioContent() {
  if (!PORTFOLIO_PASSWORD) {
    console.warn("PORTFOLIO_PASSWORD não definida. Pulando scraping.");
    return "";
  }
  let browser = null;
  try {
    browser = await getBrowserInstance();
    const page = await browser.newPage();
    console.log("Iniciando scraping...");
    await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2" });

    // 1. Fazer Login
    const passwordInputSelector = 'input[type="password"]';
    const submitButtonSelector = 'button[type="submit"]';

    await page.waitForSelector(passwordInputSelector, { timeout: 10000 });
    await page.type(passwordInputSelector, PORTFOLIO_PASSWORD);
    await page.click(submitButtonSelector);

    await page.waitForNavigation({ waitUntil: "networkidle2" });
    console.log("Login realizado com sucesso.");

    // 2. Extrair Conteúdo
    const content = await page.evaluate(() => {
        document.querySelectorAll('script, style, svg, nav, footer, button, a[href*="mailto:"]').forEach(el => el.remove());
        return document.body.innerText;
    });

    console.log(`Scraping finalizado. ${content.length} caracteres encontrados.`);
    return content;

  } catch (e) {
    console.error("Erro durante o scraping:", e.message);
    return "";
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Handler da API
export default async function handler(req, res) {
  // 1. Segurança (Cron Secret)
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Iniciando 'sync-knowledge'...");

    // 2. Carregar Knowledge Estático
    const txtPath = path.resolve(process.cwd(), "_private", "knowledge.txt");
    let staticKnowledge = "";
    try {
      staticKnowledge = await fs.readFile(txtPath, "utf-8");
      console.log("Knowledge estático carregado do .txt");
    } catch (e) {
      console.warn("Não foi possível ler _private/knowledge.txt");
    }

    // 3. Carregar Knowledge Dinâmico (Scraping)
    const dynamicKnowledge = await scrapePortfolioContent();
    const fullKnowledge = staticKnowledge + "\n\n" + dynamicKnowledge;

    if (fullKnowledge.trim().length < 100) {
      console.log("Nenhum conteúdo novo para indexar.");
      return res.status(200).json({ message: "Nenhum conteúdo novo para indexar." });
    }

    // 4. Quebrar em "Chunks"
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 100,
    });
    // Agora só precisamos do texto, não de "Documents"
    const chunks = await splitter.splitText(fullKnowledge);
    console.log(`Texto quebrado em ${chunks.length} chunks.`);
    
    // 5. ⬇️ MUDANÇA: Formatar para o Upstash
    const vectors = chunks.map((chunk, i) => ({
        id: `chunk-${Date.now()}-${i}`, // ID único para cada chunk
        data: chunk, // O texto vai aqui. O Upstash vai criar o embedding.
        metadata: { source: i < 3 ? 'static' : 'portfolio' } // Opcional
    }));

    // 6. ⬇️ MUDANÇA: Indexar (Salvar) no Upstash Vector
    console.log("Iniciando indexação no Upstash Vector...");
    
    // Apaga todos os vetores antigos antes de inserir novos
    await index.reset();
    console.log("Índice antigo resetado.");

    // Insere os novos chunks em lotes (batch)
    for (let i = 0; i < vectors.length; i += 100) {
        const batch = vectors.slice(i, i + 100);
        await index.upsert(batch);
        console.log(`Lote ${i/100 + 1} indexado.`);
    }

    console.log("Indexação concluída com sucesso.");

    return res.status(200).json({
      message: "Sync concluído!",
      chunks: vectors.length,
    });
  } catch (e) {
    console.error("Erro no 'sync-knowledge':", e);
    return res.status(500).json({ error: e.message });
  }
}