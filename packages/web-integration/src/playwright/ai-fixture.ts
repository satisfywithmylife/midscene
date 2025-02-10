import { randomUUID } from 'node:crypto';
import { PageAgent } from '@/common/agent';
import { PlaywrightWebPage } from '@/playwright';
import type { AgentWaitForOpt } from '@midscene/core';
import { type TestInfo, type TestType, test } from '@playwright/test';
import type { Page as OriginPlaywrightPage } from 'playwright';
import type { PageTaskExecutor } from '../common/tasks';

export type APITestType = Pick<TestType<any, any>, 'step'>;

const groupAndCaseForTest = (testInfo: TestInfo) => {
  let taskFile: string;
  let taskTitle: string;
  const titlePath = [...testInfo.titlePath];

  if (titlePath.length > 1) {
    taskTitle = titlePath.pop() || 'unnamed';
    taskFile = `${titlePath.join(' > ')}`;
  } else if (titlePath.length === 1) {
    taskTitle = titlePath[0];
    taskFile = `${taskTitle}`;
  } else {
    taskTitle = 'unnamed';
    taskFile = 'unnamed';
  }
  return { taskFile, taskTitle };
};

const midsceneAgentKeyId = '_midsceneAgentId';
export const midsceneDumpAnnotationId = 'MIDSCENE_DUMP_ANNOTATION';
export const PlaywrightAiFixture = () => {
  const pageAgentMap: Record<string, PageAgent> = {};
  const agentForPage = (
    page: OriginPlaywrightPage,
    testInfo: TestInfo, // { testId: string; taskFile: string; taskTitle: string },
  ) => {
    let idForPage = (page as any)[midsceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midsceneAgentKeyId] = idForPage;
      const { testId } = testInfo;
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);

      pageAgentMap[idForPage] = new PageAgent(new PlaywrightWebPage(page), {
        testId: `playwright-${testId}-${idForPage}`,
        cacheId: `${taskFile}(${taskTitle})`,
        groupName: taskTitle,
        groupDescription: taskFile,
        generateReport: false, // we will generate it in the reporter
      });
    }
    return pageAgentMap[idForPage];
  };

  const updateDumpAnnotation = (test: TestInfo, dump: string) => {
    const currentAnnotation = test.annotations.find((item) => {
      return item.type === midsceneDumpAnnotationId;
    });
    if (currentAnnotation) {
      currentAnnotation.description = dump;
    } else {
      test.annotations.push({
        type: midsceneDumpAnnotationId,
        description: dump,
      });
    }
  };

  return {
    ai: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(
        async (taskPrompt: string, opts?: { type?: 'action' | 'query' }) => {
          return new Promise((resolve, reject) => {
            test.step(`ai - ${taskPrompt}`, async () => {
              await waitForNetworkIdle(page);
              const actionType = opts?.type || 'action';
              try {
                const result = await agent.ai(taskPrompt, actionType);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            });
          });
        },
      );
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiAction: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(async (taskPrompt: string) => {
        return new Promise((resolve, reject) => {
          test.step(`aiAction - ${taskPrompt}`, async () => {
            await waitForNetworkIdle(page);
            try {
              const result = await agent.aiAction(taskPrompt);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
        });
      });
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiQuery: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(async (demand: any) => {
        return new Promise((resolve, reject) => {
          test.step(`aiQuery - ${JSON.stringify(demand)}`, async () => {
            await waitForNetworkIdle(page);
            try {
              const result = await agent.aiQuery(demand);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
        });
      });
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiAssert: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(async (assertion: string, errorMsg?: string) => {
        return new Promise((resolve, reject) => {
          test.step(`aiAssert - ${assertion}`, async () => {
            await waitForNetworkIdle(page);
            try {
              await agent.aiAssert(assertion, errorMsg);
              resolve(null);
            } catch (error) {
              reject(error);
            }
          });
        });
      });
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiWaitFor: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(async (assertion: string, opt?: AgentWaitForOpt) => {
        return new Promise((resolve, reject) => {
          test.step(`aiWaitFor - ${assertion}`, async () => {
            await waitForNetworkIdle(page);
            try {
              await agent.aiWaitFor(assertion, opt);
              resolve(null);
            } catch (error) {
              reject(error);
            }
          });
        });
      });
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
  };
};

export type PlayWrightAiFixtureType = {
  ai: <T = any>(
    prompt: string,
    opts?: { type?: 'action' | 'query' },
  ) => Promise<T>;
  aiAction: (taskPrompt: string) => ReturnType<PageTaskExecutor['action']>;
  aiQuery: <T = any>(demand: any) => Promise<T>;
  aiAssert: (assertion: string, errorMsg?: string) => Promise<void>;
  aiWaitFor: (assertion: string, opt?: AgentWaitForOpt) => Promise<void>;
};

async function waitForNetworkIdle(page: OriginPlaywrightPage, timeout = 20000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (error: any) {
    console.warn(
      `Network idle timeout exceeded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
