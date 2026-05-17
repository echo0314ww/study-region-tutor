import { useCallback, useState } from 'react';
import type { DiagnosticResult, TutorSettings } from '../../../shared/types';
import { settingsWithEffectiveProxyUrl } from '../uiUtils';

export interface UseDiagnosticsReturn {
  diagnosticResult: DiagnosticResult | null;
  diagnosticError: string;
  isDiagnosticsRunning: boolean;
  runSettingsDiagnostics: (deepCheck?: boolean) => Promise<void>;
}

export function useDiagnostics(settings: TutorSettings, appVersion: string): UseDiagnosticsReturn {
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [isDiagnosticsRunning, setIsDiagnosticsRunning] = useState(false);

  const runSettingsDiagnostics = useCallback(
    async (deepCheck = false): Promise<void> => {
      setIsDiagnosticsRunning(true);
      setDiagnosticError('');
      setDiagnosticResult(null);

      try {
        const response = await window.studyTutor.runDiagnostics({
          settings: settingsWithEffectiveProxyUrl(settings),
          appVersion,
          deepCheck
        });
        setDiagnosticResult(response);
      } catch (caught) {
        setDiagnosticError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setIsDiagnosticsRunning(false);
      }
    },
    [appVersion, settings]
  );

  return {
    diagnosticResult,
    diagnosticError,
    isDiagnosticsRunning,
    runSettingsDiagnostics
  };
}
