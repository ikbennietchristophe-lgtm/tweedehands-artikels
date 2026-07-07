import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// No server-side refresh token storage needed. Client-side Firebase Auth provides the access token.

// ==========================================
// API ROUTES
// ==========================================

// Auth Configuration Status API (Simplified since Firebase handles OAuth)
app.get("/api/auth/config", (req, res) => {
  res.json({
    configured: true,
  });
});

// Get folders inside 'tweedehands_afbeeldingen'
app.get("/api/folders", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.json({ mode: "real", authenticated: false, folders: [] });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    // 1. Search for 'tweedehands_afbeeldingen' folder
    const searchFolderRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: "name = 'tweedehands_afbeeldingen' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: "files(id, name)",
        }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!searchFolderRes.ok) {
      throw new Error(`Fout bij zoeken naar map: ${await searchFolderRes.text()}`);
    }

    const searchFolderData = (await searchFolderRes.json()) as { files: Array<{ id: string; name: string }> };

    if (!searchFolderData.files || searchFolderData.files.length === 0) {
      // Parent folder does not exist yet. Return special status so the frontend can offer to bootstrap it.
      return res.json({ mode: "real", authenticated: true, parentFolderNotFound: true, folders: [] });
    }

    const parentFolderId = searchFolderData.files[0].id;

    // 2. Fetch subfolders of 'tweedehands_afbeeldingen'
    const listSubfoldersRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id, name)",
          pageSize: "100",
        }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listSubfoldersRes.ok) {
      throw new Error(`Fout bij ophalen submappen: ${await listSubfoldersRes.text()}`);
    }

    const subfoldersData = (await listSubfoldersRes.json()) as { files: Array<{ id: string; name: string }> };

    res.json({ mode: "real", authenticated: true, folders: subfoldersData.files || [] });
  } catch (error: any) {
    console.error("Fout in /api/folders:", error);
    res.status(500).json({ mode: "real", authenticated: true, error: error.message });
  }
});

