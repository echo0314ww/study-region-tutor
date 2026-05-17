import { ArrowDownToLine, Bot, Clipboard, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiConversationTurn } from '../uiTypes';
import { AnswerRenderer } from '../AnswerRenderer';
import { useTranslation } from '../i18n';

export interface ConversationViewProps {
  conversationTurns: UiConversationTurn[];
  progressText: string;
  isLoading: boolean;
}

const SCROLL_BOTTOM_THRESHOLD = 24;

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ConversationView({
  conversationTurns,
  progressText,
  isLoading
}: ConversationViewProps): JSX.Element {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const updateScrollButton = useCallback((): void => {
    const list = listRef.current;

    if (!list) {
      setShowScrollToBottom(false);
      return;
    }

    const isScrollable = list.scrollHeight > list.clientHeight + 1;
    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    setShowScrollToBottom(isScrollable && distanceToBottom > SCROLL_BOTTOM_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback((): void => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    list.scrollTo({
      top: list.scrollHeight,
      behavior: 'smooth'
    });
  }, []);

  useEffect(() => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    updateScrollButton();
    list.addEventListener('scroll', updateScrollButton, { passive: true });

    const observer = new ResizeObserver(updateScrollButton);
    observer.observe(list);

    return () => {
      list.removeEventListener('scroll', updateScrollButton);
      observer.disconnect();
    };
  }, [updateScrollButton]);

  const wasLoadingRef = useRef(false);

  useEffect(() => {
    const list = listRef.current;
    if (isLoading) {
      list?.scrollTo({ top: list.scrollHeight });
    } else if (wasLoadingRef.current && list) {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }
    wasLoadingRef.current = isLoading;
    updateScrollButton();
  }, [conversationTurns, progressText, isLoading, updateScrollButton]);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  return (
    <div className="conversation-shell">
      <div className="conversation-list" ref={listRef}>
        {conversationTurns.map((turn) => (
          <div className={`chat-bubble-row ${turn.role}`} key={turn.id}>
            {turn.role === 'assistant' && (
              <div className="chat-avatar" aria-hidden="true">
                <Bot size={15} />
              </div>
            )}
            <div className="chat-bubble">
              {turn.role === 'assistant' ? (
                <AnswerRenderer text={turn.content} />
              ) : (
                <p className="user-message">{turn.content}</p>
              )}
              <div className="chat-bubble-meta">
                <span className="chat-timestamp">{formatTimestamp(turn.timestamp)}</span>
                {turn.role === 'assistant' && (
                  <button
                    className="chat-copy-btn"
                    type="button"
                    onClick={() => handleCopy(turn.content)}
                    title={t('conversation.copy')}
                    aria-label={t('conversation.copy')}
                  >
                    <Clipboard size={13} />
                  </button>
                )}
              </div>
            </div>
            {turn.role === 'user' && (
              <div className="chat-avatar" aria-hidden="true">
                <User size={15} />
              </div>
            )}
          </div>
        ))}
        {isLoading && progressText && (
          <div className="chat-bubble-row assistant" aria-live="polite">
            <div className="chat-avatar" aria-hidden="true">
              <Bot size={15} />
            </div>
            <div className="chat-bubble">
              <AnswerRenderer text={progressText} />
            </div>
          </div>
        )}
        {isLoading && !progressText && (
          <div className="chat-bubble-row assistant" aria-live="polite">
            <div className="chat-avatar" aria-hidden="true">
              <Bot size={15} />
            </div>
            <div className="chat-bubble">
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </div>
      {showScrollToBottom && (
        <button
          className="scroll-bottom-button"
          type="button"
          onClick={scrollToBottom}
          title={t('conversation.scrollToBottom')}
          aria-label={t('conversation.scrollToBottom')}
        >
          <ArrowDownToLine size={18} />
        </button>
      )}
    </div>
  );
}
