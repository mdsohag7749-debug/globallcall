import { useState, useEffect, useRef, useMemo, FormEvent } from 'react';
import { 
  Send, 
  Smile, 
  Copy, 
  Check, 
  ExternalLink, 
  Search, 
  X, 
  MessageSquare, 
  ArrowDown, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, ChatMessage } from '../types';

interface CallChatProps {
  roomId: string;
  roomTitle?: string;
  roomHostId?: string;
  currentUser: UserProfile;
  isOpen: boolean;
  onSendReaction?: (emoji: string) => void;
  onClose?: () => void;
  onMessageCountChange?: (count: number) => void;
  onNewMessage?: (msg: ChatMessage) => void;
}

const MEETING_QUICK_CHIPS = [
  '👋 Hi everyone!',
  '👍 Sounds good',
  '🎙️ You are muted',
  '⏳ BRB 1 min',
  '💻 Sharing screen'
];

const CHAT_EMOJIS = ['👍', '❤️', '🎉', '👏', '🔥', '😂', '🚀', '💯', '💡', '👋'];

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getAvatarColor(id: string): string {
  const colors = [
    'from-blue-600 to-indigo-600',
    'from-emerald-600 to-teal-600',
    'from-purple-600 to-pink-600',
    'from-amber-600 to-orange-600',
    'from-cyan-600 to-blue-600',
    'from-rose-600 to-red-600'
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function CallChat({
  roomId,
  roomTitle,
  roomHostId,
  currentUser,
  isOpen,
  onSendReaction,
  onClose,
  onMessageCountChange,
  onNewMessage
}: CallChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isInitialLoadRef = useRef(true);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Real-time Firestore message listener
  useEffect(() => {
    if (!roomId) return;

    const messagesCol = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesCol, orderBy('createdAt', 'asc'), limit(150));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ChatMessage[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter out pure floating reaction items so chat stays clean
          if (data.type === 'reaction') {
            return;
          }
          list.push({
            id: docSnap.id,
            senderId: data.senderId,
            senderName: data.senderName || 'Participant',
            senderPhoto: data.senderPhoto || '',
            text: data.text || '',
            type: 'text',
            createdAt: data.createdAt
              ? data.createdAt.toDate
                ? data.createdAt.toDate().toISOString()
                : data.createdAt
              : new Date().toISOString()
          });
        });

        // Trigger new message callback if not initial load and new message arrived
        if (!isInitialLoadRef.current && list.length > messages.length) {
          const latest = list[list.length - 1];
          if (latest && onNewMessage) {
            onNewMessage(latest);
          }
        }
        isInitialLoadRef.current = false;

        setMessages(list);
        if (onMessageCountChange) {
          onMessageCountChange(list.length);
        }

        // Auto-scroll down if near bottom
        if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
          if (isNearBottom || isOpen) {
            setTimeout(() => {
              chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 80);
          }
        }
      },
      (err) => {
        console.warn('Call chat listener error:', err);
      }
    );

    return () => unsubscribe();
  }, [roomId, onMessageCountChange, onNewMessage, isOpen, messages.length]);

  // Handle scroll detection for "Scroll to bottom" button
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 180;
    setShowScrollBottom(isFarFromBottom);
  };

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isSending) return;

    setInputText('');
    setShowEmojiPicker(false);
    setIsSending(true);

    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Guest',
        senderPhoto: currentUser.photoURL || '',
        text,
        type: 'text',
        createdAt: serverTimestamp()
      });

      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Failed to send in-call chat message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const onSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase().trim();
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  // Render clickable links in messages
  const renderMessageContent = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-0.5 break-all font-medium transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
            <ExternalLink className="w-3 h-3 inline-block shrink-0 ml-0.5" />
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div id="call-chat-interface" className="flex-1 flex flex-col min-h-0 bg-slate-900/90 select-text">
      {/* Chat Sub-Header / Search Bar */}
      <div className="px-3.5 py-2.5 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        {isSearchOpen ? (
          <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-400 focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => {
                setSearchQuery('');
                setIsSearchOpen(false);
              }}
              className="text-slate-400 hover:text-slate-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>In-Call Room Chat</span>
              <span className="text-[10px] font-normal text-slate-400">
                ({messages.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                id="btn-chat-search-toggle"
                onClick={() => setIsSearchOpen(true)}
                title="Search messages"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Reaction Tray */}
      {onSendReaction && (
        <div className="px-3 py-1.5 bg-slate-950/30 border-b border-slate-800/60 flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1 shrink-0">
            <Sparkles className="w-3 h-3 text-amber-400" /> React:
          </span>
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendReaction(emoji)}
              className="text-sm p-1 hover:bg-slate-800 rounded-lg active:scale-95 transition cursor-pointer"
              title={`Send floating ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        id="call-chat-messages-container"
        className="flex-1 overflow-y-auto p-3.5 space-y-3 relative"
      >
        {filteredMessages.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-200 text-sm">
              {searchQuery ? 'No messages match your search' : 'Start the conversation'}
            </p>
            <p className="mt-1 text-slate-400 max-w-[240px] leading-relaxed">
              {searchQuery
                ? 'Try searching for different keywords.'
                : 'Send notes, links, and messages to everyone in this call.'}
            </p>

            {/* Quick Starter Prompts */}
            {!searchQuery && (
              <div className="mt-4 flex flex-col gap-1.5 w-full max-w-[220px]">
                {MEETING_QUICK_CHIPS.slice(0, 3).map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSendMessage(chip)}
                    className="text-left px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs border border-slate-700/60 transition cursor-pointer flex items-center justify-between group"
                  >
                    <span>{chip}</span>
                    <Send className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          filteredMessages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser.uid;
            const isHost = roomHostId && msg.senderId === roomHostId;
            const prevMsg = idx > 0 ? filteredMessages[idx - 1] : null;
            const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className="shrink-0 pt-0.5">
                  {!isSameSender ? (
                    msg.senderPhoto ? (
                      <img
                        src={msg.senderPhoto}
                        alt={msg.senderName}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-700"
                      />
                    ) : (
                      <div
                        className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(
                          msg.senderId
                        )} text-white text-[10px] font-bold flex items-center justify-center shadow-sm`}
                      >
                        {getInitials(msg.senderName)}
                      </div>
                    )
                  ) : (
                    <div className="w-7 h-7" />
                  )}
                </div>

                {/* Message Body & Metadata */}
                <div
                  className={`flex flex-col max-w-[80%] ${
                    isMe ? 'items-end' : 'items-start'
                  }`}
                >
                  {!isSameSender && (
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[11px] font-semibold text-slate-300">
                        {isMe ? 'You' : msg.senderName}
                      </span>
                      {isHost && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                          <ShieldCheck className="w-2.5 h-2.5" /> Host
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* Bubble */}
                  <div className="relative group/bubble">
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm shadow-sm break-words whitespace-pre-wrap leading-relaxed ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-tr-xs selection:bg-indigo-900'
                          : 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700/80 selection:bg-slate-700'
                      }`}
                    >
                      {renderMessageContent(msg.text)}
                    </div>

                    {/* Copy action on hover */}
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.text)}
                      title="Copy text"
                      className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1 bg-slate-900/90 text-slate-300 hover:text-white rounded-md border border-slate-700 shadow-md cursor-pointer ${
                        isMe ? '-left-7' : '-right-7'
                      }`}
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-4 z-20 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-xl flex items-center gap-1.5 cursor-pointer animate-in fade-in transition"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>New messages</span>
        </button>
      )}

      {/* Quick Chips Bar */}
      <div className="px-3 py-1.5 bg-slate-950/40 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        {MEETING_QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleSendMessage(chip)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-700/60 whitespace-nowrap transition cursor-pointer"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Emoji Picker Tray (expandable) */}
      {showEmojiPicker && (
        <div className="px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 animate-in fade-in slide-in-from-bottom-2">
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setInputText((prev) => prev + emoji);
                inputRef.current?.focus();
              }}
              className="text-lg p-1.5 rounded-lg hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Chat Composer Input Form */}
      <form
        onSubmit={onSubmitForm}
        className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          title="Insert Emoji"
          className={`p-2 rounded-xl transition cursor-pointer ${
            showEmojiPicker
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Smile className="w-4 h-4" />
        </button>

        <input
          ref={inputRef}
          id="call-chat-input"
          type="text"
          placeholder="Send a message to everyone in call..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        />

        <button
          id="call-chat-send-btn"
          type="submit"
          disabled={!inputText.trim() || isSending}
          title="Send message"
          className="p-2 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline text-xs font-semibold">Send</span>
        </button>
      </form>
    </div>
  );
}
