import { useFocusTrap } from '../useFocusTrap';
import { useTranslation } from '../i18n';

interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ title, body, confirmLabel, danger, onCancel, onConfirm }: ConfirmModalProps): JSX.Element {
  const trapRef = useFocusTrap<HTMLElement>();
  const { t } = useTranslation();

  return (
    <div className="confirm-modal-backdrop" data-interactive="true">
      <section ref={trapRef} className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div>
          <strong id="confirm-modal-title">{title}</strong>
          <p>{body}</p>
        </div>
        <div className="confirm-modal-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            {t('app.cancel')}
          </button>
          <button
            className={danger ? 'danger-button' : 'primary-button'}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
