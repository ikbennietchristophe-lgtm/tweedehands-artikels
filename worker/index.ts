/**
 * Cloudflare Worker Backend for Second-Hand Ad & Pricing Generator
 * Handles Google Drive integration and Gemini 2.5 Flash API with Google Search Tool.
 */

export interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  REDIRECT_URI?: string;
  GEMINI_API_KEY: string;
}

// CORS helper to add response headers
function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Handles preflight OPTIONS request
function handleOptions(request: Request) {
  return new Response(null, {
    headers: corsHeaders(request),
  });
}

// Retrieves a valid Google API Access Token from the Authorization header
function getValidAccessToken(request: Request): string {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  throw new Error("Geen Google access token meegegeven in de Authorization header.");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle Preflight OPTIONS
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    const headers = corsHeaders(request);

    try {
      // 1. Auth config endpoint (tells frontend we are configured)
      if (url.pathname === "/api/auth/config") {
        return new Response(JSON.stringify({ configured: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      // 2. GET /api/folders Endpoint
      if (url.pathname === "/api/folders" || url.pathname === "/api/folders/") {
        let accessToken: string;
        try {
          accessToken = getValidAccessToken(request);
        } catch (e: any) {
          return new Response(JSON.stringify({ mode: "real", authenticated: false, folders: [], error: e.message }), {
            status: 200, // keep 200 so frontend parses gracefully
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        // Search for the parent folder 'tweedehands_afbeeldingen' in Google Drive
        const searchFolderRes = await fetch(
          "https://www.googleapis.com/drive/v3/files?" +
            new URLSearchParams({
              q: "name = 'tweedehands_afbeeldingen' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
              fields: "files(id, name)",
            }),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!searchFolderRes.ok) {
          const errText = await searchFolderRes.text();
          return new Response(JSON.stringify({ error: "Failed searching drive", details: errText }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const searchFolderData = (await searchFolderRes.json()) as { files: Array<{ id: string; name: string }> };

        if (!searchFolderData.files || searchFolderData.files.length === 0) {
          // If the folder doesn't exist, return parentFolderNotFound: true to prompt setup
          return new Response(JSON.stringify({ mode: "real", authenticated: true, parentFolderNotFound: true, folders: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const parentFolderId = searchFolderData.files[0].id;

        // Fetch subfolders of 'tweedehands_afbeeldingen'
        const listSubfoldersRes = await fetch(
          "https://www.googleapis.com/drive/v3/files?" +
            new URLSearchParams({
              q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
              fields: "files(id, name)",
              pageSize: "100",
            }),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!listSubfoldersRes.ok) {
          const errText = await listSubfoldersRes.text();
          return new Response(JSON.stringify({ error: "Failed listing subfolders", details: errText }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const subfoldersData = (await listSubfoldersRes.json()) as { files: Array<{ id: string; name: string }> };

        return new Response(JSON.stringify({ mode: "real", authenticated: true, folders: subfoldersData.files || [] }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      // 3. POST /api/setup-samples Endpoint
      if (url.pathname === "/api/setup-samples" && request.method === "POST") {
        let accessToken: string;
        try {
          accessToken = getValidAccessToken(request);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "unauthorized", details: e.message }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        // Create parent folder 'tweedehands_afbeeldingen'
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
          const errText = await createParentRes.text();
          return new Response(JSON.stringify({ error: "Failed creating parent folder", details: errText }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const parentFolder = (await createParentRes.json()) as { id: string };

        // Create subfolder 'Vintage Analoge Camera'
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
          const errText = await createSubRes.text();
          return new Response(JSON.stringify({ error: "Failed creating subfolder", details: errText }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const subFolder = (await createSubRes.json()) as { id: string };

        // Download a public image and upload it to the subfolder
        const imageUrl = "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&q=80";
        const imgFetch = await fetch(imageUrl);
        if (imgFetch.ok) {
          const imgBuffer = await imgFetch.arrayBuffer();

          const metadata = {
            name: "vintage_camera.jpg",
            parents: [subFolder.id],
            mimeType: "image/jpeg",
          };

          const boundary = "-------314159265358979323846";
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelim = `\r\n--${boundary}--`;

          const header =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\n\r\n';

          // Convert arrayBuffer to Base64 in standard JS
          const uint8Array = new Uint8Array(imgBuffer);
          let binaryString = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
          }
          const base64Data = btoa(binaryString);

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

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      // 4. POST /api/analyze Endpoint
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        const body = (await request.json()) as { folder_id?: string };
        const folderId = body.folder_id;

        if (!folderId) {
          return new Response(JSON.stringify({ error: "folder_id is verplicht" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        let accessToken: string;
        try {
          accessToken = getValidAccessToken(request);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "unauthorized", details: e.message }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const geminiApiKey = env.GEMINI_API_KEY;
        if (!geminiApiKey) {
          return new Response(
            JSON.stringify({
              error: "GEMINI_API_KEY_MISSING",
              message: "De Gemini API Key is niet geconfigureerd in de Cloudflare Worker.",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        // List files in the selected subfolder
        const listFilesRes = await fetch(
          "https://www.googleapis.com/drive/v3/files?" +
            new URLSearchParams({
              q: `'${folderId}' in parents and trashed = false`,
              fields: "files(id, name, mimeType)",
              pageSize: "20",
            }),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!listFilesRes.ok) {
          const errText = await listFilesRes.text();
          return new Response(JSON.stringify({ error: "Failed listing files inside folder", details: errText }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const filesData = (await listFilesRes.json()) as { files: Array<{ id: string; name: string; mimeType: string }> };
        const imageFiles = (filesData.files || []).filter((f) => f.mimeType.startsWith("image/"));

        if (imageFiles.length === 0) {
          return new Response(
            JSON.stringify({
              error: "no_images",
              message: "Geen afbeeldingen gevonden in de geselecteerde map. Upload eerst foto's naar deze map in Google Drive.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        // Download up to 3 images and convert them to base64
        const maxImages = imageFiles.slice(0, 3);
        const imageParts = await Promise.all(
          maxImages.map(async (file) => {
            const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!mediaRes.ok) {
              throw new Error(`Failed to download image file ${file.name}`);
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

        // Call Gemini 2.5 Flash API with Search Grounding Tool and Schema
        const systemPrompt =
          "Je bent een expert in e-commerce en producttaxatie voor de Nederlandse en Belgische tweedehandsmarkt (Marktplaats, 2dehands.be, Vinted, Facebook Marketplace). Gegeven de bijgevoegde afbeelding(en) van één specifiek product, voer een live marktonderzoek uit met je Google Search tool. Zoek naar actuele advertenties en recente verkopen van dit specifieke merk en model op Marktplaats.nl en 2dehands.be. Genereer een antwoord dat STRICT voldoet aan de opgevraagde JSON-schema.";

        const geminiPayload = {
          contents: [
            {
              parts: [
                ...imageParts,
                {
                  text: systemPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                product_identificatie: {
                  type: "OBJECT",
                  properties: {
                    merk: { type: "STRING" },
                    model: { type: "STRING" },
                    geschatte_staat: { type: "STRING" },
                  },
                  required: ["merk", "model", "geschatte_staat"],
                },
                prijs_analyse: {
                  type: "OBJECT",
                  properties: {
                    marktprijs_min: { type: "NUMBER" },
                    marktprijs_max: { type: "NUMBER" },
                    aanbevolen_vraagprijs: { type: "NUMBER" },
                    minimaal_acceptabele_prijs: { type: "NUMBER" },
                    toelichting_prijs: { type: "STRING" },
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
                  type: "OBJECT",
                  properties: {
                    titel: { type: "STRING" },
                    beschrijving: { type: "STRING" },
                    tags: {
                      type: "ARRAY",
                      items: { type: "STRING" },
                    },
                  },
                  required: ["titel", "beschrijving", "tags"],
                },
              },
              required: ["product_identificatie", "prijs_analyse", "advertentie"],
            },
          },
          tools: [{ googleSearch: {} }],
        };

        
        /* -----------------------------------------------------------------------------------------------------------  */
        const geminiApiKey = env.GEMINI_API_KEY;
if (!geminiApiKey) {
  return new Response(
    JSON.stringify({
      error: "GEMINI_API_KEY_MISSING",
      message: "De Gemini API Key is niet geconfigureerd in de Cloudflare Worker.",
    }),
    {
      status: 500,
      headers: { "Content-Type": "application/json", ...headers },
    }
  );
}

// TIJDELIJKE DEBUG — verwijder dit na het testen!
return new Response(
  JSON.stringify({
    debug_key_start: geminiApiKey.substring(0, 8),
    debug_key_end: geminiApiKey.substring(geminiApiKey.length - 6),
    debug_key_length: geminiApiKey.length,
  }),
  { status: 200, headers: { "Content-Type": "application/json", ...headers } }
);

               /* -----------------------------------------------------------------------------------------------------------  */


        
        const geminiRes = await fetch(
          //`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(geminiPayload),
          }
        );

        if (!geminiRes.ok) {
          const geminiErr = await geminiRes.text();
          return new Response(JSON.stringify({ error: "Gemini API failed", details: geminiErr }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const geminiData = (await geminiRes.json()) as any;
        const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
          return new Response(JSON.stringify({ error: "No response text received from Gemini" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        return new Response(textResponse, {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      // 404 handler
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...headers },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }
  },
};
