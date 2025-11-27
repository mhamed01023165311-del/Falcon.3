/// <reference types="vite/client" />
import React, { useState } from 'react';
import { Mic, Camera, Volume2, Loader2, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

const API_KEY = import.meta.env.VITE_GEMINI_KEY;

const VisualAssistant: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("مرحباً! أنا مساعدك البصري. صور أي شيء وسأخبرك ما هو.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // 1. التقاط صورة (الكاميرا الأصلية)
  const captureImage = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera, // فتح الكاميرا الأصلية
        width: 800 // حجم مناسب للسرعة
      });

      if (photo.base64String) {
        setImage(`data:image/jpeg;base64,${photo.base64String}`);
        processImage(photo.base64String, "صف ما تراه في هذه الصورة بالتفصيل باللغة العربية.");
      }
    } catch (error) {
      console.error("Camera Error:", error);
      setStatus("لم يتم التقاط صورة.");
    }
  };

  // 2. تحليل الصورة
  const processImage = async (base64: string, prompt: string) => {
    if (!API_KEY) { setStatus("خطأ: المفتاح مفقود."); return; }
    
    setIsProcessing(true);
    setStatus("جاري التحليل... لحظة واحدة 🧠");

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64 } }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message);

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "لم أستطع تمييز الصورة.";
      
      setStatus(text);
      speak(text);

    } catch (error) {
      setStatus("حدث خطأ في الاتصال بالسيرفر.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. النطق
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    window.speechSynthesis.speak(utterance);
  };

  // 4. الاستماع (سؤال عن الصورة الموجودة)
  const startListening = () => {
    if (!image) {
      setStatus("يجب التقاط صورة أولاً لتسأل عنها!");
      speak("يجب التقاط صورة أولاً");
      return;
    }

    if (!('webkitSpeechRecognition' in window)) {
      alert("الاستماع غير مدعوم، سيتم إعادة وصف الصورة.");
      processImage(image.split(',')[1], "صف الصورة مرة أخرى");
      return;
    }
    
    // @ts-ignore
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.start();
    setIsListening(true);
    setStatus("أستمع إليك... اسألني عن الصورة 🎤");

    recognition.onresult = (event: any) => {
      const question = event.results[0][0].transcript;
      setIsListening(false);
      setStatus(`سؤالك: "${question}"... جاري البحث...`);
      // إعادة إرسال الصورة مع السؤال الجديد
      processImage(image.split(',')[1], `أجب عن هذا السؤال بناءً على الصورة: ${question}`);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setStatus("لم أسمع جيداً.");
    };
  };

  return (
    <div className="relative h-screen w-full bg-[#0f172a] text-white font-['Cairo'] flex flex-col overflow-hidden">
      
      {/* منطقة عرض الصورة */}
      <div className="flex-1 relative m-4 rounded-[40px] overflow-hidden bg-slate-800 border-2 border-slate-700 shadow-2xl">
        {image ? (
          <img src={image} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-gradient-to-b from-slate-800 to-slate-900">
            <ImageIcon size={80} className="opacity-20 mb-4" />
            <p className="text-lg opacity-60">لا توجد صورة</p>
          </div>
        )}
        
        {/* طبقة التعتيم للنص */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pt-20">
           <div className="max-h-[150px] overflow-y-auto">
             <p className="text-lg font-bold text-center leading-relaxed dir-rtl text-blue-100">
               {status}
             </p>
           </div>
        </div>

        {isProcessing && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Loader2 size={60} className="text-blue-500 animate-spin" />
          </div>
        )}
      </div>

      {/* لوحة التحكم */}
      <div className="h-[120px] bg-slate-900 rounded-t-[40px] shadow-[0_-5px_20px_rgba(0,0,0,0.5)] flex items-center justify-center gap-8 pb-4 relative z-20">
        
        {/* زر السؤال (المايك) */}
        <button 
          onClick={startListening}
          disabled={isProcessing}
          className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${
            isListening 
              ? 'bg-red-500 border-red-400 animate-pulse' 
              : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
          }`}
        >
          <Mic size={28} className="text-white" />
        </button>

        {/* زر التصوير الرئيسي */}
        <button 
          onClick={captureImage}
          disabled={isProcessing}
          className="w-24 h-24 rounded-full bg-blue-600 border-[6px] border-slate-900 flex items-center justify-center shadow-lg transform -translate-y-8 active:scale-95 transition-transform"
        >
          <Camera size={40} className="text-white" />
        </button>

        {/* زر إعادة النطق */}
        <button 
          onClick={() => speak(status)}
          className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-700 border-2 border-slate-600 hover:bg-slate-600 transition-all"
        >
          <Volume2 size={28} className="text-green-400" />
        </button>

      </div>
    </div>
  );
};

export default VisualAssistant;
