import { existsSync } from 'node:fs';
import type { DiagnosticResult, DiagnosticStep, RunDiagnosticsRequest, TutorSettings } from '../shared/types';
import {
  explainRecognizedTextWithMetadata,
  getRuntimeApiDefaults,
  listApiProviders,
  listAvailableModels
} from './openaiClient';
import { checkProxyHealth } from './announcementClient';
import {
  proxyExplainRecognizedTextWithMetadata,
  proxyListApiProviders,
  proxyListAvailableModels
} from './proxyClient';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function step(step: DiagnosticStep): DiagnosticStep {
  return step;
}

function isProxyMode(settings: TutorSettings): boolean {
  return settings.apiConnectionMode === 'proxy';
}

function selectedModelStep(settings: TutorSettings): DiagnosticStep {
  if (settings.model.trim()) {
    return step({
      id: 'selected-model',
      title: '模型选择',
      status: 'pass',
      summary: `当前已选择模型：${settings.model.trim()}。`
    });
  }

  return step({
    id: 'selected-model',
    title: '模型选择',
    status: 'fail',
    summary: '当前还没有选择模型。',
    cause: '未选择模型时，截图讲解、OCR 文本讲解和追问都无法发起。',
    solution: '打开设置，先刷新模型列表，再从“模型”下拉框选择一个模型；如果服务商不返回模型列表，可选择“手动填写模型名”。'
  });
}

async function diagnoseDirect(settings: TutorSettings, localEnvPath: string, deepCheck: boolean): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];
  const defaults = getRuntimeApiDefaults();
  const localEnvExists = existsSync(localEnvPath);

  steps.push(
    step({
      id: 'direct-config-file',
      title: '本地直连配置文件',
      status: localEnvExists || process.env.AI_BASE_URL || defaults.providers.length > 0 ? 'pass' : 'warn',
      summary: localEnvExists
        ? `已找到用户配置文件：${localEnvPath}`
        : '没有找到用户配置文件；如果你使用环境变量或开发目录配置，可以忽略这个提醒。',
      cause: localEnvExists ? undefined : '打包后的应用默认从用户配置目录读取第三方 API 配置。',
      solution: localEnvExists
        ? undefined
        : `如需本地直连，请创建 ${localEnvPath}，至少写入 AI_BASE_URL 和 AI_API_KEY，然后重启应用。`
    })
  );

  const providers = listApiProviders();
  const selectedProvider = settings.providerId
    ? providers.find((provider) => provider.id === settings.providerId)
    : providers.find((provider) => provider.isDefault) || providers[0];

  if (providers.length > 0) {
    steps.push(
      step({
        id: 'direct-provider',
        title: '本地 API 服务商',
        status: selectedProvider?.hasApiKey ? 'pass' : 'fail',
        summary: selectedProvider
          ? `当前服务商：${selectedProvider.name}，Base URL：${selectedProvider.baseUrl}`
          : `已读取 ${providers.length} 个服务商，但当前选择无效。`,
        cause: selectedProvider?.hasApiKey ? undefined : '服务商没有配置 API Key，或当前选择的服务商不存在。',
        solution: selectedProvider?.hasApiKey
          ? undefined
          : '检查 .env.local 中 AI_PROVIDER_*_API_KEY 或 AI_API_KEY 是否已填写；如果刚修改过配置，请重启应用。'
      })
    );
  } else {
    steps.push(
      step({
        id: 'direct-provider',
        title: '本地 API 服务商',
        status: 'fail',
        summary: '没有读取到可用的本地 API 服务商。',
        cause: '本地直连至少需要 AI_BASE_URL 和 AI_API_KEY，或者一组 AI_PROVIDER_* 配置。',
        solution: `请在 ${localEnvPath} 中补齐第三方 API 配置；普通用户也可以切换为“代理服务”模式。`
      })
    );
  }

  try {
    const models = await listAvailableModels(settings);
    steps.push(
      step({
        id: 'direct-models',
        title: '模型列表',
        status: models.models.length > 0 ? 'pass' : 'warn',
        summary:
          models.models.length > 0
            ? `模型列表可用，共返回 ${models.models.length} 个模型。`
            : '模型列表请求成功，但服务商没有返回可选模型。',
        cause: models.models.length > 0 ? undefined : '部分 OpenAI-compatible 服务商不完整支持 /models。',
        solution: models.models.length > 0 ? undefined : '可以在模型下拉框选择“手动填写模型名”，填入服务商文档提供的模型 ID。'
      })
    );
  } catch (error) {
    steps.push(
      step({
        id: 'direct-models',
        title: '模型列表',
        status: 'fail',
        summary: '模型列表请求失败。',
        cause: '常见原因包括 Base URL 写错、缺少 /v1、API Key 失效、服务商不支持 /models，或接口模式配置不匹配。',
        solution:
          '先确认 .env.local 中的 Base URL 是否和服务商文档一致，再检查 API Key 是否有效；如果 /models 不可用，可手动填写模型名后继续使用。',
        technicalDetail: errorText(error)
      })
    );
  }

  steps.push(selectedModelStep(settings));

  if (deepCheck && settings.model.trim()) {
    try {
      await explainRecognizedTextWithMetadata('诊断连通性测试：请用一句话回复“诊断完成”。', settings);
      steps.push(
        step({
          id: 'direct-deep-check',
          title: '文本接口深度测试',
          status: 'pass',
          summary: '第三方文本讲解接口可以返回内容。'
        })
      );
    } catch (error) {
      steps.push(
        step({
          id: 'direct-deep-check',
          title: '文本接口深度测试',
          status: 'fail',
          summary: '文本讲解接口请求失败。',
          cause: '模型名、接口模式、reasoning 参数或服务商稳定性可能存在问题。',
          solution: '先关闭 reasoning 程度或切换接口模式重试；如果仍失败，请复制技术细节给开发者排查。',
          technicalDetail: errorText(error)
        })
      );
    }
  }

  return steps;
}

