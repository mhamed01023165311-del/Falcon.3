/// <reference types="vite/client" />
import React, { useRef, useState, useEffect } from 'react';
import { Mic, Camera, Volume2, Loader2, RefreshCcw } from 'lucide-react';
import { Camera as CapCamera } from '@capacitor/camera'; // استيراد كاباكتور للأذونات

const API_KEY = import.meta.env.VITE_GEMINI_KEY;

const VisualAssistant: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>("أهلاً! أنا عينك الذكية. اضغط على الكاميرا لأصف لك ما أراه.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  // 1. طلب الأذونات وتشغيل الكاميرا عند البداية
  useEffect(() => {
    initCamera();
    return () => stopCamera();
  }, []);

  const initCamera = async () => {
    try {
      // طلب إذن الكاميرا من النظام أولاً
      const permissions = await CapCamera.requestPermissions({ permissions: ['camera'] });
      
      if (permissions.camera === 'granted') {
        startCameraStream();
      } else {
        setStatus("يجب السماح باستخدام الكاميرا ليعمل التطبيق.");
      }
    } catch (e) {
      console.error("Permission Error:", e);
      // محاولة التشغيل حتى لو فشل طلب الإذن (للمتصفح)
      startCameraStream();
    }
  };

  const startCameraStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error("Camera Error:", err);
      setStatus("تعذر الوصول للكاميرا. تأكد من الأذونات.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      setCameraActive(false);
    }
  };

  // 2. التقاط صورة
  const captureFrame = (): string | null => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
      }
    }
    return null;
  };

  // 3. النطق
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    window.speechSynthesis.speak(utterance);
  };

  // 4. الاستماع
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("ميزة الصوت غير مدعومة، سيتم تحليل المشهد فقط.");
      processRequest("صف ما تراه");
      return;
    }
    
    // @ts-ignore
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.start();
    setIsListening(true);
    setStatus("جاري الاستماع... 🎤");

    recognition.onresult = (event: any) => {
      const question = event.results[0][0].transcript;
      setIsListening(false);
      processRequest(question);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setStatus("لم أسمعك جيداً، اضغط وحاول مرة أخرى.");
    };
  };

  // 5. المعالجة
  const processRequest = async (question: string) => {
    if (isProcessing) return;
    const imageBase64 = captureFrame();
    
    if (!imageBase64) {
        setStatus("الكاميرا لا تعمل! اضغط زر التحديث.");
        return;
    }
    if (!API_KEY) {
        setStatus("خطأ: مفتاح الذكاء الاصطناعي مفقود.");
        return;
    }

    setIsProcessing(true);
    setStatus(`.. جارٍ التفكير ..`);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `أنت مساعد بصري للمكفوفين. انظر للصورة وأجب بالعربية باختصار ومودة: "${question}"` },
                { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "لم أستطع تحليل الصورة.";
      
      setStatus(text);
      speak(text);

    } catch (error) {
      setStatus("حدث خطأ في الاتصال.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col font-['Cairo'] text-white">
      
      {/* طبقة الفيديو (الكاميرا) - في الخلفية تماماً */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-0'}`} 
        style={{ zIndex: 0 }}
      />
      
      <canvas ref={canvasRef} className="hidden" />

      {/* زر إعادة تشغيل الكاميرا (يظهر فقط لو الكاميرا معلقة) */}
      {!cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900">
            <button onClick={initCamera} className="flex flex-col items-center gap-4 text-blue-400">
                <RefreshCcw size={48} />
                <span className="text-xl font-bold">تشغيل الكاميرا</span>
            </button>
        </div>
      )}

      {/* طبقة تظليل خفيفة عشان الكلام يبان */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none z-10"></div>

      {/* المحتوى (فوق كل شيء z-20) */}
      <div className="relative z-20 flex-1 flex flex-col justify-between p-6">
        
        {/* مربع النص (الرد) */}
        <div className="mt-12 bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-white/20 text-center shadow-xl">
          <p className="text-lg md:text-2xl font-bold leading-relaxed dir-rtl">
            {status}
          </p>
        </div>

        {/* الأزرار */}
        <div className="mb-8 flex justify-center items-center gap-8">
          
          {/* زر الميكروفون */}
          <button 
            onClick={startListening}
            disabled={isProcessing}
            className={`w-16 h-16 rounded-full flex items-center justify-center bg-gray-800/80 border border-gray-600 active:scale-95 transition-all ${isListening ? 'bg-red-500/80 border-red-400 animate-pulse' : ''}`}
          >
            <Mic size={28} className="text-white" />
          </button>

          {/* زر الكاميرا (الرئيسي) */}
          <button 
            onClick={() => processRequest("صف ما تراه أمامك")}
            disabled={isProcessing}
            className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.4)] active:scale-95 transition-transform border-4 border-blue-500"
          >
            {isProcessing ? (
              <Loader2 size={48} className="text-blue-600 animate-spin" />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
                  <Camera size={40} className="text-white" />
              </div>
            )}
          </button>

          {/* زر النطق */}
          <button 
            onClick={() => speak(status)}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-gray-800/80 border border-gray-600 active:scale-95 transition-all"
          >
            <Volume2 size={28} className="text-green-400" />
          </button>

        </div>
      </div>
    </div>
  );
};

export default VisualAssistant;
