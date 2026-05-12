import { dialog, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportConversationRequest, ExportConversationResult } from '../shared/types';
import { buildConversationMarkdown } from '../shared/exportConversation';

function safeDateSegment(value: string): string {
  return value.replace(/[:/\\?*"<>|]/g, '-').replace(/\s+/g, '-');
}

export async function exportConversationMarkdown(
  owner: BrowserWindow | undefined,
  request: ExportConversationRequest
): Promise<ExportConversationResult> {
  const markdown = buildConversationMarkdown(request);
  const defaultPath = join(
    process.env.USERPROFILE || process.cwd(),
    `Study-Region-Tutor-${safeDateSegment(request.exportedAt)}.md`
  );
  const options = {
    title: '导出题目讲解',
    defaultPath,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  };
  const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await writeFile(result.filePath, markdown, 'utf8');

  return {
    canceled: false,
    filePath: result.filePath
  };
}
