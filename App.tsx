import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateSpeech, playAudio, createWavBlobFromBase64 } from './services/geminiService';
import { VOICES } from './constants';
import { VoiceOption } from './types';
import Spinner from './components/Spinner';

const LOCAL_STORAGE_TEXT_KEY = 'gemini_tts_text';
const LOCAL_STORAGE_VOICE_KEY = 'gemini_tts_voice_id';
const DEFAULT_TEXT = 'Hello! I am a friendly assistant powered by Gemini. You can change my voice from the dropdown below.';

const App: React.FC = () => {
  const [text, setText] = useState<string>(() => localStorage.getItem(LOCAL_STORAGE_TEXT_KEY) ?? DEFAULT_TEXT);
  const [selectedVoice, setSelectedVoice] = useState<string>(() => localStorage.getItem(LOCAL_STORAGE_VOICE_KEY) ?? VOICES[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Save text and voice to local storage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_TEXT_KEY, text);
    setAudioData(null); // Invalidate audio data on text change
  }, [text]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_VOICE_KEY, selectedVoice);
    setAudioData(null); // Invalidate audio data on voice change
  }, [selectedVoice]);
  
  // Clean up the AudioContext on component unmount
  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Clear notification after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSpeak = useCallback(async () => {
    if (!text.trim() || isLoading) return;

    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } catch (e) {
        setError("Your browser does not support the Web Audio API.");
        return;
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setIsLoading(true);
    setError(null);
    setAudioData(null);
    setNotification(null);

    try {
      const base64Audio = await generateSpeech(text, selectedVoice);
      setAudioData(base64Audio);
      await playAudio(base64Audio, audioContextRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [text, selectedVoice, isLoading]);

  const handleDownload = useCallback(() => {
    if (!audioData) return;
    try {
        const wavBlob = createWavBlobFromBase64(audioData);
        const url = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'gemini-speech.wav';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setNotification("Download started.");
    } catch (err) {
        console.error("Download failed:", err);
        setError("Failed to prepare audio for download.");
    }
  }, [audioData]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_TEXT_KEY);
    localStorage.removeItem(LOCAL_STORAGE_VOICE_KEY);
    setText(DEFAULT_TEXT);
    setSelectedVoice(VOICES[0].id);
    setError(null);
    setAudioData(null);
    setNotification("Settings have been reset to default.");
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 space-y-6 transform transition-all">
        <header className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-sky-400">Gemini Text-to-Speech</h1>
          <p className="text-slate-400 mt-2">Bring your words to life with AI-powered voices.</p>
        </header>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
            <p><span className="font-bold">Error:</span> {error}</p>
          </div>
        )}
        
        {notification && (
          <div className="bg-sky-900/50 border border-sky-700 text-sky-300 px-4 py-3 rounded-lg text-center">
            <p>{notification}</p>
          </div>
        )}

        <div className="space-y-4">
          <label htmlFor="voice-select" className="block text-sm font-medium text-slate-300">Choose a Voice</label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            disabled={isLoading}
            className="block w-full bg-slate-700 border border-slate-600 rounded-md py-3 px-4 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition duration-150 ease-in-out disabled:opacity-50"
          >
            {VOICES.map((voice: VoiceOption) => (
              <option key={voice.id} value={voice.id}>{voice.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="text-input" className="block text-sm font-medium text-slate-300">Enter Text</label>
          <textarea
            id="text-input"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste your text here..."
            disabled={isLoading}
            className="block w-full bg-slate-700 border border-slate-600 rounded-md py-3 px-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition duration-150 ease-in-out disabled:opacity-50 resize-none"
          />
          <p className="text-xs text-slate-500 text-right pr-1">Auto-saved to your browser</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleSpeak}
            disabled={isLoading || !text.trim()}
            className="flex items-center justify-center w-full sm:w-auto bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-sky-500/50 order-1"
          >
            {isLoading ? (
              <><Spinner className="w-6 h-6 mr-3" />Generating...</>
            ) : (
              <><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.858 15.142a5 5 0 010-7.072m2.828 9.9a9 9 0 010-12.728" /></svg>Speak</>
            )}
          </button>
          <button
            onClick={handleDownload}
            disabled={isLoading || !audioData}
            className="flex items-center justify-center w-full sm:w-auto bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-teal-500/50 order-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download
          </button>
           <button
            onClick={handleReset}
            disabled={isLoading}
            className="w-full sm:w-auto bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-300 font-bold py-3 px-6 rounded-lg transition-colors duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-slate-500/50 order-3"
          >
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
