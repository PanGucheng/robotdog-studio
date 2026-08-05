export type EditionId = 'fun-line-following' | 'mcu-foundations'

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
  templateId: 'ch32v203-robotdog' | 'ch32v203-mcu-foundations'
  policyProfile: 'student-v1' | 'mcu-foundations-v1'
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
    policyProfile: 'student-v1'
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
    policyProfile: 'mcu-foundations-v1'
  })
})

export function parseEditionId(value: unknown): EditionId {
  if (value === 'fun-line-following' || value === 'mcu-foundations') return value
  throw new Error('ROBOTDOG_EDITION_INVALID')
}

export function getEditionProfile(id: EditionId): AppEditionProfile {
  return EDITION_PROFILES[id]
}
