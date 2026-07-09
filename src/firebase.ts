/*
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Drive scopes
provider.addScope("https://www.googleapis.com/auth/drive.readonly");
provider.addScope("https://www.googleapis.com/auth/drive.file");
*/

const WORKER_URL = "https://tweedehands-artikels.ikbennietchristophe.workers.dev";

let isSigningIn = false;
let cachedAccessToken: string | null = null;
/*
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

*/

export const initAuth = (
  onAuthSuccess?: () => void,
  onAuthFailure?: () => void
) => {
  fetch(`${WORKER_URL}/api/auth/status`)
    .then((res) => res.json())
    .then((data) => {
      if (data.authenticated && onAuthSuccess) onAuthSuccess();
      else if (!data.authenticated && onAuthFailure) onAuthFailure();
    })
    .catch(() => {
      if (onAuthFailure) onAuthFailure();
    });
  return () => {}; // lege unsubscribe voor compatibiliteit met bestaande aanroepen
};


/*
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Kon geen access token verkrijgen van Firebase Auth");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Inlogfout:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};
*/

export const googleSignIn = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    isSigningIn = true;
    const popup = window.open(
      `${WORKER_URL}/api/auth/login`,
      "google-auth",
      "width=500,height=650"
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        window.removeEventListener("message", handleMessage);
        clearInterval(pollClosed);
        isSigningIn = false;
        resolve(true);
      }
    };
    window.addEventListener("message", handleMessage);

    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollClosed);
        window.removeEventListener("message", handleMessage);
        isSigningIn = false;
        resolve(false);
      }
    }, 500);
  });
};



/*
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};
*/

export const getAccessToken = async (): Promise<string | null> => {
  return null; // niet meer nodig — de Worker beheert het token zelf via KV
};
/*
export const googleSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
*/

export const googleSignOut = async () => {
  // Nog geen logout-endpoint op de Worker; UI-state reset gebeurt in de aanroepende component
};
