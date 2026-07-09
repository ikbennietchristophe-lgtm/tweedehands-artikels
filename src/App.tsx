

import { useState, useEffect } from "react";
import { initAuth, googleSignIn, googleSignOut } from "./firebase";
import { 
  Camera, 
  FolderOpen, 
  Sparkles, 
  TrendingUp, 
  Copy, 
  Check, 
  RefreshCw, 
  LogOut, 
  AlertCircle, 
  CheckCircle2,
  Info,
  ExternalLink,
  ArrowLeft,
  Euro
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types matching the specified output JSON schema
interface ProductIdentificatie {
  merk: string;
  model: string;
  geschatte_staat: string;
}

interface PrijsAnalyse {
  marktprijs_min: number;
  marktprijs_max: number;
  aanbevolen_vraagprijs: number;
  minimaal_acceptabele_prijs: number;
  toelichting_prijs: string;
}

interface Advertentie {
  titel: string;
  beschrijving: string;
  tags: string[];
}

interface AnalysisResult {
  product_identificatie: ProductIdentificatie;
  prijs_analyse: PrijsAnalyse;
  advertentie: Advertentie;
}

interface Folder {
  id: string;
  name: string;
}

const SPINNER_TEXTS = [
  "Afbeeldingen downloaden uit Google Drive...",
  "Foto's omzetten naar high-definition scans...",
  "Marktonderzoek opstarten op de Nederlandse en Belgische markt...",
  "Google Search uitvoeren op Marktplaats.nl en 2dehands.be...",
  "Vraagprijzen en afgeronde verkopen vergelijken...",
  "Gemini 2.5 Flash model start taxatie-analyse...",
  "Advertentietitel en beschrijving optimaliseren voor e-commerce...",
  "Conversieverhogende emoticons en tags toevoegen...",
  "Prijsadvies en bodemlimiet formuleren...",
];

export default function App() {
  // Navigation & States
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  // user en token niet meer nodig — de Worker beheert authenticatie server-side via KV
  const [folders, setFolders] = useState<Folder[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [parentFolderNotFound, setParentFolderNotFound] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [loadingFolders, setLoadingFolders] = useState(true);
  
  // Setup sample mappen states
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  // Analysis & Loading States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisTextStep, setAnalysisTextStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Editing generated text
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [copied, setCopied] = useState(false);

  // Initialize auth state check (via Worker /api/auth/status)
  useEffect(() => {
    const unsubscribe = initAuth(
      async () => {
        setAuthenticated(true);
        await fetchFolders();
      },
      () => {
        setAuthenticated(false);
        setLoadingFolders(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchFolders = async () => {
    setLoadingFolders(true);
    setParentFolderNotFound(false);
    try {
      const res = await fetch("/api/folders");
      if (res.status === 401) {
        setAuthenticated(false);
        setLoadingFolders(false);
        return;
      }
      const data = await res.json();
      if (data.parentFolderNotFound || data.error === "parent_folder_not_found") {
        setParentFolderNotFound(true);
        setFolders([]);
      } else {
        setFolders(data.folders || []);
        if (data.folders && data.folders.length > 0) {
          setSelectedFolderId(data.folders[0].id);
        }
      }
    } catch (err) {
      console.error("Fout bij ophalen mappen:", err);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Google Sign-In via Worker popup flow
  const handleGoogleLogin = async () => {
    setLoadingFolders(true);
    try {
      const success = await googleSignIn();
      if (success) {
        setAuthenticated(true);
        await fetchFolders();
      } else {
        setLoadingFolders(false);
      }
    } catch (err) {
      console.error("Inloggen mislukt:", err);
      setLoadingFolders(false);
    }
  };

  // Google Logout
  const handleLogout = async () => {
    try {
      await googleSignOut();
      setAuthenticated(false);
      setFolders([]);
    } catch (err) {
      console.error("Logout mislukt:", err);
    }
  };

  // Setup mock/sample folders in real drive
  const handleSetupSamples = async () => {
    setSetupLoading(true);
    try {
      const res = await fetch("/api/setup-samples", {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        setSetupSuccess(true);
        setTimeout(() => {
          fetchFolders();
        }, 1500);
      }
    } catch (err) {
      console.error("Bootstrap mislukt:", err);
    } finally {
      setSetupLoading(false);
    }
  };

  // Start Gemini marktonderzoek & taxatie
  const handleAnalyze = async () => {
    if (!selectedFolderId) return;

    setScreen(2);
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisTextStep(0);

    // Dynamic text rotations
    const interval = setInterval(() => {
      setAnalysisTextStep((prev) => (prev < SPINNER_TEXTS.length - 1 ? prev + 1 : prev));
    }, 3500);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ folder_id: selectedFolderId }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setAnalysisError(
          data.message || data.error || "Er is een fout opgetreden tijdens de taxatie."
        );
        setScreen(1);
      } else {
        setAnalysisResult(data);
        setEditedTitle(data.advertentie.titel);
        setEditedDescription(data.advertentie.beschrijving);
        setScreen(3);
      }
    } catch (err: any) {
      console.error("Analyse mislukt:", err);
      setAnalysisError("Netwerkfout: Kon geen verbinding maken met de server.");
      setScreen(1);
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
    }
  };

  // Copy title + description
  const handleCopy = () => {
    const fullText = `Titel: ${editedTitle}\n\n${editedDescription}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-mesh font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-900 pb-12">
      {/* HEADER NAVBAR */}
      <header id="app-header" className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-md shadow-emerald-500/10">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight">
                Tweedehands Generator
              </h1>
              <p className="text-xs text-slate-500 font-medium font-sans">
                Ad & Prijs-expert met Google Search
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode badge */}
            <span
              id="mode-badge"
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                authenticated
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${authenticated ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}></span>
              {authenticated ? "Gekoppeld met Drive" : "Niet Gekoppeld"}
            </span>

            {/* Logout button */}
            {authenticated && (
              <button
                id="btn-logout"
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 transition bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200"
                title="Google Account Ontkoppelen"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Ontkoppelen</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ERROR BANNER */}
      {analysisError && (
        <div className="max-w-4xl mx-auto px-4 mt-6">
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-800">Analyse Mislukt</h4>
              <p className="text-xs text-rose-700 mt-1">{analysisError}</p>
            </div>
            <button
              onClick={() => setAnalysisError(null)}
              className="text-rose-400 hover:text-rose-600 text-xs font-bold px-2 py-0.5"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <AnimatePresence mode="wait">
          {/* SCHERM 1: AUTH EN FOLDER SELECTIE */}
          {screen === 1 && (
            <motion.div
              key="screen-1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto"
            >
              {/* Introduction Card */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/40 p-8 sm:p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl -ml-24 -mb-24"></div>

                <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl mb-5 shadow-inner">
                  <Sparkles className="w-8 h-8" />
                </div>

                <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-950 tracking-tight">
                  Verkoop sneller met AI & Live Marktonderzoek
                </h2>
                <p className="text-sm sm:text-base text-slate-500 mt-3 max-w-xl mx-auto leading-relaxed">
                  Selecteer een fotomap uit je Google Drive. Gemini downloadt de foto's, voert live marktonderzoek uit via Google Search en schrijft direct een conversieverhogende advertentie en prijsbepaling.
                </p>

                {/* AUTH CONTROLS */}
                {loadingFolders ? (
                  <div className="mt-10 py-12 flex flex-col items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-xs font-semibold text-slate-400 mt-3 tracking-wide">Mappen laden uit Google Drive...</p>
                  </div>
                ) : !authenticated ? (
                  /* GOOGLE LOGIN CARD */
                  <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Koppel met Google Drive</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-md">
                          Koppel je Google Account om toegang te geven tot je productmappen in Google Drive. We gebruiken deze verbinding alleen om de geselecteerde afbeeldingen te analyseren.
                        </p>
                      </div>

                      <button
                        id="btn-login-drive"
                        onClick={handleGoogleLogin}
                        className="w-full sm:w-auto shrink-0 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-3 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/15 group"
                      >
                        <Camera className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
                        Koppel Google Drive
                      </button>
                    </div>
                  </div>
                ) : parentFolderNotFound ? (
                  /* GOOGLE CONNECTED BUT NO FOLDER FOUND */
                  <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <div className="flex items-start gap-4">
                      <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600 shrink-0">
                        <Info className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-900">Map &apos;tweedehands_afbeeldingen&apos; niet gevonden</h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          We hebben succesvol gekoppeld met je Google Account! Om te beginnen dient er een map met de exacte naam <strong className="text-slate-800 font-mono">tweedehands_afbeeldingen</strong> in je Google Drive te staan. Submappen hierbinnen fungeren als je productmappen.
                        </p>

                        <div className="mt-4 flex flex-col sm:flex-row gap-3">
                          <button
                            id="btn-setup-samples"
                            onClick={handleSetupSamples}
                            disabled={setupLoading}
                            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition duration-150 flex items-center gap-2 shadow-md shadow-emerald-500/10"
                          >
                            {setupLoading ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : setupSuccess ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <FolderOpen className="w-3.5 h-3.5" />
                            )}
                            {setupLoading ? "Mappen structuur aanmaken..." : setupSuccess ? "Klaar! Pagina herladen..." : "Voorbeeldmappen & Foto's aanmaken"}
                          </button>

                          <a
                            href="https://drive.google.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-5 py-2.5 rounded-lg transition duration-150 flex items-center justify-center gap-1.5"
                          >
                            Open Google Drive <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* GOOGLE REAL MODE WITH ACTIVE SUBFOLDERS */
                  <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase mb-3">
                      Actieve Google Drive Verbinding
                    </span>

                    <label htmlFor="folder-select-real" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Selecteer een Productmap uit tweedehands_afbeeldingen:
                    </label>

                    {folders.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500">
                        <FolderOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="text-xs font-semibold">Geen submappen gevonden in &apos;tweedehands_afbeeldingen&apos;.</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Maak een nieuwe map aan in Drive (bijv. &apos;Vintage Fiets&apos;) en upload hier je foto&apos;s naartoe.
                        </p>
                        <button
                          onClick={() => fetchFolders()}
                          className="mt-3 text-emerald-600 hover:text-emerald-700 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Vernieuwen
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select
                          id="folder-select-real"
                          value={selectedFolderId}
                          onChange={(e) => setSelectedFolderId(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        >
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              📁 {f.name}
                            </option>
                          ))}
                        </select>

                        <button
                          id="btn-analyze-real"
                          onClick={handleAnalyze}
                          disabled={!selectedFolderId}
                          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-sm px-6 py-3 rounded-xl transition shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 shrink-0 active:scale-95"
                        >
                          <Sparkles className="w-4 h-4" />
                          Analyseer Product
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Extra explanation step list */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="bg-blue-50 text-blue-600 p-2 rounded-xl shrink-0 text-xs font-bold">1</div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Sleep foto&apos;s in Drive</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Sorteer je productfoto&apos;s per map in de Google Drive folder.</p>
                  </div>
                </div>

                <div className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="bg-teal-50 text-teal-600 p-2 rounded-xl shrink-0 text-xs font-bold">2</div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Live Marktonderzoek</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Gemini speurt met Google Search naar marktplaatsadvertenties van dit model.</p>
                  </div>
                </div>

                <div className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl shrink-0 text-xs font-bold">3</div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Klaar voor Verkoop</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Kopieer de advertentietekst en hanteer de aanbevolen vraagprijs.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* SCHERM 2: GEANIMEERDE SPINNER */}
          {screen === 2 && (
            <motion.div
              key="screen-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xl mx-auto py-16 flex flex-col items-center justify-center text-center"
            >
              {/* Modern spinner with orbital visual effect */}
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10"></div>
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                <div className="absolute inset-4 rounded-full border-4 border-teal-500/10"></div>
                <div className="absolute inset-4 rounded-full border-4 border-teal-500 border-b-transparent animate-spin" style={{ animationDirection: 'reverse' }}></div>
                <Camera className="absolute inset-0 m-auto w-6 h-6 text-emerald-500 animate-pulse" />
              </div>

              {/* Dynamic steps text with key animation */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={analysisTextStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="px-4"
                >
                  <h3 className="font-display font-bold text-xl text-slate-900 tracking-tight">
                    Product analyseren...
                  </h3>
                  <p className="text-sm font-semibold text-emerald-600 mt-2 font-sans tracking-wide">
                    {SPINNER_TEXTS[analysisTextStep]}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Loading subtext bar */}
              <div className="w-48 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-6">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-[3500ms]"
                  style={{ width: `${((analysisTextStep + 1) / SPINNER_TEXTS.length) * 100}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
                Dit duurt doorgaans 10-25 seconden
              </p>
            </motion.div>
          )}

          {/* SCHERM 3: DASHBOARD MET AD EN TAXATIE */}
          {screen === 3 && analysisResult && (
            <motion.div
              key="screen-3"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              {/* Title Header with Breadcrumb */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <button
                    onClick={() => setScreen(1)}
                    className="group text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition mb-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
                    Terug naar selectie
                  </button>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">
                      {analysisResult.product_identificatie.merk} {analysisResult.product_identificatie.model}
                    </h2>
                    <span className="bg-emerald-50 text-emerald-700 font-semibold text-xs px-2.5 py-0.5 rounded-lg border border-emerald-100">
                      Staat: {analysisResult.product_identificatie.geschatte_staat}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScreen(1)}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 font-bold text-sm px-4 py-2 rounded-xl transition shadow-sm"
                  >
                    Nieuwe Analyse
                  </button>

                  <button
                    onClick={handleAnalyze}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm px-4 py-2 rounded-xl transition shadow-md shadow-emerald-500/10 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Opnieuw Taxeren
                  </button>
                </div>
              </div>

              {/* TWEEKOLOMS DASHBOARD */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* COLUMN 1: PRIJS ANALYSE & TAKSATIE (45% span on lg) */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Recommended Price Hero Box */}
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg p-6 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 text-emerald-500/5 select-none pointer-events-none">
                      <Euro className="w-32 h-32" />
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Aanbevolen vraagprijs
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-slate-950 font-display font-extrabold text-4xl sm:text-5xl">
                          € {analysisResult.prijs_analyse.aanbevolen_vraagprijs.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 my-4"></div>

                    {/* Pricing Bounds Matrix */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Min. Markt
                        </span>
                        <span className="block text-sm font-extrabold text-slate-800 mt-1">
                          € {analysisResult.prijs_analyse.marktprijs_min}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Max. Markt
                        </span>
                        <span className="block text-sm font-extrabold text-slate-800 mt-1">
                          € {analysisResult.prijs_analyse.marktprijs_max}
                        </span>
                      </div>

                      <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100/50">
                        <span className="block text-[10px] font-bold text-rose-500 uppercase tracking-wide">
                          Bodemlimiet
                        </span>
                        <span className="block text-sm font-extrabold text-rose-700 mt-1">
                          € {analysisResult.prijs_analyse.minimaal_acceptabele_prijs}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Explanation & Live ground data */}
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
                      <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">
                        Markt- & Taxatierapport
                      </h3>
                    </div>

                    <div className="text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3">
                      <p>{analysisResult.prijs_analyse.toelichting_prijs}</p>
                    </div>

                    <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50 flex items-start gap-2.5">
                      <Info className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-emerald-800 font-medium leading-normal">
                        Dit advies is gebaseerd op actuele advertenties en recente transactie-analysen op de platforms <strong>Marktplaats.nl</strong> en <strong>2dehands.be</strong> via de live Gemini Search Grounding tool.
                      </span>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: GEGENEREEERDE ADVERTENTIE (55% span on lg) */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg p-6 flex flex-col space-y-4 h-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
                        <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">
                          Advertentietekst
                        </h3>
                      </div>

                      {/* COPY BUTTON */}
                      <button
                        id="btn-copy-ad"
                        onClick={handleCopy}
                        className={`flex items-center gap-1 text-xs font-bold px-3.5 py-1.5 rounded-xl transition duration-150 border ${
                          copied
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-950 hover:bg-slate-800 text-white border-transparent shadow-md shadow-slate-950/10"
                        }`}
                      >
                        {copied ? <Check className="w-3.5 h-3.5 animate-scaleIn" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Gekopieerd! 👍" : "Kopieer Advertentietekst"}
                      </button>
                    </div>

                    {/* Title input field */}
                    <div className="space-y-1.5">
                      <label htmlFor="ad-title" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Advertentietitel:
                      </label>
                      <input
                        id="ad-title"
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                      />
                    </div>

                    {/* Description text-area */}
                    <div className="flex-1 space-y-1.5">
                      <label htmlFor="ad-desc" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Beschrijving:
                      </label>
                      <textarea
                        id="ad-desc"
                        rows={12}
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs sm:text-sm font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 resize-none font-sans"
                      />
                    </div>

                    {/* Tags row */}
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Tags / Zoektermen:
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {analysisResult.advertentie.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200/60 font-semibold text-xs px-2.5 py-1 rounded-lg transition duration-150 cursor-default"
                          >
                            #{tag.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}











/*

import { useState, useEffect } from "react";
import { initAuth, googleSignIn, googleSignOut } from "./firebase";

import { User } from "firebase/auth";

import { 
  Camera, 
  FolderOpen, 
  Sparkles, 
  TrendingUp, 
  Copy, 
  Check, 
  RefreshCw, 
  LogOut, 
  AlertCircle, 
  CheckCircle2,
  Info,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Search,
  Euro
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types matching the specified output JSON schema
interface ProductIdentificatie {
  merk: string;
  model: string;
  geschatte_staat: string;
}

interface PrijsAnalyse {
  marktprijs_min: number;
  marktprijs_max: number;
  aanbevolen_vraagprijs: number;
  minimaal_acceptabele_prijs: number;
  toelichting_prijs: string;
}

interface Advertentie {
  titel: string;
  beschrijving: string;
  tags: string[];
}

interface AnalysisResult {
  product_identificatie: ProductIdentificatie;
  prijs_analyse: PrijsAnalyse;
  advertentie: Advertentie;
}

interface Folder {
  id: string;
  name: string;
}

interface AuthConfig {
  configured: boolean;
  clientId: string | null;
  hasToken: boolean;
  appUrl: string;
  redirectUri: string;
}

const SPINNER_TEXTS = [
  "Afbeeldingen downloaden uit Google Drive...",
  "Foto's omzetten naar high-definition scans...",
  "Marktonderzoek opstarten op de Nederlandse en Belgische markt...",
  "Google Search uitvoeren op Marktplaats.nl en 2dehands.be...",
  "Vraagprijzen en afgeronde verkopen vergelijken...",
  "Gemini 2.5 Flash model start taxatie-analyse...",
  "Advertentietitel en beschrijving optimaliseren voor e-commerce...",
  "Conversieverhogende emoticons en tags toevoegen...",
  "Prijsadvies en bodemlimiet formuleren...",
];

export default function App() {
  // Navigation & States
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  //const [user, setUser] = useState<User | null>(null);
  //const [token, setToken] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [parentFolderNotFound, setParentFolderNotFound] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [loadingFolders, setLoadingFolders] = useState(true);
  
  // Setup sample mappen states
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);

  // Analysis & Loading States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisTextStep, setAnalysisTextStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Editing generated text
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [copied, setCopied] = useState(false);

  // Initialize Firebase Auth state listener
  
  useEffect(() => {
    const unsubscribe = initAuth(
      async (loggedInUser, accessToken) => {
        setUser(loggedInUser);
        setToken(accessToken);
        setAuthenticated(true);
        await fetchFolders(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setAuthenticated(false);
        setLoadingFolders(false);
      }
    );
    return () => unsubscribe();
  }, []);
  

  useEffect(() => {
  const unsubscribe = initAuth(
    async () => {
      setAuthenticated(true);
      await fetchFolders();
    },
    () => {
      setAuthenticated(false);
      setLoadingFolders(false);
    }
  );
  return () => unsubscribe();
}, []);

 
  
  const fetchFolders = async (accessToken?: string) => {
    const currentToken = accessToken || token;
    if (!currentToken) {
      setAuthenticated(false);
      setLoadingFolders(false);
      return;
    }
    setLoadingFolders(true);
    setParentFolderNotFound(false);
    try {
      const res = await fetch("/api/folders", {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      const data = await res.json();
      setAuthenticated(!!data.authenticated);
      if (data.parentFolderNotFound) {
        setParentFolderNotFound(true);
        setFolders([]);
      } else {
        setFolders(data.folders || []);
        if (data.folders && data.folders.length > 0) {
          setSelectedFolderId(data.folders[0].id);
        }
      }
    } catch (err) {
      console.error("Fout bij ophalen mappen:", err);
    } finally {
      setLoadingFolders(false);
    }
  };

  

const fetchFolders = async () => {
  setLoadingFolders(true);
  setParentFolderNotFound(false);
  try {
    const res = await fetch("/api/folders");
    if (res.status === 401) {
      setAuthenticated(false);
      setLoadingFolders(false);
      return;
    }
    const data = await res.json();





  

  // Google Sign-In redirect popup
    
  const handleGoogleLogin = async () => {
    setLoadingFolders(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setAuthenticated(true);
        await fetchFolders(result.accessToken);
      }
    } catch (err) {
      console.error("Inloggen mislukt:", err);
      setLoadingFolders(false);
    }
  };
  
const handleGoogleLogin = async () => {
  setLoadingFolders(true);
  try {
    const success = await googleSignIn();
    if (success) {
      setAuthenticated(true);
      await fetchFolders();
    } else {
      setLoadingFolders(false);
    }
  } catch (err) {
    console.error("Inloggen mislukt:", err);
    setLoadingFolders(false);
  }
};


  // Google Logout
    
  const handleLogout = async () => {
    try {
      await googleSignOut();
      setUser(null);
      setToken(null);
      setAuthenticated(false);
      setFolders([]);
    } catch (err) {
      console.error("Logout mislukt:", err);
    }
  };
  

    const handleLogout = async () => {
  try {
    await googleSignOut();
    setAuthenticated(false);
    setFolders([]);
  } catch (err) {
    console.error("Logout mislukt:", err);
  }
};

  // Setup mock/sample folders in real drive
  const handleSetupSamples = async () => {
    setSetupLoading(true);
    try {
      
      const res = await fetch("/api/setup-samples", {
        method: "POST",
        
        headers: {
          "Authorization": `Bearer ${token}`
        }
      

const res = await fetch("/api/setup-samples", {
  method: "POST"
});
      
      });
      const data = await res.json();
      if (data.success) {
        setSetupSuccess(true);
        setTimeout(() => {
          fetchFolders();
        }, 1500);
      }
    } catch (err) {
      console.error("Bootstrap mislukt:", err);
    } finally {
      setSetupLoading(false);
    }
  };

  // Start Gemini marktonderzoek & taxatie
  const handleAnalyze = async () => {
    if (!selectedFolderId || !token) return;

    setScreen(2);
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisTextStep(0);

    // Dynamic text rotations
    const interval = setInterval(() => {
      setAnalysisTextStep((prev) => (prev < SPINNER_TEXTS.length - 1 ? prev + 1 : prev));
    }, 3500);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ folder_id: selectedFolderId }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setAnalysisError(
          data.message || data.error || "Er is een fout opgetreden tijdens de taxatie."
        );
        setScreen(1);
      } else {
        setAnalysisResult(data);
        setEditedTitle(data.advertentie.titel);
        setEditedDescription(data.advertentie.beschrijving);
        setScreen(3);
      }
    } catch (err: any) {
      console.error("Analyse mislukt:", err);
      setAnalysisError("Netwerkfout: Kon geen verbinding maken met de server.");
      setScreen(1);
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
    }
  };

  // Copy title + description
  const handleCopy = () => {
    const fullText = `Titel: ${editedTitle}\n\n${editedDescription}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-mesh font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-900 pb-12">
      { HEADER NAVBAR }
      <header id="app-header" className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-md shadow-emerald-500/10">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight">
                Tweedehands Generator
              </h1>
              <p className="text-xs text-slate-500 font-medium font-sans">
                Ad & Prijs-expert met Google Search
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            { Mode badge }
            <span
              id="mode-badge"
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                authenticated
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${authenticated ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}></span>
              {authenticated ? "Gekoppeld met Drive" : "Niet Gekoppeld"}
            </span>

            { Logout button }
            {authenticated && (
              <button
                id="btn-logout"
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 transition bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200"
                title="Google Account Ontkoppelen"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Ontkoppelen</span>
              </button>
            )}
          </div>
        </div>
      </header>

      { ERROR BANNER }
      {analysisError && (
        <div className="max-w-4xl mx-auto px-4 mt-6">
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-rose-800">Analyse Mislukt</h4>
              <p className="text-xs text-rose-700 mt-1">{analysisError}</p>
            </div>
            <button
              onClick={() => setAnalysisError(null)}
              className="text-rose-400 hover:text-rose-600 text-xs font-bold px-2 py-0.5"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}

      { MAIN CONTAINER }
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <AnimatePresence mode="wait">
          { SCHERM 1: AUTH EN FOLDER SELECTIE }
          {screen === 1 && (
            <motion.div
              key="screen-1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto"
            >
              { Introduction Card }
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/40 p-8 sm:p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl -ml-24 -mb-24"></div>

                <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl mb-5 shadow-inner">
                  <Sparkles className="w-8 h-8" />
                </div>

                <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-950 tracking-tight">
                  Verkoop sneller met AI & Live Marktonderzoek
                </h2>
                <p className="text-sm sm:text-base text-slate-500 mt-3 max-w-xl mx-auto leading-relaxed">
                  Selecteer een fotomap uit je Google Drive. Gemini downloadt de foto's, voert live marktonderzoek uit via Google Search en schrijft direct een conversieverhogende advertentie en prijsbepaling.
                </p>

                { AUTH CONTROLS }
                {loadingFolders ? (
                  <div className="mt-10 py-12 flex flex-col items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-xs font-semibold text-slate-400 mt-3 tracking-wide">Mappen laden uit Google Drive...</p>
                  </div>
                ) : !authenticated ? (
                   GOOGLE LOGIN CARD 
                  <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Koppel met Google Drive</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-md">
                          Koppel je Google Account om toegang te geven tot je productmappen in Google Drive. We gebruiken deze verbinding alleen om de geselecteerde afbeeldingen te analyseren.
                        </p>
                      </div>

                      <button
                        id="btn-login-drive"
                        onClick={handleGoogleLogin}
                        className="w-full sm:w-auto shrink-0 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-3 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/15 group"
                      >
                        <Camera className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
                        Koppel Google Drive
                      </button>
                    </div>
                  </div>
                ) : parentFolderNotFound ? (
                   GOOGLE CONNECTED BUT NO FOLDER FOUND 
                  <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <div className="flex items-start gap-4">
                      <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600 shrink-0">
                        <Info className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-900">Map &apos;tweedehands_afbeeldingen&apos; niet gevonden</h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          We hebben succesvol gekoppeld met je Google Account! Om te beginnen dient er een map met de exacte naam <strong className="text-slate-800 font-mono">tweedehands_afbeeldingen</strong> in je Google Drive te staan. Submappen hierbinnen fungeren als je productmappen.
                        </p>

                        <div className="mt-4 flex flex-col sm:flex-row gap-3">
                          <button
                            id="btn-setup-samples"
                            onClick={handleSetupSamples}
                            disabled={setupLoading}
                            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition duration-150 flex items-center gap-2 shadow-md shadow-emerald-500/10"
                          >
                            {setupLoading ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : setupSuccess ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <FolderOpen className="w-3.5 h-3.5" />
                            )}
                            {setupLoading ? "Mappen structuur aanmaken..." : setupSuccess ? "Klaar! Pagina herladen..." : "Voorbeeldmappen & Foto's aanmaken"}
                          </button>

                          <a
                            href="https://drive.google.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-5 py-2.5 rounded-lg transition duration-150 flex items-center justify-center gap-1.5"
                          >
                            Open Google Drive <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                   GOOGLE REAL MODE WITH ACTIVE SUBFOLDERS 
                  <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase mb-3">
                      Actieve Google Drive Verbinding
                    </span>

                    <label htmlFor="folder-select-real" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Selecteer een Productmap uit tweedehands_afbeeldingen:
                    </label>

                    {folders.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500">
                        <FolderOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="text-xs font-semibold">Geen submappen gevonden in &apos;tweedehands_afbeeldingen&apos;.</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Maak een nieuwe map aan in Drive (bijv. &apos;Vintage Fiets&apos;) en upload hier je foto&apos;s naartoe.
                        </p>
                        <button
                          onClick={fetchFolders}
                          className="mt-3 text-emerald-600 hover:text-emerald-700 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Vernieuwen
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select
                          id="folder-select-real"
                          value={selectedFolderId}
                          onChange={(e) => setSelectedFolderId(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        >
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              📁 {f.name}
                            </option>
                          ))}
                        </select>

                        <button
                          id="btn-analyze-real"
                          onClick={handleAnalyze}
                          disabled={!selectedFolderId}
                          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-sm px-6 py-3 rounded-xl transition shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 shrink-0 active:scale-95"
                        >
                          <Sparkles className="w-4 h-4" />
                          Analyseer Product
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              { Extra explanation step list }
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="bg-blue-50 text-blue-600 p-2 rounded-xl shrink-0 text-xs font-bold">1</div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Sleep foto&apos;s in Drive</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Sorteer je productfoto&apos;s per map in de Google Drive folder.</p>
                  </div>
                </div>

                <div className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="bg-teal-50 text-teal-600 p-2 rounded-xl shrink-0 text-xs font-bold">2</div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Live Marktonderzoek</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Gemini speurt met Google Search naar marktplaatsadvertenties van dit model.</p>
                  </div>
                </div>

                <div className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl shrink-0 text-xs font-bold">3</div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Klaar voor Verkoop</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Kopieer de advertentietekst en hanteer de aanbevolen vraagprijs.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          { SCHERM 2: GEANIMEERDE SPINNER }
          {screen === 2 && (
            <motion.div
              key="screen-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xl mx-auto py-16 flex flex-col items-center justify-center text-center"
            >
              { Modern spinner with orbital visual effect }
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10"></div>
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                <div className="absolute inset-4 rounded-full border-4 border-teal-500/10"></div>
                <div className="absolute inset-4 rounded-full border-4 border-teal-500 border-b-transparent animate-spin" style={{ animationDirection: 'reverse' }}></div>
                <Camera className="absolute inset-0 m-auto w-6 h-6 text-emerald-500 animate-pulse" />
              </div>

              { Dynamic steps text with key animation }
              <AnimatePresence mode="wait">
                <motion.div
                  key={analysisTextStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="px-4"
                >
                  <h3 className="font-display font-bold text-xl text-slate-900 tracking-tight">
                    Product analyseren...
                  </h3>
                  <p className="text-sm font-semibold text-emerald-600 mt-2 font-sans tracking-wide">
                    {SPINNER_TEXTS[analysisTextStep]}
                  </p>
                </motion.div>
              </AnimatePresence>

              { Loading subtext bar }
              <div className="w-48 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-6">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-[3500ms]"
                  style={{ width: `${((analysisTextStep + 1) / SPINNER_TEXTS.length) * 100}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
                Dit duurt doorgaans 10-25 seconden
              </p>
            </motion.div>
          )}

          { SCHERM 3: DASHBOARD MET AD EN TAXATIE }
          {screen === 3 && analysisResult && (
            <motion.div
              key="screen-3"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              { Title Header with Breadcrumb }
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <button
                    onClick={() => setScreen(1)}
                    className="group text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition mb-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
                    Terug naar selectie
                  </button>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">
                      {analysisResult.product_identificatie.merk} {analysisResult.product_identificatie.model}
                    </h2>
                    <span className="bg-emerald-50 text-emerald-700 font-semibold text-xs px-2.5 py-0.5 rounded-lg border border-emerald-100">
                      Staat: {analysisResult.product_identificatie.geschatte_staat}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScreen(1)}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 font-bold text-sm px-4 py-2 rounded-xl transition shadow-sm"
                  >
                    Nieuwe Analyse
                  </button>

                  <button
                    onClick={handleAnalyze}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm px-4 py-2 rounded-xl transition shadow-md shadow-emerald-500/10 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Opnieuw Taxeren
                  </button>
                </div>
              </div>

              { TWEEKOLOMS DASHBOARD }
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                { COLUMN 1: PRIJS ANALYSE & TAKSATIE (45% span on lg) }
                <div className="lg:col-span-5 space-y-6">
                  { Recommended Price Hero Box }
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg p-6 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 text-emerald-500/5 select-none pointer-events-none">
                      <Euro className="w-32 h-32" />
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Aanbevolen vraagprijs
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-slate-950 font-display font-extrabold text-4xl sm:text-5xl">
                          € {analysisResult.prijs_analyse.aanbevolen_vraagprijs.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 my-4"></div>

                    { Pricing Bounds Matrix }
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Min. Markt
                        </span>
                        <span className="block text-sm font-extrabold text-slate-800 mt-1">
                          € {analysisResult.prijs_analyse.marktprijs_min}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Max. Markt
                        </span>
                        <span className="block text-sm font-extrabold text-slate-800 mt-1">
                          € {analysisResult.prijs_analyse.marktprijs_max}
                        </span>
                      </div>

                      <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100/50">
                        <span className="block text-[10px] font-bold text-rose-500 uppercase tracking-wide">
                          Bodemlimiet
                        </span>
                        <span className="block text-sm font-extrabold text-rose-700 mt-1">
                          € {analysisResult.prijs_analyse.minimaal_acceptabele_prijs || analysisResult.prijs_analyse.minimaal_acceptabele_price}
                        </span>
                      </div>
                    </div>
                  </div>

                  { Pricing Explanation & Live ground data }
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
                      <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">
                        Markt- & Taxatierapport
                      </h3>
                    </div>

                    <div className="text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3">
                      <p>{analysisResult.prijs_analyse.toelichting_prijs}</p>
                    </div>

                    <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50 flex items-start gap-2.5">
                      <Info className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-emerald-800 font-medium leading-normal">
                        Dit advies is gebaseerd op actuele advertenties en recente transactie-analysen op de platforms <strong>Marktplaats.nl</strong> en <strong>2dehands.be</strong> via de live Gemini Search Grounding tool.
                      </span>
                    </div>
                  </div>
                </div>

                { COLUMN 2: GEGENEREEERDE ADVERTENTIE (55% span on lg) }
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg p-6 flex flex-col space-y-4 h-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
                        <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">
                          Advertentietekst
                        </h3>
                      </div>

                      { COPY BUTTON }
                      <button
                        id="btn-copy-ad"
                        onClick={handleCopy}
                        className={`flex items-center gap-1 text-xs font-bold px-3.5 py-1.5 rounded-xl transition duration-150 border ${
                          copied
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-950 hover:bg-slate-800 text-white border-transparent shadow-md shadow-slate-950/10"
                        }`}
                      >
                        {copied ? <Check className="w-3.5 h-3.5 animate-scaleIn" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Gekopieerd! 👍" : "Kopieer Advertentietekst"}
                      </button>
                    </div>

                    { Title input field }
                    <div className="space-y-1.5">
                      <label htmlFor="ad-title" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Advertentietitel:
                      </label>
                      <input
                        id="ad-title"
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                      />
                    </div>

                    { Description text-area }
                    <div className="flex-1 space-y-1.5">
                      <label htmlFor="ad-desc" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Beschrijving:
                      </label>
                      <textarea
                        id="ad-desc"
                        rows={12}
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs sm:text-sm font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 resize-none font-sans"
                      />
                    </div>

                    { Tags row }
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Tags / Zoektermen:
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {analysisResult.advertentie.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200/60 font-semibold text-xs px-2.5 py-1 rounded-lg transition duration-150 cursor-default"
                          >
                            #{tag.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}


*/
