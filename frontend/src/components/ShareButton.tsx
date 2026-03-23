import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
}

export default function ShareButton({ url, title, text }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // Use native share API on mobile if available
    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Last resort: select-and-copy
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white/80 hover:border-white/20 cursor-pointer"
      title={copied ? 'Link copied!' : 'Share'}
    >
      {copied ? (
        <>
          <Check size={14} className="text-emerald-400" />
          <span className="text-emerald-400">Copied!</span>
        </>
      ) : (
        <>
          <Share2 size={14} />
          <span>Share</span>
        </>
      )}
    </button>
  );
}
