import { motion, AnimatePresence } from 'motion/react';

export interface ReactionItem {
  id: string;
  emoji: string;
  senderName: string;
  isLocal?: boolean;
  xPercent: number;
  swayOffset?: number;
  rotation?: number;
}

interface FloatingReactionsProps {
  reactions: ReactionItem[];
  onReactionComplete?: (id: string) => void;
}

export default function FloatingReactions({ reactions, onReactionComplete }: FloatingReactionsProps) {
  return (
    <div 
      id="floating-reactions-overlay"
      className="absolute inset-0 pointer-events-none overflow-hidden z-30 select-none"
    >
      <AnimatePresence>
        {reactions.map((r) => {
          const sway = r.swayOffset ?? ((Math.random() - 0.5) * 40);
          const rot = r.rotation ?? ((Math.random() - 0.5) * 30);

          return (
            <motion.div
              key={r.id}
              initial={{ 
                opacity: 0, 
                y: 30, 
                x: 0, 
                scale: 0.3,
                rotate: 0 
              }}
              animate={{ 
                opacity: [0, 1, 1, 0.9, 0], 
                y: [-20, -180, -340, -480], 
                x: [0, sway, -sway * 0.7, sway * 1.2],
                scale: [0.3, 1.45, 1.2, 1.0, 0.8],
                rotate: [0, rot, -rot * 0.8, rot * 1.3]
              }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ 
                duration: 3.2, 
                ease: [0.22, 1, 0.36, 1],
                times: [0, 0.2, 0.55, 0.8, 1]
              }}
              onAnimationComplete={() => {
                if (onReactionComplete) {
                  onReactionComplete(r.id);
                }
              }}
              style={{ left: `${r.xPercent}%`, bottom: '90px' }}
              className="absolute flex flex-col items-center"
            >
              {/* Floating Emoji */}
              <span className="text-4xl sm:text-5xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] transform-gpu">
                {r.emoji}
              </span>

              {/* Sender Pill Tag */}
              <span 
                className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full mt-1.5 backdrop-blur-md shadow-md border ${
                  r.isLocal
                    ? 'bg-blue-600/90 text-white border-blue-400/50'
                    : 'bg-slate-900/85 text-slate-100 border-slate-700/80'
                }`}
              >
                {r.isLocal ? 'You' : r.senderName}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