// Setup sample folder structure in user's Google Drive
app.post("/api/setup-samples", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Niet ingelogd met Google Account." });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    // 1. Create parent folder 'tweedehands_afbeeldingen'
    const createParentRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "tweedehands_afbeeldingen",
        mimeType: "application/vnd.google-apps.folder",
      }),
    });

    if (!createParentRes.ok) {
      throw new Error(`Kon hoofdmap niet maken: ${await createParentRes.text()}`);
    }

    const parentFolder = (await createParentRes.json()) as { id: string };

    // 2. Create subfolder "Vintage Analoge Camera"
    const createSubRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Vintage Analoge Camera",
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolder.id],
      }),
    });

    if (!createSubRes.ok) {
      throw new Error(`Kon submap niet maken: ${await createSubRes.text()}`);
    }

    const subFolder = (await createSubRes.json()) as { id: string };

    // 3. Upload a beautiful sample camera image into the subfolder
    // Fetch a real public image of a retro camera from Unsplash
    const imageUrl = "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&q=80";
    const imgFetch = await fetch(imageUrl);
    if (imgFetch.ok) {
      const imgBuffer = await imgFetch.arrayBuffer();

      // Initiate simple metadata-and-media upload using Multipart upload
      const metadata = {
        name: "vintage_camera.jpg",
        parents: [subFolder.id],
        mimeType: "image/jpeg",
      };

      // Construct multipart form data body manually
      const boundary = "-------314159265358979323846";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const header =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\n\r\n';

      // Convert image buffer to base64
      const uint8 = new Uint8Array(imgBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64Data = btoa(binary);

      const bodyMultipart = header + base64Data + closeDelim;

      const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: bodyMultipart,
      });

      if (!uploadRes.ok) {
        console.error("Failed uploading sample image to Drive:", await uploadRes.text());
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Fout bij aanmaken mappenstructuur:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/analyze: Analyseer afbeeldingen uit een map
app.post("/api/analyze", async (req, res) => {
  const { folder_id } = req.body;

  if (!folder_id) {
    return res.status(400).json({ error: "folder_id is verplicht" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Niet ingelogd met Google Account" });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY_MISSING",
      message: "De Gemini API Key is niet geconfigureerd in de backend.",
    });
  }

  try {
    const accessToken = authHeader.split(" ")[1];

    // 1. List files inside the selected subfolder
    const listFilesRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: `'${folder_id}' in parents and trashed = false`,
          fields: "files(id, name, mimeType)",
          pageSize: "15",
        }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listFilesRes.ok) {
      throw new Error(`Kon bestanden in submap niet ophalen: ${await listFilesRes.text()}`);
    }

    const filesData = (await listFilesRes.json()) as { files: Array<{ id: string; name: string; mimeType: string }> };
    const imageFiles = (filesData.files || []).filter((f) => f.mimeType.startsWith("image/"));

    if (imageFiles.length === 0) {
      return res.status(400).json({
        error: "NO_IMAGES_FOUND",
        message: "Geen afbeeldingen gevonden in deze map. Upload eerst afbeeldingen (.jpg, .png) naar deze map in Google Drive.",
      });
    }

    // Download up to 3 images and encode as base64
    const maxImages = imageFiles.slice(0, 3);
    const imageParts = await Promise.all(
      maxImages.map(async (file) => {
        const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!mediaRes.ok) {
          throw new Error(`Afbeelding downloaden mislukt voor ${file.name}`);
        }

        const arrayBuffer = await mediaRes.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = "";
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64String = btoa(binaryString);

        return {
          inlineData: {
            mimeType: file.mimeType,
            data: base64String,
          },
        };
      })
    );

    // Call the Gemini API with Google Search and structured JSON schema
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const systemPrompt =
      "Je bent een expert in e-commerce en producttaxatie voor de Nederlandse en Belgische tweedehandsmarkt (Marktplaats, 2dehands.be, Vinted, Facebook Marketplace). Gegeven de bijgevoegde afbeelding(en) van één specifiek product, voer een live marktonderzoek uit met je Google Search tool. Zoek naar actuele advertenties en recente verkopen van dit specifieke merk en model op Marktplaats.nl en 2dehands.be. Genereer een antwoord dat STRICT voldoet aan het volgende JSON-formaat: { 'product_identificatie': { 'merk': 'string', 'model': 'string', 'geschatte_staat': 'string' }, 'prijs_analyse': { 'marktprijs_min': number, 'marktprijs_max': number, 'aanbevolen_vraagprijs': number, 'minimaal_acceptabele_prijs': number, 'toelichting_prijs': 'string' }, 'advertentie': { 'titel': 'string', 'beschrijving': 'string', 'tags': ['string'] } }";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...imageParts,
        { text: systemPrompt },
      ],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            product_identificatie: {
              type: Type.OBJECT,
              properties: {
                merk: { type: Type.STRING },
                model: { type: Type.STRING },
                geschatte_staat: { type: Type.STRING },
              },
              required: ["merk", "model", "geschatte_staat"],
            },
            prijs_analyse: {
              type: Type.OBJECT,
              properties: {
                marktprijs_min: { type: Type.NUMBER },
                marktprijs_max: { type: Type.NUMBER },
                aanbevolen_vraagprijs: { type: Type.NUMBER },
                minimaal_acceptabele_prijs: { type: Type.NUMBER },
                toelichting_prijs: { type: Type.STRING },
              },
              required: [
                "marktprijs_min",
                "marktprijs_max",
                "aanbevolen_vraagprijs",
                "minimaal_acceptabele_prijs",
                "toelichting_prijs",
              ],
            },
            advertentie: {
              type: Type.OBJECT,
              properties: {
                titel: { type: Type.STRING },
                beschrijving: { type: Type.STRING },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["titel", "beschrijving", "tags"],
            },
          },
          required: ["product_identificatie", "prijs_analyse", "advertentie"],
        },
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Geen tekst ontvangen van Gemini API.");
    }

    const parsedResult = JSON.parse(textResult.trim());
    res.json(parsedResult);
  } catch (error: any) {
    console.error("Fout in /api/analyze:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// VITE CLIENT MIDDLEWARE & SERVER STARTUP
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Tweedehands Generator] Server gestart op http://localhost:${PORT}`);
  });
}

startServer();
