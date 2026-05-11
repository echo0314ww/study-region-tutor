import type { UiConversationTurn } from '../uiTypes';
import { AnswerRenderer } from '../AnswerRenderer';

export interface ConversationViewProps {
  conversationTurns: UiConversationTurn[];
  progressText: string;
  isLoading: boolean;
}

export function ConversationView({
  conversationTurns,
  progressText,
  isLoading
}: ConversationViewProps): JSX.Element {
  return (
    <div className="conversation-list">
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
  );
}
