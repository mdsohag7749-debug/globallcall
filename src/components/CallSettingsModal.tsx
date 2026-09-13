import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { X, Mic, Video, Volume2, Check, Copy, Share2, Download, Sparkles, Radio, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';

interface CallSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomTitle: string;
  isBlurred?: boolean;
  onToggleBlur?: () => void;
  virtualBackground?: string;
  onChangeVirtualBackground?: (bg: string) => void;
  isNoiseSuppression?: boolean;
  onToggleNoiseSuppression?: () => void;
}

export default function CallSettingsModal({
  isOpen,
  onClose,
  roomId,
  roomTitle,
  isBlurred = false,
  onToggleBlur,
  virtualBackground = 'none',
  onChangeVirtualBackground,
  isNoiseSuppression = true,
  onToggleNoiseSuppression
}: CallSettingsModalProps) {
  const [copied, setCopied] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Enumerate devices
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const audioIns = devices.filter(d => d.kind === 'audioinput');
        const videoIns = devices.filter(d => d.kind === 'videoinput');
        setAudioDevices(audioIns);
        setVideoDevices(videoIns);
        if (audioIns.length > 0) setSelectedAudio(audioIns[0].deviceId);
        if (videoIns.length > 0) setSelectedVideo(videoIns[0].deviceId);
      }).catch(err => console.warn('Could not enumerate devices:', err));
    }
  }, [isOpen]);

  const inviteLink = `${window.location.origin}/?room=${roomId}`;

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleCustomImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && onChangeVirtualBackground) {
        onChangeVirtualBackground(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div 
        id="call-settings-dialog"
        className="w-full max-w-md max-h-[90dvh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-lg text-slate-100 flex items-center gap-2">
            Call Settings & Info
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Room info & invite link */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Call Room
              </span>
              <span className="text-xs text-indigo-400 font-medium">Global Network</span>
            </div>
            <p className="font-medium text-slate-200 text-sm truncate">{roomTitle}</p>
            <p className="text-xs text-slate-400">Room ID: <code className="text-indigo-300 font-mono">{roomId}</code></p>

            <div className="pt-2 flex items-center gap-2">
              <button
                id="btn-copy-call-link"
                onClick={copyInvite}
                className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Link Copied!' : 'Copy Invite Link'}
              </button>
            </div>
          </div>

          {/* Audio Input Device Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-indigo-400" />
              Microphone
            </label>
            <select
              value={selectedAudio}
              onChange={(e) => setSelectedAudio(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {audioDevices.length > 0 ? (
                audioDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                  </option>
                ))
              ) : (
                <option value="">Default System Microphone</option>
              )}
            </select>
          </div>

          {/* Video Input Device Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-indigo-400" />
              Camera
            </label>
            <select
              value={selectedVideo}
              onChange={(e) => setSelectedVideo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {videoDevices.length > 0 ? (
                videoDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                  </option>
                ))
              ) : (
                <option value="">Default System Camera</option>
              )}
            </select>
          </div>

          {/* Audio Enhancement: Noise Cancellation */}
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${isNoiseSuppression ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Noise Cancellation</p>
                <p className="text-[11px] text-slate-400">Echo filter & studio noise suppression</p>
              </div>
            </div>
            {onToggleNoiseSuppression && (
              <button
                type="button"
                onClick={onToggleNoiseSuppression}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isNoiseSuppression ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isNoiseSuppression ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            )}
          </div>

          {/* Video Effects: Background Blur */}
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${isBlurred ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-700 text-slate-400'}`}>
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Background Blur</p>
                <p className="text-[11px] text-slate-400">Blur background around your camera</p>
              </div>
            </div>
            {onToggleBlur && (
              <button
                type="button"
                onClick={onToggleBlur}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isBlurred ? 'bg-cyan-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isBlurred ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            )}
          </div>

          {/* Video Effects: Virtual Background Presets & Custom Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                Virtual Background
              </label>
              {virtualBackground !== 'none' && (
                <button
                  type="button"
                  onClick={() => onChangeVirtualBackground?.('none')}
                  className="text-[11px] text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChangeVirtualBackground?.('none')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer text-left flex items-center gap-2 ${
                  virtualBackground === 'none'
                    ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                None (Normal)
              </button>

              <button
                type="button"
                onClick={() => onChangeVirtualBackground?.('studio')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer text-left flex items-center gap-2 ${
                  virtualBackground === 'studio'
                    ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300'
                }`}
              >
                <span>🎙️</span>
                Studio
              </button>

              <button
                type="button"
                onClick={() => onChangeVirtualBackground?.('office')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer text-left flex items-center gap-2 ${
                  virtualBackground === 'office'
                    ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300'
                }`}
              >
                <span>🏢</span>
                Office
              </button>

              <button
                type="button"
                onClick={() => onChangeVirtualBackground?.('cyberpunk')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer text-left flex items-center gap-2 ${
                  virtualBackground === 'cyberpunk'
                    ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300'
                }`}
              >
                <span>🌌</span>
                Cyberpunk
              </button>
            </div>

            {/* Custom Image Upload */}
            <div className="pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCustomImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-xl border border-dashed border-indigo-500/50 hover:border-indigo-400 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-300 text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {virtualBackground.startsWith('data:') ? 'Custom Image Loaded (Click to Change)' : 'Upload Custom Image Backdrop'}
              </button>
            </div>
          </div>

          {/* WebRTC Status Info */}
          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>Connected via Firebase & Google STUN WebRTC P2P Mesh</span>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <a
            href="/project-source.zip"
            download="global-call-source.zip"
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
            title="Download full project source code as a ZIP file"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Download ZIP</span>
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
