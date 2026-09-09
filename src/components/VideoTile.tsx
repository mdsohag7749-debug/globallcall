import { useEffect, useRef } from 'react';
import { MicOff, Pin, PinOff, User as UserIcon, Monitor } from 'lucide-react';
import { Participant } from '../types';

interface VideoTileProps {
  key?: string;
  participant: Participant;
  stream: MediaStream | null;
  isLocal?: boolean;
  isSpeaking?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

export default function VideoTile({
  participant,
  stream,
  isLocal = false,
  isSpeaking = false,
  isPinned = false,
  onTogglePin
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideoTrack = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled && (!participant.isVideoOff || participant.isScreenSharing);

  return (
    <div 
      id={`video-tile-${participant.uid}`}
      className={`relative w-full h-full min-h-[200px] sm:min-h-[260px] bg-slate-900 rounded-2xl overflow-hidden shadow-lg border transition-all duration-200 flex items-center justify-center group ${
        isSpeaking 
          ? 'ring-3 ring-emerald-500 border-emerald-400/80 shadow-emerald-950/50' 
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full ${participant.isScreenSharing ? 'object-contain bg-slate-950' : 'object-cover'} transition-opacity duration-300 ${
          hasVideoTrack ? 'opacity-100' : 'opacity-0 absolute'
        } ${isLocal && !participant.isScreenSharing ? 'scale-x-[-1]' : ''}`}
      />

      {/* Fallback Avatar when Camera is Off */}
      {!hasVideoTrack && (
        <div className="flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="relative">
            {participant.photoURL ? (
              <img
                src={participant.photoURL}
                alt={participant.displayName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-700/80 shadow-xl object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-linear-to-tr from-indigo-600 to-violet-500 border-4 border-slate-700 flex items-center justify-center text-white text-3xl font-semibold shadow-xl">
                {participant.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            
            {/* Speaking ripple pulse */}
            {isSpeaking && (
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
            )}
          </div>

          <h4 className="mt-4 font-semibold text-slate-200 text-base sm:text-lg flex items-center gap-1.5">
            {participant.displayName}
            {isLocal && <span className="text-xs text-slate-400 font-normal">(You)</span>}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">Camera is turned off</p>
        </div>
      )}

      {/* Top badges: Pin button & Screen Share tag */}
      <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {onTogglePin && (
          <button
            id={`btn-pin-${participant.uid}`}
            onClick={onTogglePin}
            title={isPinned ? "Unpin video" : "Pin video"}
            className="p-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
        )}
      </div>

      {participant.isScreenSharing && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600/90 text-white text-xs font-medium shadow-sm backdrop-blur-sm">
          <Monitor className="w-3.5 h-3.5" />
          <span>Screen Sharing</span>
        </div>
      )}

      {/* Bottom status bar: Name + Mic state */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/70 backdrop-blur-md text-white text-xs sm:text-sm font-medium border border-white/10 shadow-sm max-w-[85%] truncate">
          <span className="truncate">
            {participant.displayName} {isLocal && '(You)'}
          </span>
          {isSpeaking && !participant.isAudioMuted && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          )}
        </div>

        {participant.isAudioMuted && (
          <div className="p-1.5 rounded-lg bg-rose-600/90 text-white shadow-sm flex items-center justify-center">
            <MicOff className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
