/// <reference types="vite/client" />
import React, { useRef, useState, useEffect } from 'react';
import { Mic, Video, Volume2, StopCircle, Eye, EyeOff } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GEMINI_KEY;

const VisualAssistant: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [description, setDescription] = useState<string>("مرحباً! اضغط على 'بدء الرؤية' لأصف لك العالم.");
  const [isLive, setIsLive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const timerRef = useRef<any>(null);

  // 1. تشغيل الكاميرا فيديو مباشر فور فتح التطبيق
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopLiveDescription();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // الكاميرا الخلفية
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera Error:", err);
      setDescription("يرجى السماح بصلاحيات الكاميرا من إعدادات الهاتف.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
  };

  // 2. نظام الوصف التلقائي (عين الذكاء الاصطناعي)
  const toggleLiveDescription = () => {
    if (isLive) {
      stopLiveDescription();
    } else {
      setIsLive(true);
      setDescription("جاري تحليل المشهد... 👁️");
      // ابدأ التحليل فوراً ثم كرر كل 5 ثواني
      analyzeFrame();
      timerRef.current = setInterval(analyzeFrame, 5000);
    }
  };

  const stopLiveDescription = () => {
    setIsLive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    window.speechSynthesis.cancel();
  };

  // 3. التقاط فريم من الفيديو وتحليله
  const analyzeFrame = async () => {
    if (isProcessing || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // التأكد من أن الفيديو يعمل
    if (video.readyState !== 4) return;

    // رسم اللقطة الحالية
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1]; // جودة متوسطة للسرعة

    setIsProcessing(true);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "أنت عيني الآن. صف ما تراه في هذا الفيديو بجملة واحدة قصيرة ومفيدة جداً باللغة العربية." },
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

  // 4. نطق النص
  const speak = (text: string) => {
    // إلغاء أي كلام قديم لعدم التداخل
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.1; // أسرع قليلاً ليكون طبيعياً
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="relative h-screen w-full bg-black text-white font-['Cairo'] overflow-hidden">
      
      {/* الفيديو المباشر (يملأ الشاشة) */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scale(1.02)' }} // تكبير طفيف لإخفاء الحواف
      />
      
      {/* كانفاس مخفي للالتقاط */}
      <canvas ref={canvasRef} className="hidden" />

      {/* طبقة تظليل لقراءة النص */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none"></div>

      {/* المحتوى العلوي: الرد المكتوب */}
      <div className="absolute top-0 left-0 right-0 p-6 pt-12 z-20 flex justify-center">
        <div className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10 max-w-sm text-center shadow-lg transition-all duration-300">
          <p className="text-lg font-bold text-white leading-relaxed dir-rtl animate-pulse-slow">
            {description}
          </p>
        </div>
      </div>

      {/* أزرار التحكم السفلية */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 flex justify-center items-center gap-10 z-20">
        
        {/* زر التشغيل/الإيقاف (العين) */}
        <button 
          onClick={toggleLiveDescription}
          className={`w-24 h-24 rounded-full flex items-center justify-center border-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all transform active:scale-95 ${
            isLive 
              ? 'bg-red-600 border-red-400 animate-pulse' 
              : 'bg-white border-blue-500'
          }`}
        >
          {isLive ? (
            <div className="flex flex-col items-center">
              <EyeOff size={40} className="text-white mb-1" />
              <span className="text-[10px] font-bold">إيقاف</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Eye size={40} className="text-blue-600 mb-1" />
              <span className="text-[10px] font-bold text-blue-600">بدء الرؤية</span>
            </div>
          )}
        </button>

        {/* زر إعادة النطق (لو فاتتك جملة) */}
        <button 
          onClick={() => speak(description)}
          className="absolute right-8 p-4 rounded-full bg-gray-800/80 hover:bg-gray-700 border border-gray-600 transition-all"
        >
          <Volume2 size={24} className="text-green-400" />
        </button>

      </div>
    </div>
  );
};

export default VisualAssistant;
