import * as fs from 'node:fs';
import * as pathModule from 'node:path';
import { pathToFileURL } from 'node:url';
import type { UpdateInfo } from 'builder-util-runtime';
import {
  Provider,
  getFileList,
  parseUpdateInfo,
} from 'electron-updater/out/providers/Provider';
import type { ResolvedUpdateFileInfo } from 'electron-updater/out/types';

type ShareProviderRuntimeOptions = {
  platform: 'win32';
  isUseMultipleRangeRequest: boolean;
  executor: unknown;
};

/**
 * Reads latest.yml and installer files from a Windows network share via fs.
 */
export class ShareUpdateProvider extends Provider<UpdateInfo> {
  constructor(
    private readonly shareDir: string,
    runtimeOptions: ShareProviderRuntimeOptions,
  ) {
    // Provider ctor is protected — pass runtime options through
    super(runtimeOptions as never);
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const latestPath = pathModule.join(this.shareDir, 'latest.yml');
    if (!fs.existsSync(latestPath)) {
      throw new Error(`Cannot find latest.yml at: ${latestPath}`);
    }
    const raw = fs.readFileSync(latestPath, 'utf-8');
    const channelUrl = pathToFileURL(latestPath);
    return parseUpdateInfo(raw, 'latest.yml', channelUrl);
  }

  resolveFiles(updateInfo: UpdateInfo): ResolvedUpdateFileInfo[] {
    const files = getFileList(updateInfo);
    return files.map((fileInfo) => {
      const fileName = fileInfo.url.replace(/\\/g, '/').split('/').pop() || fileInfo.url;
      const absolutePath = pathModule.join(this.shareDir, fileName);
      console.log('[updater] Resolved installer path:', absolutePath);
      return {
        url: pathToFileURL(absolutePath),
        info: fileInfo,
      };
    });
  }
}
