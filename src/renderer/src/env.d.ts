/// <reference types="vite/client" />

import type { RobotDogApi } from '../../shared/types'

declare global {
  interface Window {
    robotDog?: RobotDogApi
  }
}

export {}
