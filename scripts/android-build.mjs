import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

export function getNpmLauncher(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function getGradleLauncher(platform = process.platform) {
  return platform === 'win32' ? 'gradlew.bat' : './gradlew'
}

export function getGradleInvocation(platform = process.platform, executable = true) {
  if (platform === 'win32') return { command: 'gradlew.bat', args: [] }
  return executable ? { command: './gradlew', args: [] } : { command: 'sh', args: ['./gradlew'] }
}

export function runCommand(command, args, cwd, platform = process.platform) {
  return new Promise((resolve, reject) => {
    const windows = platform === 'win32'
    const executable = windows ? (process.env.ComSpec || 'cmd.exe') : command
    const executableArgs = windows ? ['/d', '/s', '/c', [command, ...args].map(value => `"${String(value).replaceAll('"', '\\"')}"`).join(' ')] : args
    const child = spawn(executable, executableArgs, { cwd, stdio: 'inherit', shell: false })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} 退出码为 ${code ?? 1}`)))
  })
}

export async function buildAndroid({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), platform = process.platform } = {}) {
  const androidDir = path.join(root, 'android')
  await runCommand(getNpmLauncher(platform), ['run', 'android:sync'], root, platform)
  const wrapper = getGradleInvocation(platform, platform === 'win32' || (() => { try { fs.accessSync(path.join(androidDir, 'gradlew'), fs.constants.X_OK); return true } catch { return false } })())
  await runCommand(wrapper.command, [...wrapper.args, 'assembleDebug'], androidDir, platform)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  buildAndroid().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
