import { useEffect, useRef } from 'react';

interface LocalVideoProps {
  stream: MediaStream | null;
}

export function LocalVideo({ stream }: LocalVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div>
      <h3>Local Video</h3>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '320px', height: '240px', backgroundColor: '#000' }}
      />
    </div>
  );
}
