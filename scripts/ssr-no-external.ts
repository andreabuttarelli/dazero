export function ssrNoExternalForDeploy(deployTarget: string): (string | RegExp)[] {
  return deployTarget === 'node' ? [/^@dazero\//] : ['simple-icons'];
}
