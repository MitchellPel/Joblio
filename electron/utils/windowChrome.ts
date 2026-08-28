/** Native Windows caption buttons sit in the app top bar (Cursor-style). */

export const TITLEBAR_OVERLAY_HEIGHT = 36;

export type TitleBarTheme = 'light' | 'dark';

export function titleBarOverlayOptions(theme: TitleBarTheme, glass: boolean) {
  if (theme === 'dark') {
    return {
      color: '#1c1b18',
      symbolColor: '#ebe9e2',
      height: TITLEBAR_OVERLAY_HEIGHT,
    };
  }
  if (glass) {
    return {
      color: '#e2dfd8',
      symbolColor: '#26251e',
      height: TITLEBAR_OVERLAY_HEIGHT,
    };
  }
  return {
    color: '#f2f1ed',
    symbolColor: '#26251e',
    height: TITLEBAR_OVERLAY_HEIGHT,
  };
}
