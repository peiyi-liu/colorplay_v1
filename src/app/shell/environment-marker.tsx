import {
  deploymentEnvironment,
  shouldShowEnvironmentMarker,
  type DeploymentEnvironment,
} from '../../lib/config/deployment-environment';

export type EnvironmentMarkerProps = Readonly<{
  environment?: DeploymentEnvironment;
}>;

export function EnvironmentMarker({
  environment = deploymentEnvironment,
}: EnvironmentMarkerProps) {
  if (!shouldShowEnvironmentMarker(environment)) return null;

  return (
    <div
      aria-label="STAGING 測試環境"
      className="environment-marker"
      role="status"
    >
      STAGING 測試環境
    </div>
  );
}
