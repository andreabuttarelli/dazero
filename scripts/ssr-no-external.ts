export function ssrNoExternalForDeploy(deployTarget: string): (string | RegExp)[] {
  return deployTarget === 'node' ? [/^@feega\//] : ['simple-icons'];
}
