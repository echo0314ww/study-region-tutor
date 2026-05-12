import { ArrowDownToLine } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UiConversationTurn } from '../uiTypes';
import { AnswerRenderer } from '../AnswerRenderer';

export interface ConversationViewProps {
  conversationTurns: UiConversationTurn[];
  progressText: string;
  isLoading: boolean;
}

const SCROLL_BOTTOM_THRESHOLD = 24;

export function ConversationView({
  conversationTurns,
  progressText,
  isLoading
}: ConversationViewProps): JSX.Element {
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

  useEffect(() => {
    updateScrollButton();
  }, [conversationTurns, progressText, isLoading, updateScrollButton]);

  return (
    <div className="conversation-shell">
      <div className="conversation-list" ref={listRef}>
        {conversationTurns.map((turn) => (
          <section className={`conversation-turn ${turn.role}`} key={turn.id}>
            <div className="conversation-role">{turn.role === 'user' ? '我的追问' : '讲解'}</div>
            {turn.role === 'assistant' ? (
              <AnswerRenderer text={turn.content} />
            ) : (
              <p className="user-message">{turn.content}</p>
            )}
          </section>
        ))}
        {isLoading && progressText && (
          <section className="conversation-turn assistant">
            <div className="conversation-role">处理过程</div>
            <AnswerRenderer text={progressText} />
          </section>
        )}
      </div>
      {showScrollToBottom && (
        <button
          className="scroll-bottom-button"
          type="button"
          onClick={scrollToBottom}
          title="跳到底部"
          aria-label="跳到底部"
        >
          <ArrowDownToLine size={18} />
        </button>
      )}
    </div>
  );
}
