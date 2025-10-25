import { GoogleGenAI, Modality } from "@google/genai";

// Audio decoding utilities as per Gemini API documentation
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


export const generateSpeech = async (text: string, voiceName: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    const errorText = response.text;
    if (errorText) {
      throw new Error(`API returned text instead of audio: ${errorText}`);
    }
    if (response.promptFeedback?.blockReason) {
       throw new Error(`Request was blocked: ${response.promptFeedback.blockReason}`);
    }
    throw new Error("No audio data received from API. The response was empty or malformed.");
  }
  
  return base64Audio;
};


export const playAudio = async (base64Audio: string, audioContext: AudioContext | null) => {
    if (!audioContext) {
        throw new Error("AudioContext not initialized.");
    }

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    const decodedBytes = decode(base64Audio);
    // Gemini TTS uses a sample rate of 24000Hz and is mono (1 channel)
    const audioBuffer = await decodeAudioData(decodedBytes, audioContext, 24000, 1);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
};

// Helper function to write strings to a DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Creates a WAV file Blob from raw PCM audio data.
 * The Gemini API returns raw PCM data, so we need to add a WAV header to make it a playable file.
 * @param pcmData The raw audio data (Uint8Array).
 * @returns A Blob representing the WAV file.
 */
function createWavBlob(pcmData: Uint8Array): Blob {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([view, pcmData], { type: 'audio/wav' });
}

/**
 * Decodes base64 audio and creates a downloadable WAV Blob.
 * @param base64Audio The base64 encoded audio string from the API.
 * @returns A Blob representing the WAV file.
 */
export const createWavBlobFromBase64 = (base64Audio: string): Blob => {
    const pcmData = decode(base64Audio);
    return createWavBlob(pcmData);
};
