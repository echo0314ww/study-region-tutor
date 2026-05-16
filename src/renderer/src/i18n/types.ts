export interface Messages {
  // App / general
  'app.close': string;
  'app.cancel': string;
  'app.confirm': string;
  'app.loading': string;
  'app.retry': string;
  'app.copy': string;
  'app.copied': string;
  'app.save': string;
  'app.delete': string;
  'app.clear': string;
  'app.export': string;
  'app.import': string;
  'app.back': string;
  'app.reset': string;

  // Toolbar
  'toolbar.capture': string;
  'toolbar.cancel': string;
  'toolbar.result': string;
  'toolbar.settings': string;
  'toolbar.announcements': string;
  'toolbar.finishQuestion': string;

  // Settings
  'settings.title': string;
  'settings.advanced': string;
  'settings.backToNormal': string;
  'settings.wizard': string;
  'settings.proxyAdmin': string;
  'settings.studyLibrary': string;
  'settings.providerGenerator': string;
  'settings.promptTemplates': string;
  'settings.modelEval': string;
  'settings.productGuide': string;
  'settings.releaseGuide': string;
  'settings.historyGuide': string;
  'settings.apiConnection': string;
  'settings.apiConnection.direct': string;
  'settings.apiConnection.proxy': string;
  'settings.apiConnection.directDesc': string;
  'settings.apiConnection.proxyDesc': string;
  'settings.apiProvider': string;
  'settings.apiProvider.refresh': string;
  'settings.apiProvider.refreshProxy': string;
  'settings.apiProvider.selectFirst': string;
  'settings.apiProvider.manual': string;
  'settings.apiProvider.manualAlt': string;
  'settings.apiMode': string;
  'settings.apiMode.env': string;
  'settings.apiMode.chatCompletions': string;
  'settings.apiMode.responses': string;
  'settings.model': string;
  'settings.model.select': string;
  'settings.model.custom': string;
  'settings.model.customPlaceholder': string;
  'settings.model.refresh': string;
  'settings.model.loading': string;
  'settings.model.loaded': string;
  'settings.model.notLoaded': string;
  'settings.reasoning': string;
  'settings.inputMode': string;
  'settings.inputMode.image': string;
  'settings.inputMode.ocr': string;
  'settings.inputMode.ocrDisabled': string;
  'settings.ocrLang': string;
  'settings.ocrLang.zh': string;
  'settings.ocrLang.en': string;
  'settings.ocrMathMode': string;
  'settings.ocrPreprocess': string;
  'settings.ocrPreprocess.auto': string;
  'settings.ocrPreprocess.none': string;
  'settings.ocrPreprocess.contrast': string;
  'settings.ocrPreprocess.binary': string;
  'settings.ocrPreprocess.multi': string;
  'settings.language': string;
  'settings.theme': string;
  'settings.theme.system': string;
  'settings.theme.light': string;
  'settings.theme.dark': string;
  'settings.reasoningOnly': string;

  // Update
  'update.title': string;
  'update.currentVersion': string;
  'update.latestVersion': string;
  'update.check': string;
  'update.download': string;
  'update.downloading': string;
  'update.install': string;

  // Diagnostics
  'diagnostics.title': string;
  'diagnostics.desc': string;
  'diagnostics.run': string;
  'diagnostics.running': string;
  'diagnostics.deep': string;

  // Shortcuts
  'shortcuts.title': string;
  'shortcuts.desc': string;
  'shortcuts.restore': string;
  'shortcuts.placeholder': string;
  'shortcut.startCapture': string;
  'shortcut.cancelCapture': string;
  'shortcut.confirmCapture': string;
  'shortcut.toggleResult': string;
  'shortcut.openSettings': string;
  'shortcut.openAnnouncements': string;
  'shortcut.finishQuestion': string;

  // Proxy
  'proxy.url': string;
  'proxy.urlPlaceholder': string;
  'proxy.token': string;
  'proxy.tokenPlaceholder': string;
  'proxy.tokenSaved': string;
  'proxy.tokenNeeded': string;
  'proxy.tokenCurrent': string;
  'proxy.validate': string;
  'proxy.validating': string;
  'proxy.restoreDefault': string;
  'proxy.defaultRestored': string;

  // Direct setup
  'directSetup.title': string;
  'directSetup.desc': string;
  'directSetup.createFile': string;
  'directSetup.minFields': string;
  'directSetup.afterSave': string;

  // Announcements
  'announcements.title': string;
  'announcements.empty': string;
  'announcements.noSource': string;

  // Result panel
  'result.empty': string;
  'result.error': string;

  // Follow-up
  'followUp.placeholder': string;
  'followUp.send': string;
  'followUp.stop': string;

  // OCR Preview
  'ocrPreview.title': string;
  'ocrPreview.confirm': string;
  'ocrPreview.rerun': string;

  // Study library
  'studyLibrary.title': string;
  'studyLibrary.empty': string;
  'studyLibrary.searchPlaceholder': string;
  'studyLibrary.showFavorites': string;
  'studyLibrary.clearAll': string;
  'studyLibrary.clearConfirmTitle': string;
  'studyLibrary.clearConfirmBody': string;
  'studyLibrary.clearConfirmAction': string;
  'studyLibrary.deleteConfirmTitle': string;
  'studyLibrary.deleteConfirmBody': string;
  'studyLibrary.deleteConfirmAction': string;
  'studyLibrary.count': string;
  'studyLibrary.exportMarkdown': string;
  'studyLibrary.exportAnki': string;
  'studyLibrary.exportObsidian': string;

  // Study item fields
  'studyItem.subject': string;
  'studyItem.difficulty': string;
  'studyItem.status': string;
  'studyItem.tags': string;
  'studyItem.mistakeReason': string;
  'studyItem.review': string;
  'studyItem.reviewEasy': string;
  'studyItem.reviewGood': string;
  'studyItem.reviewHard': string;
  'studyItem.reviewWrong': string;

  // Subjects
  'subject.general': string;
  'subject.math': string;
  'subject.english': string;
  'subject.physics': string;
  'subject.programming': string;

  // Difficulties
  'difficulty.easy': string;
  'difficulty.normal': string;
  'difficulty.hard': string;

  // Statuses
  'status.new': string;
  'status.reviewing': string;
  'status.mastered': string;

  // Guide
  'guide.productTitle': string;
  'guide.releaseTitle': string;
  'guide.historyTitle': string;

  // Confirm dialog
  'confirm.quit.title': string;
  'confirm.quit.body': string;
  'confirm.quit.action': string;
}

export type MessageKey = keyof Messages;

export type TutorLocale = 'zh-CN' | 'en';
