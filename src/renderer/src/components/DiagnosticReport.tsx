import { AlertTriangle, CheckCircle2, Clipboard, Info, XCircle } from 'lucide-react';
import type { DiagnosticResult, DiagnosticStatus } from '../../../shared/types';

export function diagnosticReportText(result: DiagnosticResult): string {
  const lines = [
    `Study Region Tutor 诊断报告`,
    `生成时间：${result.generatedAt}`,
    `应用版本：${result.appVersion || '未知'}`,
    `连接模式：${result.mode === 'proxy' ? '代理服务' : '本地直连'}`,
    `整体结果：${result.ok ? '通过' : '存在需要处理的问题'}`,
    ''
  ];

  for (const item of result.steps) {
    lines.push(`【${item.status.toUpperCase()}】${item.title}`);
    lines.push(`结果：${item.summary}`);

    if (item.cause) {
      lines.push(`可能原因：${item.cause}`);
    }

    if (item.solution) {
      lines.push(`处理建议：${item.solution}`);
    }

    if (item.technicalDetail) {
      lines.push(`技术细节：${item.technicalDetail}`);
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
  return (
    <div className={`diagnostic-report ${result.ok ? '' : 'has-failures'}`}>
      <div className="diagnostic-summary">
        <div>
          <Info size={17} />
          <strong>{result.ok ? '诊断通过' : '诊断发现问题'}</strong>
        </div>
        <button className="secondary-button" type="button" onClick={() => onCopy(diagnosticReportText(result))}>
          <Clipboard size={16} />
          复制诊断报告
        </button>
      </div>
      <div className="diagnostic-steps">
        {result.steps.map((item) => (
          <details key={item.id} className={`diagnostic-step ${item.status}`} open={item.status !== 'pass'}>
            <summary>
              {statusIcon(item.status)}
              <span>{item.title}</span>
              <em>{item.status === 'pass' ? '通过' : item.status === 'warn' ? '提醒' : '失败'}</em>
            </summary>
            <div>
              <p>{item.summary}</p>
              {item.cause && (
                <p>
                  <strong>可能原因：</strong>
                  {item.cause}
                </p>
              )}
              {item.solution && (
                <p>
                  <strong>处理建议：</strong>
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
