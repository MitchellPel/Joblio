import type { IpcMain } from 'electron';
import { registerAuthIpc } from './authIpc';
import { registerUsersIpc } from './usersIpc';
import { registerJobsIpc } from './jobsIpc';
import { registerSettingsIpc } from './settingsIpc';
import { registerUpdaterIpc } from './updaterIpc';
import { registerCredentialsIpc } from './credentialsIpc';
import { registerRiggingIpc } from './riggingIpc';
import { registerMentionsIpc } from './mentionsIpc';
import { registerVehicleBookingsIpc } from './vehicleBookingsIpc';
import { registerOrdersIpc } from './ordersIpc';
import { registerQuoteSizesIpc } from './quoteSizesIpc';
import { registerAiIpc } from './aiIpc';
import { registerFeedbackIpc } from './feedbackIpc';

export function registerAllIpc(ipcMain: IpcMain): void {
  registerAuthIpc(ipcMain);
  registerUsersIpc(ipcMain);
  registerJobsIpc(ipcMain);
  registerSettingsIpc(ipcMain);
  registerUpdaterIpc(ipcMain);
  registerCredentialsIpc(ipcMain);
  registerRiggingIpc(ipcMain);
  registerMentionsIpc(ipcMain);
  registerVehicleBookingsIpc(ipcMain);
  registerOrdersIpc(ipcMain);
  registerQuoteSizesIpc(ipcMain);
  registerAiIpc(ipcMain);
  registerFeedbackIpc(ipcMain);
}
