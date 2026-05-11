import { X } from 'lucide-react';

export interface FollowUpBarProps {
  followUpText: string;
  isLoading: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onNextQuestion: () => void;
  onEndQuestion: () => void;
}

export function FollowUpBar({
  followUpText,
  isLoading,
  onTextChange,
  onSend,
  onNextQuestion,
  onEndQuestion
}: FollowUpBarProps): JSX.Element {
  return (
    <form
      className="follow-up-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        value={followUpText}
        onChange={(event) => onTextChange(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="继续追问这道题..."
        disabled={isLoading}
        rows={2}
      />
      <div className="follow-up-actions">
        <button className="secondary-button" type="submit" disabled={isLoading || !followUpText.trim()}>
          发送追问
        </button>
        <button className="secondary-button" type="button" onClick={onNextQuestion} disabled={isLoading}>
          截图下一题
        </button>
        <button className="icon-button ghost" type="button" onClick={onEndQuestion} disabled={isLoading} title="结束本题">
          <X size={18} />
        </button>
      </div>
    </form>
  );
}
