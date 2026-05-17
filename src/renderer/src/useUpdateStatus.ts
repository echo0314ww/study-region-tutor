import { useEffect, useState } from 'react';
import type { UpdateStatusEvent } from '../../shared/types';

const INITIAL_UPDATE_STATUS: UpdateStatusEvent = {
  status: 'idle',
  message: ''
};

export function useUpdateStatus(): UpdateStatusEvent {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusEvent>(INITIAL_UPDATE_STATUS);

  useEffect(() => {
    void window.studyTutor
      .getUpdateStatus()
      .then((status) => {
        setUpdateStatus((current) => (current.status === 'idle' ? status : current));
      })
      .catch(() => undefined);

    return window.studyTutor.onUpdateStatus(setUpdateStatus);
  }, []);

  return updateStatus;
}
