import { dialog, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExportConversationRequest,
  ExportConversationResult,
  ExportStudyLibraryRequest
} from '../shared/types';
import {
  buildConversationMarkdown,
  buildObsidianStudyItemMarkdown,
  buildStudyLibraryAnkiCsv,
  buildStudyLibraryMarkdown
} from '../shared/exportConversation';

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

function safeFilename(value: string): string {
  return (
    value
      .replace(/[:/\\?*"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'study-item'
  );
}

export async function exportStudyLibrary(
  owner: BrowserWindow | undefined,
  request: ExportStudyLibraryRequest
): Promise<ExportConversationResult> {
  if (request.format === 'obsidian') {
    const result = owner
      ? await dialog.showOpenDialog(owner, {
          title: '导出到 Obsidian 文件夹',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: '导出到 Obsidian 文件夹',
          properties: ['openDirectory', 'createDirectory']
        });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const targetDir = result.filePaths[0];

    await Promise.all(
      request.items.map((item, index) =>
        writeFile(
          join(targetDir, `${String(index + 1).padStart(2, '0')}-${safeFilename(item.title)}.md`),
          buildObsidianStudyItemMarkdown(item),
          'utf8'
        )
      )
    );

    return {
      canceled: false,
      filePath: targetDir
    };
  }

  const isCsv = request.format === 'anki-csv';
  const defaultPath = join(
    process.env.USERPROFILE || process.cwd(),
    `Study-Region-Tutor-Library-${safeDateSegment(request.exportedAt)}.${isCsv ? 'csv' : 'md'}`
  );
  const result = owner
    ? await dialog.showSaveDialog(owner, {
        title: isCsv ? '导出 Anki CSV' : '导出学习库 Markdown',
        defaultPath,
        filters: [{ name: isCsv ? 'CSV' : 'Markdown', extensions: [isCsv ? 'csv' : 'md'] }]
      })
    : await dialog.showSaveDialog({
        title: isCsv ? '导出 Anki CSV' : '导出学习库 Markdown',
        defaultPath,
        filters: [{ name: isCsv ? 'CSV' : 'Markdown', extensions: [isCsv ? 'csv' : 'md'] }]
      });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await writeFile(
    result.filePath,
    isCsv ? buildStudyLibraryAnkiCsv(request) : buildStudyLibraryMarkdown(request),
    'utf8'
  );

  return {
    canceled: false,
    filePath: result.filePath
  };
}
