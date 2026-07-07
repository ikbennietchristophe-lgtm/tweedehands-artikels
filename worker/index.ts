/**
 * Cloudflare Worker Backend for Second-Hand Ad & Pricing Generator
 * Handles Google OAuth2, Google Drive integration, and Gemini 2.5 Flash API with Google Search Tool.
 */

export interface Env {
  AUTH_KV?: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  REDIRECT_URI: string;
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

// Retrieves a valid Google API Access Token using the stored Refresh Token or the Authorization header
async function getValidAccessToken(env: Env, request: Request): Promise<string> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  if (env.AUTH_KV) {
    const refreshToken = await env.AUTH_KV.get("google_refresh_token");
    if (refreshToken) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { access_token: string };
        return data.access_token;
      }
    }
  }

  throw new Error("No Google access token provided in Authorization header, and no valid refresh token stored.");
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
      // 1. Google OAuth2 Login Redirect Endpoint
      if (url.pathname === "/api/auth/login") {
        const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        googleAuthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
        googleAuthUrl.searchParams.set("redirect_uri", env.REDIRECT_URI);
        googleAuthUrl.searchParams.set("response_type", "code");
        googleAuthUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive.readonly");
        googleAuthUrl.searchParams.set("access_type", "offline");
        googleAuthUrl.searchParams.set("prompt", "consent");

        return new Response(null, {
          status: 302,
          headers: {
            Location: googleAuthUrl.toString(),
            ...headers,
          },
        });
      }

      // 2. Google OAuth2 Callback Endpoint
      if (url.pathname === "/api/auth/callback" || url.pathname === "/api/auth/callback/") {
        const code = url.searchParams.get("code");
        if (!code) {
          return new Response(JSON.stringify({ error: "Missing authorization code" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        // Exchange Authorization Code for Tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.REDIRECT_URI,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          return new Response(JSON.stringify({ error: "Token exchange failed", details: errorText }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          });
        }

        const tokenData = (await tokenResponse.json()) as { refresh_token?: string; access_token: string };

        if (tokenData.refresh_token && env.AUTH_KV) {
          // Store the refresh token securely in Cloudflare KV
          await env.AUTH_KV.put("google_refresh_token", tokenData.refresh_token);
        } else if (!tokenData.refresh_token) {
          // If a refresh token wasn't returned, verify if we already have one stored
          const existing = env.AUTH_KV ? await env.AUTH_KV.get("google_refresh_token") : null;
          if (!existing) {
            return new Response(
              JSON.stringify({
                error: "No refresh token received. Re-authenticate with prompt=consent.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json", ...headers },
              }
            );
          }
        }

        // Redirect back to the frontend homepage
        const frontendUrl = new URL(env.REDIRECT_URI).origin;
        return new Response(
          `<html>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '${frontendUrl}/';
                }
              </script>
              <p>Authenticatie succesvol! Dit venster sluit automatisch...</p>
            </body>
          </html>`,
          {
            headers: { "Content-Type": "text/html", ...headers },
          }
        );
      }

      // Check Authentication Status
      if (url.pathname === "/api/auth/status") {
        const refreshToken = env.AUTH_KV ? await env.AUTH_KV.get("google_refresh_token") : null;
        return new Response(JSON.stringify({ authenticated: !!refreshToken }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      // 3. GET /api/folders Endpoint
      if (url.pathname === "/api/folders") {
        let accessToken: string;
        try {
          accessToken = await getValidAccessToken(env, request);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "unauthorized", details: e.message }), {
            status: 401,
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
          // If the folder doesn't exist, return empty list or specific error to prompt setup
          return new Response(JSON.stringify({ error: "parent_folder_not_found", folders: [] }), {
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

        return new Response(JSON.stringify({ folders: subfoldersData.files || [] }), {
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
          accessToken = await getValidAccessToken(env, request);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "unauthorized", details: e.message }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...headers },
          });
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
            // Convert ArrayBuffer to Base64
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

        // Call Gemini 2.5 Flash API with Search Grounding Tool
        const systemPrompt =
          "Je bent een expert in e-commerce en producttaxatie voor de Nederlandse en Belgische tweedehandsmarkt (Marktplaats, 2dehands.be, Vinted, Facebook Marketplace). Gegeven de bijgevoegde afbeelding(en) van één specifiek product, voer een live marktonderzoek uit met je Google Search tool. Zoek naar actuele advertenties en recente verkopen van dit specifieke merk en model op Marktplaats.nl en 2dehands.be. Genereer een antwoord dat STRICT voldoet aan het volgende JSON-formaat: { 'product_identificatie': { 'merk': 'string', 'model': 'string', 'geschatte_staat': 'string' }, 'prijs_analyse': { 'marktprijs_min': number, 'marktprijs_max': number, 'aanbevolen_vraagprijs': number, 'minimaal_acceptabele_prijs': number, 'toelichting_prijs': 'string' }, 'advertentie': { 'titel': 'string', 'beschrijving': 'string', 'tags': ['string'] } }";

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
          },
          tools: [{ googleSearch: {} }],
        };

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
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

        // Return the parsed JSON directly
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
