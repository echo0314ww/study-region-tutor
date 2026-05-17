import { randomUUID } from 'node:crypto';
import type { FollowUpContext } from './openaiClient';
import type { InputMode, QuestionSessionTurn, TutorSettings } from '../shared/types';

interface StoredQuestionSession {
  id: string;
  createdAt: number;
  settings: TutorSettings;
  sourceMode: InputMode;
  problemContext: string;
  turns: QuestionSessionTurn[];
  lastResponseId?: string;
}

interface CreateQuestionSessionInput {
  settings: TutorSettings;
  sourceMode: InputMode;
  problemContext: string;
  firstUserContent: string;
  firstAssistantContent: string;
  responseId?: string;
}

const MAX_SESSIONS = 12;
const MAX_TURNS = 200;
const sessions = new Map<string, StoredQuestionSession>();

function pruneSessions(): void {
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((first, second) => first.createdAt - second.createdAt)[0];

    if (!oldest) {
      return;
    }

    sessions.delete(oldest.id);
  }
}

export function createQuestionSession(input: CreateQuestionSessionInput): StoredQuestionSession {
  const session: StoredQuestionSession = {
    id: randomUUID(),
    createdAt: Date.now(),
    settings: { ...input.settings, apiKey: '', proxyToken: '' },
    sourceMode: input.sourceMode,
    problemContext: input.problemContext,
    turns: [
      {
        role: 'user',
        content: input.firstUserContent
      },
      {
        role: 'assistant',
        content: input.firstAssistantContent
      }
    ],
    ...(input.responseId ? { lastResponseId: input.responseId } : {})
  };

  sessions.set(session.id, session);
  pruneSessions();

  return session;
}

export function getQuestionSession(sessionId: string): StoredQuestionSession {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error('当前题目会话不存在或已结束，请重新截图开始下一题。');
  }

  return session;
}

export function appendQuestionSessionTurn(sessionId: string, turn: QuestionSessionTurn): void {
  const session = getQuestionSession(sessionId);

  if (session.turns.length >= MAX_TURNS) {
    throw new Error(`单次对话轮数已达上限 (${MAX_TURNS})，请结束当前题目重新开始。`);
  }

  session.turns.push(turn);
}

export function updateQuestionSessionResponseId(sessionId: string, responseId: string | undefined): void {
  if (!responseId) {
    return;
  }

  getQuestionSession(sessionId).lastResponseId = responseId;
}

export function endQuestionSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function toFollowUpContext(sessionId: string): FollowUpContext {
  const session = getQuestionSession(sessionId);

  return {
    problemContext: session.problemContext,
    turns: [...session.turns],
    previousResponseId: session.lastResponseId
  };
}