async function diagnoseProxy(settings: TutorSettings, deepCheck: boolean): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];

  const health = await checkProxyHealth(settings.proxyUrl);
  steps.push(
    step({
      id: 'proxy-health',
      title: '代理服务地址',
      status: health.ok ? 'pass' : 'fail',
      summary: health.ok ? `代理服务连接成功：${health.sourceUrl}` : '代理服务连接失败。',
      cause: health.ok ? undefined : '代理地址可能填写错误、代理服务未启动、ngrok 隧道失效，或被防火墙拦截。',
      solution: health.ok
        ? undefined
        : '先确认代理电脑正在运行 npm run proxy:dev；公网访问还需要 npm run ngrok:dev，并把最新 HTTPS 地址填入高级设置。',
      technicalDetail: health.ok
        ? `providerCount=${health.providerCount ?? 'unknown'}, tokenCount=${health.tokenCount ?? 'unknown'}, rateLimitEnabled=${String(
            health.rateLimitEnabled ?? false
          )}`
        : health.message
    })
  );

  try {
    const providers = await proxyListApiProviders(settings);
    const selectedProvider = settings.providerId
      ? providers.find((provider) => provider.id === settings.providerId)
      : providers.find((provider) => provider.isDefault) || providers[0];

    steps.push(
      step({
        id: 'proxy-token-providers',
        title: '代理 Token 与服务商',
        status: providers.length > 0 ? 'pass' : 'fail',
        summary:
          providers.length > 0
            ? `代理 Token 可用，代理端返回 ${providers.length} 个 API 服务商。`
            : '代理 Token 验证通过，但代理端没有返回服务商。',
        cause: providers.length > 0 ? undefined : '代理服务端没有配置 AI_PROVIDERS 或 AI_BASE_URL。',
        solution: providers.length > 0 ? undefined : '请让代理服务维护者检查代理电脑上的 .env.local API 配置。'
      })
    );

    if (selectedProvider) {
      steps.push(
        step({
          id: 'proxy-selected-provider',
          title: '当前代理服务商',
          status: selectedProvider.hasApiKey ? 'pass' : 'fail',
          summary: `当前服务商：${selectedProvider.name}，接口模式：${selectedProvider.apiMode}`,
          cause: selectedProvider.hasApiKey ? undefined : '代理端该服务商没有配置 API Key。',
          solution: selectedProvider.hasApiKey
            ? undefined
            : '请让代理服务维护者检查对应 AI_PROVIDER_*_API_KEY 或 AI_API_KEY。'
        })
      );
    }
  } catch (error) {
    steps.push(
      step({
        id: 'proxy-token-providers',
        title: '代理 Token 与服务商',
        status: 'fail',
        summary: '代理服务商列表获取失败。',
        cause: '常见原因是 Token 填错、旧 Token 已失效、代理服务端更换了 Token，或代理服务不可达。',
        solution: '重新填写最新的 TUTOR_PROXY_TOKEN，再点击“刷新代理服务商”；如果仍失败，请联系代理服务维护者。',
        technicalDetail: errorText(error)
      })
    );
  }

  try {
    if (settings.providerId.trim()) {
      const models = await proxyListAvailableModels(settings);
      steps.push(
        step({
          id: 'proxy-models',
          title: '代理模型列表',
          status: models.models.length > 0 ? 'pass' : 'warn',
          summary:
            models.models.length > 0
              ? `代理模型列表可用，共返回 ${models.models.length} 个模型。`
              : '代理模型列表请求成功，但没有返回可选模型。',
          cause: models.models.length > 0 ? undefined : '当前服务商可能不完整支持 /models。',
          solution: models.models.length > 0 ? undefined : '可以选择“手动填写模型名”，填入代理服务商支持的模型 ID。'
        })
      );
    } else {
      steps.push(
        step({
          id: 'proxy-models',
          title: '代理模型列表',
          status: 'warn',
          summary: '还没有选择代理 API 服务商，因此暂未检查模型列表。',
          solution: '点击“刷新代理服务商”，选择服务商后再刷新模型列表。'
        })
      );
    }
  } catch (error) {
    steps.push(
      step({
        id: 'proxy-models',
        title: '代理模型列表',
        status: 'fail',
        summary: '代理模型列表请求失败。',
        cause: 'Token、服务商配置、Base URL 或 /models 兼容性可能存在问题。',
        solution: '先刷新代理服务商并确认已选择服务商；如果仍失败，可以手动填写模型名或联系代理服务维护者。',
        technicalDetail: errorText(error)
      })
    );
  }

  steps.push(selectedModelStep(settings));

  if (deepCheck && settings.model.trim()) {
    try {
      await proxyExplainRecognizedTextWithMetadata('诊断连通性测试：请用一句话回复“诊断完成”。', settings);
      steps.push(
        step({
          id: 'proxy-deep-check',
          title: '代理文本接口深度测试',
          status: 'pass',
          summary: '代理文本讲解接口可以返回内容。'
        })
      );
    } catch (error) {
      steps.push(
        step({
          id: 'proxy-deep-check',
          title: '代理文本接口深度测试',
          status: 'fail',
          summary: '代理文本讲解接口请求失败。',
          cause: '模型名、代理端服务商配置、限流或上游服务稳定性可能存在问题。',
          solution: '稍后重试；如果连续失败，请复制技术细节给代理服务维护者排查。',
          technicalDetail: errorText(error)
        })
      );
    }
  }

  return steps;
}

export async function runDiagnostics(
  request: RunDiagnosticsRequest,
  localEnvPath: string
): Promise<DiagnosticResult> {
  const settings = request.settings;
  const steps = isProxyMode(settings)
    ? await diagnoseProxy(settings, Boolean(request.deepCheck))
    : await diagnoseDirect(settings, localEnvPath, Boolean(request.deepCheck));

  return {
    ok: steps.every((item) => item.status !== 'fail'),
    mode: settings.apiConnectionMode,
    generatedAt: new Date().toISOString(),
    appVersion: request.appVersion,
    steps
  };
}
