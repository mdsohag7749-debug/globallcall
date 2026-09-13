import { useState, FormEvent } from 'react';
import { 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Send 
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Participant, ReportItem } from '../types';
import { logAuditEvent } from '../lib/moderation';

interface ReportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: Participant | { uid: string; displayName: string };
  roomId: string;
  currentUser: UserProfile;
}

const REPORT_REASONS: { id: ReportItem['reason']; label: string; desc: string }[] = [
  { id: 'spam', label: 'Spamming or Advertising', desc: 'Flooding messages or promoting unapproved services' },
  { id: 'harassment', label: 'Harassment or Bullying', desc: 'Targeted insults, offensive remarks, or hostile behavior' },
  { id: 'inappropriate_video', label: 'Inappropriate Video Broadcast', desc: 'Explicit, dangerous, or offensive webcam stream' },
  { id: 'audio_abuse', label: 'Audio Disruption / Mic Screaming', desc: 'Ear-rape noises, disruptive sounds, or trolling' },
  { id: 'other', label: 'Other Terms Violation', desc: 'Any other violation of GlobalCall community rules' }
];

export default function ReportUserModal({
  isOpen,
  onClose,
  targetUser,
  roomId,
  currentUser
}: ReportUserModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportItem['reason']>('spam');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. Add to reports collection
      await addDoc(collection(db, 'reports'), {
        reporterId: currentUser.uid,
        reporterName: currentUser.displayName,
        reportedUserId: targetUser.uid,
        reportedUserName: targetUser.displayName,
        roomId,
        reason: selectedReason,
        details: details.trim(),
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      // 2. Add to audit log
      await logAuditEvent({
        action: 'report_filed',
        actorId: currentUser.uid,
        actorName: currentUser.displayName,
        targetId: targetUser.uid,
        targetName: targetUser.displayName,
        roomId,
        details: `Reason: ${selectedReason}. Note: ${details.trim()}`
      });

      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Failed to submit user report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-rose-950/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Report User</h3>
              <p className="text-xs text-rose-300">Flagging: {targetUser.displayName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h4 className="text-lg font-bold text-white">Report Submitted</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Thank you for keeping GlobalCall safe. Our automated moderation and administrators have received your report.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Reason for reporting
              </label>
              <div className="space-y-1.5">
                {REPORT_REASONS.map(r => (
                  <label
                    key={r.id}
                    className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                      selectedReason === r.id
                        ? 'bg-rose-950/40 border-rose-500/60 text-white'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      checked={selectedReason === r.id}
                      onChange={() => setSelectedReason(r.id)}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <p className="text-xs font-semibold">{r.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Additional Details (Optional)
              </label>
              <textarea
                rows={2}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide any context that helps administrators investigate..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
