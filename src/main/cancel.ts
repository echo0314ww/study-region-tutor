export class OperationCanceledError extends Error {
  constructor(message = '已停止当前识别/回答。') {
    super(message);
    this.name = 'OperationCanceledError';
  }
}

export function isOperationCanceled(error: unknown): boolean {
  return (
    error instanceof OperationCanceledError ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'OperationCanceledError'))
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new OperationCanceledError();
  }
}

export function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    const onAbort = (): void => {
      clearTimeout(timeout);
      cleanup();
      reject(new OperationCanceledError());
    };

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function abortPromise<T = never>(signal?: AbortSignal): Promise<T> {
  return new Promise((_resolve, reject) => {
    if (!signal) {
      return;
    }

    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(new OperationCanceledError());
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
