/// <reference types="vite/client" />

import type { RobotDogApi } from '../../shared/types'

declare global {
  interface Window {
    robotDog?: RobotDogApi
    studioWindowChrome?: { customTitleBar: boolean; height: number; initialTheme: import('../../shared/studio-theme').StudioThemeMode; setTheme(mode: import('../../shared/studio-theme').StudioThemeMode): Promise<void> }
  }
}

export {}
