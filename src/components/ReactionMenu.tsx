import { useState, useRef, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ReactionEmoji {
  emoji: string;
  label: string;
  name: string;
}

export const REACTION_EMOJIS: ReactionEmoji[] = [
  { emoji: '👍', label: 'Thumbs Up', name: 'thumbs-up' },
  { emoji: '❤️', label: 'Heart', name: 'heart' },
  { emoji: '🎉', label: 'Party Popper', name: 'party-popper' },
  { emoji: '👏', label: 'Applause', name: 'applause' },
  { emoji: '🔥', label: 'Fire', name: 'fire' },
  { emoji: '😂', label: 'Laugh', name: 'laugh' },
  { emoji: '🚀', label: 'Rocket', name: 'rocket' },
  { emoji: '💯', label: 'Hundred', name: 'hundred' },
  { emoji: '💡', label: 'Idea', name: 'idea' },
];

interface ReactionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSendReaction: (emoji: string) => void;
}

export default function ReactionMenu({
  isOpen,
  onClose,
  onSendReaction,
}: ReactionMenuProps) {
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState<Record<string, number>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on escape key or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Only close if click is not on the toggle button
        const toggleBtn = document.getElementById('control-btn-reactions');
        if (toggleBtn && toggleBtn.contains(e.target as Node)) {
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleEmojiClick = (emoji: string) => {
    setActiveEmoji(emoji);
    setClickCount((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] || 0) + 1,
    }));

    onSendReaction(emoji);

    setTimeout(() => {
      setActiveEmoji(null);
    }, 400);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          id="floating-reaction-menu"
          initial={{ opacity: 0, y: 15, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-3 shadow-2xl backdrop-blur-2xl flex flex-col gap-2 min-w-[280px] sm:min-w-[360px]"
        >
          {/* Header row with title & close button */}
          <div className="flex items-center justify-between px-1.5 pb-1 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Send Reaction to Room</span>
            </div>
            <button
              id="close-reaction-menu-btn"
              onClick={onClose}
              title="Close menu"
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Emoji Reaction Buttons Grid */}
          <div className="flex items-center justify-between gap-1 sm:gap-2 px-1 py-1">
            {REACTION_EMOJIS.map(({ emoji, label, name }) => {
              const isSelected = activeEmoji === emoji;
              const count = clickCount[emoji] || 0;

              return (
                <div key={name} className="relative group flex flex-col items-center">
                  <button
                    id={`reaction-btn-${name}`}
                    type="button"
                    onClick={() => handleEmojiClick(emoji)}
                    title={label}
                    className={`relative p-2 sm:p-2.5 rounded-xl transition-all duration-150 cursor-pointer text-2xl sm:text-3xl select-none flex items-center justify-center ${
                      isSelected
                        ? 'bg-indigo-600/30 ring-2 ring-indigo-500 scale-125'
                        : 'hover:bg-slate-800/80 hover:scale-120 active:scale-95'
                    }`}
                  >
                    <span className="transform transition-transform group-hover:rotate-6">
                      {emoji}
                    </span>

                    {/* Pop bounce indicator */}
                    {isSelected && (
                      <motion.span
                        initial={{ scale: 0.5, opacity: 1 }}
                        animate={{ scale: 1.6, opacity: 0 }}
                        className="absolute inset-0 rounded-xl bg-indigo-400/30 pointer-events-none"
                      />
                    )}
                  </button>

                  {/* Tooltip on hover */}
                  <span className="absolute -top-7 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 text-[10px] font-medium text-slate-200 bg-slate-950 px-2 py-0.5 rounded-md shadow-md border border-slate-800 whitespace-nowrap z-50">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="px-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Tap any emoji to float on all screens</span>
            <span className="text-[10px] text-slate-400 font-mono">Esc to close</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
