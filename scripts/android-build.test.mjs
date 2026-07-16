import { describe, expect, it } from 'vitest'
import { getGradleInvocation, getGradleLauncher, getNpmLauncher } from './android-build.mjs'

describe('android build launcher selection', () => {
  it('uses Windows launchers on Windows', () => {
    expect(getNpmLauncher('win32')).toBe('npm.cmd')
    expect(getGradleLauncher('win32')).toBe('gradlew.bat')
  })

  it('uses POSIX launchers on macOS and Linux', () => {
    expect(getNpmLauncher('linux')).toBe('npm')
    expect(getGradleLauncher('linux')).toBe('./gradlew')
    expect(getGradleLauncher('darwin')).toBe('./gradlew')
    expect(getGradleInvocation('linux', false)).toEqual({ command: 'sh', args: ['./gradlew'] })
  })
})
