export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

// Creates a dummy silent audio track for fallback if microphone hardware is unavailable
export function createSilentAudioStream(): MediaStream {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = 0; // silent
    osc.connect(gain);
    gain.connect(dst);
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    return new MediaStream([track]);
  } catch (e) {
    console.warn('AudioContext fallback creation failed', e);
    return new MediaStream();
  }
}

// Creates a placeholder colored canvas video stream if webcam hardware is not accessible
export function createPlaceholderVideoStream(userName: string = 'User'): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  
  let hue = 210;
  const draw = () => {
    if (!ctx) return;
    // Dark animated aesthetic gradient
    const gradient = ctx.createLinearGradient(0, 0, 640, 480);
    gradient.addColorStop(0, `hsl(${hue}, 40%, 15%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 40%, 10%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 480);

    // Initial avatar circle
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.beginPath();
    ctx.arc(320, 210, 70, 0, Math.PI * 2);
    ctx.fill();

    // Initials
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(userName.charAt(0).toUpperCase(), 320, 210);

    // Text
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(`${userName} (Camera Standby)`, 320, 320);

    hue = (hue + 0.2) % 360;
  };

  setInterval(draw, 100);
  draw();

  return (canvas as any).captureStream ? (canvas as any).captureStream(15) : new MediaStream();
}
