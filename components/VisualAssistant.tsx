/// <reference types="vite/client" />
import React, { useRef, useState, useEffect } from 'react';
import { Mic, Video, Volume2, StopCircle, Eye, EyeOff, Loader2, RefreshCcw, Camera } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GEMINI_KEY;

const VisualAssistant: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [description, setDescription] = useState<string>("مرحباً! اضغط 'بدء الرؤية' لأصف لك المكان.");
  const [isLive, setIsLive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const timerRef = useRef<any>(null);

  // تشغيل الكاميرا عند الفتح
  useEffect(() => {
    startCamera();
    return () => {
      stopLiveDescription();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraReady(false);
    
    try {
      // إعدادات بسيطة جداً لضمان عمل الكاميرا على كل الأجهزة
      const constraints = {
        video: {
          facingMode: 'environment', // الكاميرا الخلفية
          // شلنا تحديد الطول والعرض عشان ميحصلش تعارض
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // ننتظر حتى يبدأ الفيديو فعلياً
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsCameraReady(true); // الكاميرا اشتغلت!
          }).catch(e => {
            console.error("Play Error:", e);
            setCameraError("اضغط لتشغيل الفيديو");
          });
        };
      }
    } catch (err: any) {
      console.error("Camera Error:", err);
      setCameraError(`تعذر تشغيل الكاميرا: ${err.name}`);
    }
  };

  // نظام التحليل التلقائي
  const toggleLiveDescription = () => {
    if (isLive) {
      stopLiveDescription();
    } else {
      if (!isCameraReady) {
        startCamera(); // محاولة تشغيل الكاميرا لو مش شغالة
        return;
      }
      setIsLive(true);
      setDescription("جاري تحليل المشهد... 👁️");
      analyzeFrame();
      timerRef.current = setInterval(analyzeFrame, 4000);
    }
  };

  const stopLiveDescription = () => {
    setIsLive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    window.speechSynthesis.cancel();
  };

  // التقاط وتحليل
  const analyzeFrame = async () => {
    if (isProcessing || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState !== 4) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

    setIsProcessing(true);

    try {
      if (!API_KEY) throw new Error("المفتاح مفقود");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "صف هذا المشهد بجملة عربية قصيرة ومفيدة للمكفوفين." },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      if (text) {
        setDescription(text);
        speak(text);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="relative h-screen w-full bg-gray-900 text-white font-['Cairo'] overflow-hidden flex flex-col">
      
      {/* منطقة الكاميرا */}
      <div className="absolute inset-0 z-0 bg-black">
        {/* الفيديو */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover transition-opacity duration-500 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* رسالة الخطأ أو التحميل (تظهر لو الكاميرا مش شغالة) */}
        {!isCameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10 p-6 text-center">
            {cameraError ? (
              <>
                <Camera size={48} className="text-red-500 mb-4" />
                <p className="text-red-300 mb-4 font-bold">{cameraError}</p>
                <button 
                  onClick={startCamera} 
                  className="bg-blue-600 px-6 py-3 rounded-full font-bold flex items-center gap-2"
                >
                  <RefreshCcw size={20} /> إعادة تشغيل الكاميرا
                </button>
              </>
            ) : (
              <>
                <Loader2 size={48} className="text-blue-500 animate-spin mb-4" />
                <p className="text-gray-400">جاري فتح الكاميرا...</p>
              </>
            )}
          </div>
        )}
      </div>
      
      <canvas ref={canvasRef} className="hidden" />

      {/* الطبقة العلوية (النصوص والأزرار) */}
      <div className="relative z-20 flex flex-col justify-between h-full pointer-events-none">
        
        {/* شريط النص العلوي */}
        <div className="pt-16 px-6 pointer-events-auto">
          <div className="bg-black/60 backdrop-blur-md p-4 rounded-3xl border border-white/10 text-center shadow-lg transition-all duration-300">
            <p className="text-lg font-bold leading-relaxed dir-rtl text-blue-50">
              {description}
            </p>
          </div>
        </div>

        {/* أزرار التحكم */}
        <div className="pb-12 flex justify-center items-center gap-8 pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-32">
          
          {/* زر التشغيل الرئيسي */}
          <button 
            onClick={toggleLiveDescription}
            disabled={!isCameraReady}
            className={`w-24 h-24 rounded-full flex items-center justify-center border-4 shadow-2xl transition-all transform active:scale-95 ${
              !isCameraReady 
                ? 'bg-gray-600 border-gray-500 opacity-50' 
                : isLive 
                  ? 'bg-red-600 border-red-400 animate-pulse' 
                  : 'bg-white border-blue-500'
            }`}
          >
            {isLive ? (
              <div className="flex flex-col items-center">
                <StopCircle size={40} className="text-white mb-1" />
                <span className="text-[10px] font-bold text-white">إيقاف</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Eye size={40} className="text-blue-600 mb-1" />
                <span className="text-[10px] font-bold text-blue-600">بدء</span>
              </div>
            )}
          </button>

          {/* زر إعادة النطق */}
          <button 
            onClick={() => speak(description)}
            className="absolute right-8 bottom-16 p-4 rounded-full bg-gray-800/80 backdrop-blur border border-gray-600 hover:bg-gray-700 active:scale-95"
          >
            <Volume2 size={24} className="text-green-400" />
          </button>

        </div>
      </div>

      {/* مؤشر المعالجة */}
      {isProcessing && isLive && (
        <div className="absolute top-6 right-6 z-30 bg-blue-600/90 px-3 py-1 rounded-full flex items-center gap-2 shadow-lg">
          <Loader2 size={14} className="animate-spin text-white" />
          <span className="text-xs font-bold text-white">جاري التحليل...</span>
        </div>
      )}

    </div>
  );
};

export default VisualAssistant;
      
