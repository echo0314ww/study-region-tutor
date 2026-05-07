/// <reference types="vite/client" />

import type { StudyTutorApi } from '../../preload';

declare global {
  interface Window {
    studyTutor: StudyTutorApi;
  }
}
