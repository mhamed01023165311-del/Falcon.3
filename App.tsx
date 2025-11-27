import React from 'react';
// استدعاء المساعد البصري الجديد
import VisualAssistant from './components/VisualAssistant';

const App: React.FC = () => {
  return (
    // خلفية سوداء للتطبيق
    <div className="min-h-screen bg-black text-white font-['Cairo']">
      <VisualAssistant />
    </div>
  );
};

export default App;
