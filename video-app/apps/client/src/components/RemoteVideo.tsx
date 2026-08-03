import { useEffect, useRef } from 'react';

interface RemoteVideoProps {
  stream: MediaStream | null;
}

export function RemoteVideo({ stream }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div>
      <h3>Remote Video</h3>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: '320px', height: '240px', backgroundColor: '#000' }}
      />
    </div>
  );
}
