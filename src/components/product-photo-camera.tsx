"use client";
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from './ui/button';
import { openRearCamera } from '@/lib/rear-camera';

export function ProductPhotoCamera({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    void openRearCamera().then(async camera => {
      if (disposed) { camera.getTracks().forEach(track => track.stop()); return; }
      stream.current = camera;
      if (video.current) { video.current.srcObject = camera; await video.current.play(); }
    }).catch(cause => {
      if (disposed) return;
      stream.current?.getTracks().forEach(track => track.stop());
      setError(cause?.name === 'NotAllowedError'
        ? 'Kamera ruxsati berilmadi. Brauzer sozlamalaridan ruxsat bering yoki rasm yuklang.'
        : 'Orqa kamera ochilmadi. Boshqa brauzerda oching yoki rasm yuklang.');
    });
    return () => { disposed = true; mounted.current = false; stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  async function capture() {
    const element = video.current;
    if (!element?.videoWidth || !element.videoHeight || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth; canvas.height = element.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('CANVAS_UNAVAILABLE');
      context.drawImage(element, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error('CAPTURE_FAILED');
      if (mounted.current) onCapture(new File([blob], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
    } catch {
      if (mounted.current) { setError('Surat olinmadi. Qayta urinib ko‘ring.'); setCapturing(false); }
    }
  }
  return <div className="product-photo-camera">
    <div className="image-upload-actions"><strong>Orqa kamera</strong><Button type="button" variant="ghost" size="icon" aria-label="Kamerani yopish" onClick={onClose}><X size={20}/></Button></div>
    <video ref={video} autoPlay muted playsInline aria-label="Mahsulot uchun orqa kamera" onLoadedData={() => setReady(true)} style={{width:'100%',maxHeight:360,objectFit:'contain',background:'#111',borderRadius:12}}/>
    {error ? <p className="form-error" role="alert">{error}</p> : !ready && <p role="status">Kamera ochilmoqda…</p>}
    <Button type="button" variant="outline" disabled={!ready || capturing} onClick={() => void capture()}><Camera size={18}/>Suratga olish</Button>
  </div>;
}
