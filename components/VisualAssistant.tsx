/// <reference types="vite/client" />
import React, { useRef, useState, useEffect } from 'react';
import { Mic, Video, Volume2, StopCircle, Eye, EyeOff, Loader2, Camera, RefreshCcw } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GEMINI_KEY;

const VisualAssistant: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [description, setDescription] = useState<string>("مرحباً! اضغط 'بدء' لأصف لك ما أراه.");
