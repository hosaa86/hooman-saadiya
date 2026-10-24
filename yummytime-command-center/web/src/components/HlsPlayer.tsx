import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

/** Live HLS player (hls.js; native HLS on Safari/iOS). Retries on fatal errors. */
export function HlsPlayer({ src, className = '' }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    setError(null);
    let retry: number | undefined;

    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 2 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const status = data.response?.code;
        setError(status === 409 ? 'Camera offline' : 'Stream unavailable — retrying…');
        hls.destroy();
        retry = window.setTimeout(() => setAttempt((a) => a + 1), 5000);
      });
      return () => {
        clearTimeout(retry);
        hls.destroy();
      };
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {});
      return () => video.removeAttribute('src');
    }
    setError('This browser cannot play live video');
  }, [src, attempt]);

  return (
    <div className={`relative h-full w-full bg-black ${className}`}>
      <video ref={ref} muted playsInline autoPlay className="h-full w-full object-contain" />
      {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">{error}</div>}
    </div>
  );
}
