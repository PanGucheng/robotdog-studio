export type EditionId = 'fun-line-following' | 'mcu-foundations' | 'ti-mspm0-foundations'
export type McuPlatformId = 'wch-ch32v203' | 'ti-mspm0'

export interface AppEditionProfile {
  id: EditionId
  productName: string
  shortName: string
  subtitle: string
  audience: string
  appId: string
  executableName: string
  artifactSlug: string
  userDataDirectoryName: string
  templateId: 'ch32v203-robotdog' | 'ch32v203-mcu-foundations' | 'ti-mspm0g3507-foundations'
  policyProfile: 'student-v1' | 'mcu-foundations-v1' | 'ti-mspm0-foundations-v1'
  platform: McuPlatformId
}

export const DEFAULT_EDITION_ID: EditionId = 'fun-line-following'

export const EDITION_PROFILES: Readonly<Record<EditionId, AppEditionProfile>> = Object.freeze({
  'fun-line-following': Object.freeze({
    id: 'fun-line-following',
    productName: 'RobotDog Studio 趣味巡线版',
    shortName: '趣味巡线版',
    subtitle: '巡线教学工作台',
    audience: '中小学生和零基础学习者',
    appId: 'cn.robotdog.studio.fun',
    executableName: 'RobotDogStudio-Fun',
    artifactSlug: 'RobotDog-Studio-Fun',
    userDataDirectoryName: 'RobotDogStudio-Fun',
    templateId: 'ch32v203-robotdog',
    policyProfile: 'student-v1',
    platform: 'wch-ch32v203'
  }),
  'mcu-foundations': Object.freeze({
    id: 'mcu-foundations',
    productName: 'RobotDog Studio 单片机入门版',
    shortName: '单片机入门版',
    subtitle: 'CH32V203 单片机学习工作台',
    audience: '电子类专业大学低年级学生',
    appId: 'cn.robotdog.studio.mcu',
    executableName: 'RobotDogStudio-MCU',
    artifactSlug: 'RobotDog-Studio-MCU',
    userDataDirectoryName: 'RobotDogStudio-MCU',
    templateId: 'ch32v203-mcu-foundations',
    policyProfile: 'mcu-foundations-v1',
    platform: 'wch-ch32v203'
  }),
  'ti-mspm0-foundations': Object.freeze({
    id: 'ti-mspm0-foundations',
    productName: 'RobotDog Studio TI MSPM0 教学版',
    shortName: 'TI MSPM0 教学版',
    subtitle: 'MSPM0G3507 · SysConfig 单片机学习工作台',
    audience: '单片机零基础或刚入门的大学生',
    appId: 'cn.robotdog.studio.ti.mspm0',
    executableName: 'RobotDogStudio-TI-MSPM0',
    artifactSlug: 'RobotDog-Studio-TI-MSPM0',
    userDataDirectoryName: 'RobotDogStudio-TI-MSPM0',
    templateId: 'ti-mspm0g3507-foundations',
    policyProfile: 'ti-mspm0-foundations-v1',
    platform: 'ti-mspm0'
  })
})

export function parseEditionId(value: unknown): EditionId {
  if (value === 'fun-line-following' || value === 'mcu-foundations' || value === 'ti-mspm0-foundations') return value
  throw new Error('ROBOTDOG_EDITION_INVALID')
}

export function isMcuEdition(id: EditionId): boolean {
  return id === 'mcu-foundations' || id === 'ti-mspm0-foundations'
}

export function getEditionProfile(id: EditionId): AppEditionProfile {
  return EDITION_PROFILES[id]
}
