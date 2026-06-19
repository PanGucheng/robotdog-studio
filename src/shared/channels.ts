export const IPC_CHANNELS = {
  healthGet: 'app:health:get',
  robotStatusGet: 'robot:status:get',
  robotConnectDemo: 'robot:connect-demo',
  robotDisconnect: 'robot:disconnect',
  robotActionRun: 'robot:action:run',
  robotCcdCapture: 'robot:ccd:capture',
  firmwareToolchainStatus: 'firmware:toolchain:status',
  firmwareBuildStart: 'firmware:build:start',
  firmwareBuildCancel: 'firmware:build:cancel',
  firmwareBuildEvent: 'firmware:build:event',
  robotStatusEvent: 'robot:status',
  robotLogEvent: 'robot:log',
  robotCcdEvent: 'robot:ccd'
} as const
