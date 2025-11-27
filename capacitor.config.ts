import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.falcon.visual', // 👈 المعرف الجديد
  appName: 'المساعد البصري', // 👈 اسم التطبيق اللي هيظهر تحت الأيقونة
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
