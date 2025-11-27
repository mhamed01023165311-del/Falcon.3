import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Video, VideoOff, AlertCircle, Power, Navigation, Settings, X, Volume2 } from 'lucide-react';
import { createPcmBlob, decodeAudioData, base64ToUint8Array, blobToBase64 } from '../utils/audioUtils';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
// Balanced Config: Good quality for details, reasonable speed
const FRAME_RATE = 3; // 3 FPS (Every ~333ms) - Good balance
const IMAGE_SCALE = 0.6; // 60% resolution - Better visibility for the AI

const VisualAssistant: React.FC = () => {
  // State
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [jpegQuality, setJpegQuality] = useState(0.6); // Higher default quality

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const audioNextStartTimeRef = useRef<number>(0);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentSessionRef = useRef<any>(null);
  const jpegQualityRef = useRef(0.6);

  // Sync state to ref
  useEffect(() => {
    jpegQualityRef.current = jpegQuality;
  }, [jpegQuality]);

  // Cleanup Function
  const cleanup = useCallback(() => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    
    // Stop Media Stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    currentSessionRef.current = null;
    sessionPromiseRef.current = null;
    
    setIsStreaming(false);
    setTranscription("");
    setAudioLevel(0);
  }, []);

  // Initialize Media Stream with Robust Fallback Logic
  const startCamera = async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg = "عذراً، متصفحك لا يدعم الوصول للكاميرا. يرجى استخدام متصفح حديث.";
        setError(msg);
        alert(msg);
        return null;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      let stream: MediaStream;

      // 1. Try Environment Camera + Audio (Preferred)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
              facingMode: 'environment',
              width: { ideal: 1280 }, // Higher resolution request
              height: { ideal: 720 },
              frameRate: { ideal: 20 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000,
          }
        });
      } catch (firstErr) {
        console.warn("Primary camera config failed, trying fallback...", firstErr);
        
        // 2. Fallback: Any Camera + Audio
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        } catch (secondErr) {
            console.warn("Audio fallback failed, trying video only...", secondErr);
            
            // 3. Fallback: Video Only (if mic fails)
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
            setIsMicOn(false);
            setError("تم تشغيل الكاميرا بدون صوت (تعذر الوصول للميكروفون).");
        }
      }
      
      streamRef.current = stream;
      
      // Assign stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = async () => {
            try {
                await videoRef.current?.play();
            } catch (playErr) {
                console.error("Video auto-play failed:", playErr);
                setNeedsInteraction(true);
            }
        };
      }
      return stream;

    } catch (err: any) {
      console.error("Final Error accessing media devices:", err);
      let msg = "تعذر تشغيل الكاميرا. تأكد من السماح بالوصول.";
      setError(msg);
      alert(msg);
      return null;
    }
  };

  const connectToGemini = useCallback(async () => {
    if (isStreaming) return;
    if (!process.env.API_KEY) {
      setError("مفتاح API غير موجود.");
      return;
    }

    setError(null);
    setTranscription("جاري تهيئة المساعد الذكي...");

    const stream = await startCamera();
    if (!stream) {
      setTranscription("فشل تشغيل الكاميرا.");
      return;
    }

    setIsStreaming(true);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Output Audio Context
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    audioContextRef.current = audioCtx;
    
    if (audioCtx.state === 'suspended') {
        setNeedsInteraction(true);
    }

    // Input Audio Context
    const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    inputAudioContextRef.current = inputAudioCtx;

    const outputGainNode = audioCtx.createGain();
    outputGainNode.connect(audioCtx.destination);
    audioNextStartTimeRef.current = audioCtx.currentTime;

    const sessionPromise = ai.live.connect({
      model: MODEL_NAME,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `You are a helpful, fast, and observant visual assistant for a blind user, speaking Egyptian Arabic.

        **Instructions:**
        1. **Continuous Description:** Immediately describe what you see in the video feed. Describe the path, objects, people, and environment in detail but maintain a natural, fast pace.
        2. **Safety Override:** If you see an immediate danger or obstacle (wall, stairs, chair, person close by), INTERRUPT your description and give a sharp, clear warning (e.g., "حاسب! كرسي قدامك", "قف! حيطة").
        3. **Interaction:** If the user speaks, answer them fast. If they say "بس" (Stop), stop talking.
        
        Start speaking immediately upon connection.
        `,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      },
      callbacks: {
        onopen: () => {
          setTranscription("المساعد جاهز.");
          
          // Audio Stream Setup
          if (inputAudioCtx.state === 'suspended') inputAudioCtx.resume();
          
          const source = inputAudioCtx.createMediaStreamSource(stream);
          const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
          
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Visualization
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            setAudioLevel(Math.sqrt(sum / inputData.length));
            
            const blob = createPcmBlob(inputData);
            sessionPromise.then(session => {
                session.sendRealtimeInput({ 
                    media: { mimeType: blob.mimeType, data: blob.data } 
                });
            }).catch(e => console.error("Error sending audio:", e));
          };
          
          source.connect(processor);
          processor.connect(inputAudioCtx.destination);
          
          sourceNodeRef.current = source;
          scriptProcessorRef.current = processor;
          
          // Video Stream Setup
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          videoIntervalRef.current = window.setInterval(() => {
            if (videoRef.current && ctx) {
              // Scale resolution based on config
              canvas.width = videoRef.current.videoWidth * IMAGE_SCALE;
              canvas.height = videoRef.current.videoHeight * IMAGE_SCALE;
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              
              const currentQuality = jpegQualityRef.current;
              
              canvas.toBlob(async (blob) => {
                if (blob) {
                  const base64 = await blobToBase64(blob);
                  sessionPromise.then(session => {
                      session.sendRealtimeInput({ 
                          media: { mimeType: 'image/jpeg', data: base64 } 
                      });
                  }).catch(e => console.error("Error sending video:", e));
                }
              }, 'image/jpeg', currentQuality);
            }
          }, 1000 / FRAME_RATE);
        },
        onmessage: async (msg: LiveServerMessage) => {
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            const buffer = await decodeAudioData(base64ToUint8Array(audioData), audioCtx);
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputGainNode);
            
            const now = audioCtx.currentTime;
            const start = Math.max(now, audioNextStartTimeRef.current);
            source.start(start);
            audioNextStartTimeRef.current = start + buffer.duration;
          }
          
          if (msg.serverContent?.interrupted) {
            audioNextStartTimeRef.current = 0;
          }
        },
        onclose: () => {
          console.log("Connection closed");
          setIsStreaming(false);
          setTranscription("انقطع الاتصال.");
        },
        onerror: (err) => {
          console.error("Gemini Live Error:", err);
          cleanup();
          setError("حدث خطأ في الاتصال بالمخدم. يرجى المحاولة مرة أخرى.");
        }
      }
    });
    
    sessionPromiseRef.current = sessionPromise;
    currentSessionRef.current = await sessionPromise;
  }, [isStreaming, cleanup, startCamera]);

  const toggleMic = () => {
    setIsMicOn(!isMicOn);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => track.enabled = !isMicOn);
    }
  };

  const toggleCamera = () => {
    setIsCameraOn(!isCameraOn);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => track.enabled = !isCameraOn);
    }
  };

  const handleStartInteraction = async () => {
    if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    if (videoRef.current && videoRef.current.paused) {
        await videoRef.current.play();
    }
    setNeedsInteraction(false);
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden font-sans">
      
      {/* Settings & Header */}
      <div className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-start bg-gradient-to-b from-black/90 via-black/40 to-transparent">
        <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                <Navigation className="w-5 h-5 text-sky-400" />
             </div>
             {isStreaming && (
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-sky-400 tracking-wider">LIVE</span>
                    <div className="flex gap-0.5 mt-1">
                        <div className="w-1 h-3 bg-sky-500 rounded-full animate-pulse" style={{animationDelay: '0ms'}}></div>
                        <div className="w-1 h-3 bg-sky-500 rounded-full animate-pulse" style={{animationDelay: '100ms'}}></div>
                        <div className="w-1 h-3 bg-sky-500 rounded-full animate-pulse" style={{animationDelay: '200ms'}}></div>
                    </div>
                </div>
             )}
        </div>
        
        <button 
           onClick={() => setShowSettings(true)}
           className="p-3 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 transition-all active:scale-95"
           aria-label="Settings"
        >
           <Settings className="w-6 h-6 text-white/90" />
        </button>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 relative w-full h-full">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover transition-opacity duration-700 ${isCameraOn ? 'opacity-100' : 'opacity-20 blur-lg'}`}
        />
        
        {!isCameraOn && (
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="flex flex-col items-center gap-4 text-neutral-500">
                <VideoOff className="w-20 h-20 opacity-30" />
                <p className="text-sm font-light tracking-widest uppercase">الكاميرا مغلقة</p>
             </div>
          </div>
        )}

        {/* Welcome / Start Overlay */}
        {!isStreaming && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-30 px-6 text-center animate-in fade-in zoom-in duration-300">
                <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400 mb-8 leading-tight py-2">
                    مرحباً بك في<br/>المساعد البصري
                </h1>
                
                <button 
                    onClick={connectToGemini}
                    className="group relative flex items-center justify-center p-8 rounded-full bg-gradient-to-tr from-sky-600 to-blue-700 shadow-2xl shadow-sky-900/40 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                    <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-20 group-hover:opacity-40"></div>
                    <Power className="w-12 h-12 text-white fill-white/20" />
                </button>
                <p className="mt-6 text-neutral-400 text-sm font-medium">اضغط للاتصال بالعين الثالثة</p>
            </div>
        )}

        {/* iOS Interaction Trigger */}
        {needsInteraction && isStreaming && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40 backdrop-blur-sm">
                 <button 
                    onClick={handleStartInteraction}
                    className="px-8 py-4 bg-white text-black rounded-2xl font-bold flex items-center gap-3 animate-bounce shadow-xl"
                >
                    <Volume2 className="w-6 h-6" />
                    تفعيل الصوت
                </button>
            </div>
        )}

        {/* Floating Settings Panel */}
        {showSettings && (
            <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
                <div className="bg-neutral-900/90 border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl backdrop-blur-xl mb-4 sm:mb-0">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Settings className="w-5 h-5 text-sky-400" />
                            إعدادات الصورة
                        </h2>
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="p-2 bg-white/5 rounded-full text-neutral-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-sm font-medium text-neutral-300">الجودة (Speed vs Quality)</label>
                                <span className="text-sm font-bold text-sky-400 bg-sky-400/10 px-2 py-1 rounded-lg">{Math.round(jpegQuality * 100)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.1" 
                                max="1.0" 
                                step="0.1" 
                                value={jpegQuality} 
                                onChange={(e) => setJpegQuality(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400"
                            />
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Modern Glass Floating Dock (Footer) */}
      {isStreaming && (
        <div className="absolute bottom-8 left-6 right-6 z-20 flex justify-center">
            <div className="bg-neutral-900/70 backdrop-blur-xl border border-white/10 rounded-3xl p-2 px-6 shadow-2xl flex items-center gap-6 sm:gap-8 max-w-md w-full justify-between">
                
                {/* Visualizer (Mini) */}
                <div className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none">
                     <div className="bg-black/50 backdrop-blur-md px-4 py-1 rounded-full border border-white/5">
                        <p className="text-xs text-sky-200 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
                            {transcription || "استمع..."}
                        </p>
                     </div>
                </div>

                <button 
                    onClick={toggleCamera}
                    className={`p-4 rounded-2xl transition-all duration-300 ${
                        isCameraOn 
                        ? 'bg-white/10 text-white hover:bg-white/20' 
                        : 'bg-red-500/20 text-red-400'
                    }`}
                >
                    {isCameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>

                <button 
                    onClick={cleanup}
                    className="p-4 bg-red-500/90 hover:bg-red-500 text-white rounded-2xl shadow-lg shadow-red-900/40 hover:scale-105 transition-all duration-300 flex items-center justify-center"
                >
                    <Power className="w-8 h-8" />
                </button>

                <button 
                    onClick={toggleMic}
                    className={`p-4 rounded-2xl transition-all duration-300 ${
                        isMicOn 
                        ? 'bg-white/10 text-white hover:bg-white/20' 
                        : 'bg-red-500/20 text-red-400'
                    }`}
                >
                    {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
            </div>
            
            {/* Audio Wave Background for Dock */}
            <div 
                className="absolute bottom-0 left-0 right-0 h-full -z-10 bg-sky-500/20 blur-3xl rounded-full transition-all duration-100"
                style={{ opacity: Math.min(audioLevel * 2, 0.6), transform: `scale(${1 + audioLevel})` }}
            />
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="absolute top-20 left-6 right-6 z-50 animate-in slide-in-from-top duration-300">
            <div className="bg-red-500/90 backdrop-blur-md p-4 rounded-2xl border border-red-400/30 text-white shadow-xl flex items-center gap-4 max-w-md mx-auto">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div className="flex-1 text-sm font-medium">{error}</div>
                <button 
                    onClick={() => { setError(null); connectToGemini(); }}
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-colors"
                >
                    تحديث
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default VisualAssistant;