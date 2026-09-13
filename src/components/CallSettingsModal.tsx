import { useState, useEffect } from 'react';
import { X, Mic, Video, Volume2, Check, Copy, Share2, Download } from 'lucide-react';

interface CallSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomTitle: string;
}

export default function CallSettingsModal({
  isOpen,
  onClose,
  roomId,
  roomTitle
}: CallSettingsModalProps) {
  const [copied, setCopied] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<string>('');

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
