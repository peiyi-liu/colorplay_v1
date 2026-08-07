export type DeploymentEnvironment = 'local' | 'staging' | 'production';

const deploymentEnvironments: readonly DeploymentEnvironment[] = [
  'local',
  'staging',
  'production',
];

function parseDeploymentEnvironment(value: string): DeploymentEnvironment {
  if (deploymentEnvironments.includes(value as DeploymentEnvironment)) {
    return value as DeploymentEnvironment;
  }
  throw new Error('COLORPLAY_DEPLOYMENT_ENVIRONMENT_INVALID');
}

export const deploymentEnvironment = parseDeploymentEnvironment(
  typeof __COLORPLAY_DEPLOYMENT_ENVIRONMENT__ === 'undefined'
    ? 'local'
    : __COLORPLAY_DEPLOYMENT_ENVIRONMENT__,
);

export function shouldShowEnvironmentMarker(
  value: DeploymentEnvironment,
): boolean {
  return value === 'staging';
}
