import { AlertTriangle, CheckCircle2, Clipboard, Info, XCircle } from 'lucide-react';
import type { DiagnosticResult, DiagnosticStatus } from '../../../shared/types';
import type { MessageKey } from '../i18n';
import { useTranslation } from '../i18n';

type TranslateFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

export function diagnosticReportText(result: DiagnosticResult, t: TranslateFunction): string {
  const lines = [
    t('diagnostics.reportTitle'),
    t('diagnostics.generatedAt', { time: result.generatedAt }),
    t('diagnostics.appVersion', { version: result.appVersion || t('proxy.admin.unknown') }),
    t('diagnostics.connectionMode', { mode: result.mode === 'proxy' ? t('diagnostics.proxyService') : t('diagnostics.directConnect') }),
    t('diagnostics.overallResult', { result: result.ok ? t('diagnostics.passed') : t('diagnostics.hasIssues') }),
    ''
  ];

  for (const item of result.steps) {
    lines.push(`[${item.status.toUpperCase()}] ${item.title}`);
    lines.push(t('diagnostics.result', { summary: item.summary }));

    if (item.cause) {
      lines.push(t('diagnostics.possibleCause', { cause: item.cause }));
    }

    if (item.solution) {
      lines.push(t('diagnostics.suggestion', { solution: item.solution }));
    }

    if (item.technicalDetail) {
      lines.push(t('diagnostics.technicalDetail', { detail: item.technicalDetail }));
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

function statusIcon(status: DiagnosticStatus): JSX.Element {
  if (status === 'pass') {
    return <CheckCircle2 size={16} />;
  }

  if (status === 'warn') {
    return <AlertTriangle size={16} />;
  }

  return <XCircle size={16} />;
}

export interface DiagnosticReportProps {
  result: DiagnosticResult;
  onCopy: (text: string) => void;
}

export function DiagnosticReport({ result, onCopy }: DiagnosticReportProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={`diagnostic-report ${result.ok ? '' : 'has-failures'}`}>
      <div className="diagnostic-summary">
        <div>
          <Info size={17} />
          <strong>{result.ok ? t('diagnostics.passedSummary') : t('diagnostics.failedSummary')}</strong>
        </div>
        <button className="secondary-button" type="button" onClick={() => onCopy(diagnosticReportText(result, t))}>
          <Clipboard size={16} />
          {t('diagnostics.copyReport')}
        </button>
      </div>
      <div className="diagnostic-steps">
        {result.steps.map((item) => (
          <details key={item.id} className={`diagnostic-step ${item.status}`} open={item.status !== 'pass'}>
            <summary>
              {statusIcon(item.status)}
              <span>{item.title}</span>
              <em>{item.status === 'pass' ? t('diagnostics.pass') : item.status === 'warn' ? t('diagnostics.warn') : t('diagnostics.fail')}</em>
            </summary>
            <div>
              <p>{item.summary}</p>
              {item.cause && (
                <p>
                  <strong>{t('diagnostics.possibleCause', { cause: '' }).replace(/\s*$/, '')}</strong>
                  {item.cause}
                </p>
              )}
              {item.solution && (
                <p>
                  <strong>{t('diagnostics.suggestion', { solution: '' }).replace(/\s*$/, '')}</strong>
                  {item.solution}
                </p>
              )}
              {item.technicalDetail && (
                <pre>
                  <code>{item.technicalDetail}</code>
                </pre>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
