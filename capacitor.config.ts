import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = { appId: 'app.pockettavern.mobile', appName: 'Pocket Tavern', webDir: 'dist', android: { adjustMarginsForEdgeToEdge: 'auto', loggingBehavior: 'none' }, plugins: { Keyboard: { resize: 'native', resizeOnFullScreen: true }, StatusBar: { style: 'DEFAULT', overlaysWebView: false } } }
export default config
