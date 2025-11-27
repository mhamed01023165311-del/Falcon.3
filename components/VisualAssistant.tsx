/// <reference types="vite/client" />
import React, { useRef, useState, useEffect } from 'react';
import { Mic, Camera, Volume2, StopCircle, Loader2, AlertCircle } from 'lucide-react';

// استدعاء المفتاح المخفي
const API_KEY = import.meta.env.VITE_GEMINI_KEY;

const VisualAssistant: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [response, setResponse] = useState<string>("مرحباً! أنا عينك الذكية. اضغط على الكاميرا لأصف لك ما أراه.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // 1. تشغيل الكاميرا عند فتح التطبيق
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // الكاميرا الخلفية
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
      }
    } catch (err) {
      console.error("Camera Error:", err);
      setResponse("عذراً، لا يمكنني الوصول للكاميرا.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  // 2. التقاط صورة من الفيديو
  const captureFrame = (): string | null => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // Base64
      }
    }
    return null;
  };

  // 3. التحدث (Text to Speech)
  const speak = (text: string) => {
    window.speechSynthesis.cancel(); // إيقاف أي كلام سابق
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA'; // اللهجة العربية
    utterance.rate = 1.0; // السرعة
    window.speechSynthesis.speak(utterance);
  };

  // 4. تحليل المشهد (الذكاء الاصطناعي)
  const analyzeScene = async (promptText: string = "صف ما تراه في الصورة بالتفصيل باللغة العربية.") => {
    if (isProcessing) return;
    
    const imageBase64 = captureFrame();
    if (!imageBase64) return;

    setIsProcessing(true);
    // setResponse("جاري التحليل..."); // اختياري: عدم تغيير النص القديم حتى يأتي الجديد

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: promptText },
                { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
              ]
            }]
          })
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "لم أستطع تمييز شيء.";
      
      setResponse(text);
      speak(text); // نطق النتيجة تلقائياً

    } catch (error) {
      console.error(error);
      setResponse("حدث خطأ في الاتصال.");
      speak("حدث خطأ في الاتصال");
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. التعرف على الصوت (بسيط)
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("ميزة الصوت غير مدعومة في هذا المتصفح، سأقوم بوصف المشهد فقط.");
      analyzeScene();
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.start();
    setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      setResponse(`سمعتك تقول: "${transcript}"... جاري النظر...`);
      analyzeScene(transcript + " (أجب عن هذا السؤال بناءً على الصورة)");
    };

    recognition.onerror = () => {
      setIsListening(false);
      analyzeScene(); // لو فشل الصوت، يحلل الصورة عادي
    };
  };

  return (
    <div className="relative h-screen w-full bg-black text-white font-['Cairo'] overflow-hidden">
      
      {/* فيديو الكاميرا (خلفية كاملة) */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover opacity-80"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* طبقة التعتيم للقراءة */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 pointer-events-none"></div>

      {/* المحتوى العلوي (النص) */}
      <div className="absolute top-0 left-0 right-0 p-8 pt-16 text-center z-10">
        <div className="bg-black/40 backdrop-blur-md p-4 rounded-3xl border border-white/10 shadow-lg transition-all">
          <p className="text-lg md:text-xl font-bold leading-relaxed animate-fade-in">
            {response}
          </p>
        </div>
      </div>

      {/* أزرار التحكم السفلية */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 flex justify-center items-center gap-8 z-20">
        
        {/* زر الميكروفون (للسؤال) */}
        <button 
          onClick={startListening}
          disabled={isProcessing || isListening}
          className={`p-4 rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 scale-110 animate-pulse' : 'bg-gray-800/80 hover:bg-gray-700'}`}
        >
          <Mic size={32} className={isListening ? "text-white" : "text-blue-400"} />
        </button>

        {/* زر التحليل الرئيسي (الكاميرا) */}
        <button 
          onClick={() => analyzeScene()}
          disabled={isProcessing}
          className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95 transition-transform relative"
        >
          {isProcessing ? (
            <Loader2 size={48} className="text-blue-600 animate-spin" />
          ) : (
            <div className="w-20 h-20 rounded-full border-4 border-blue-500 flex items-center justify-center">
               <div className="w-16 h-16 bg-blue-600 rounded-full"></div>
            </div>
          )}
        </button>

        {/* زر إعادة النطق */}
        <button 
          onClick={() => speak(response)}
          className="p-4 rounded-full bg-gray-800/80 hover:bg-gray-700 transition-all"
        >
          <Volume2 size={32} className="text-green-400" />
        </button>

      </div>
    </div>
  );
};

export default VisualAssistant;
