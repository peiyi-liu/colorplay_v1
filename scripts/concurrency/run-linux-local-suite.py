"""One fresh Local functional run and fifteen fail-stop capacity legs on Linux."""
import json
import os
from pathlib import Path
import platform
import re
import sys
import time
import linux_suite_support as S


def attach_controls(snapshot, summary):
    target = snapshot / 'root-control'
    target.mkdir(mode=0o700)
    controls = target / 'requests'
    controls.mkdir(mode=0o700)
    for source in sorted((S.PARENT / 'requests').iterdir()):
        S.write(controls / source.name, S.private(source))
    for name in ['toolchain.json', 'installation-receipt.json']:
        S.write(target / name, S.private(S.TOOLS / name))
    S.write(target / 'suite-summary.json', summary)


def main():
    S.require(sys.platform == 'linux' and platform.machine() in ('x86_64', 'amd64'))
    S.require(len(sys.argv) == 2 and bool(re.fullmatch('[a-f0-9]{40}', sys.argv[1])))
    revision = sys.argv[1]
    S.require(os.environ.get('GITHUB_SHA') == revision and os.environ.get('GITHUB_REPOSITORY') == 'peiyi-liu/colorplay_v1' and os.environ.get('GITHUB_JOB') == 'capacity-linux' and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    S.require(os.environ.get('GITHUB_REF') == 'refs/heads/codex/local-capacity-linux-20261116')
    os.umask(0o077)
    started = time.monotonic()
    phase, snapshot_plan, snapshot_approval = 'toolchain', None, None
    summary = {'sourceRevision': revision, 'functional': 'NOT_RUN', 'passedLegs': 0, 'plannedLegs': 15, 'remainingLegs': 'NOT_RUN', 'capacityVerdict': 'NOT_VERIFIED', 'retention': 'UNVERIFIED', 'hostedAuthority': 'NONE', 'productionOperations': 0, 'automaticRetry': False}
    success = False
    encryption_attempted = False
    python = ['/usr/bin/python3', '-B']
    try:
        print(json.dumps({'stage': phase, 'capacityVerdict': 'NOT_RUN', 'hostedAuthority': 'NONE'}), flush=True)
        code, setup_raw = S.module('linux-local-bootstrap').bounded([*python, str(S.SOURCE / 'scripts/concurrency/prepare-linux-runner.py'), revision], S.SOURCE, timeout=1800, env=S.ENV, checked=False)
        if S.TOOLS.exists():
            S.write(S.TOOLS / 'setup-stdout.jsonl', setup_raw)
        setup = json.loads(setup_raw.splitlines()[-1])
        if code != 0:
            summary['toolchainResult'] = {key: setup.get(key) for key in ['result', 'stage', 'failureClass', 'safeReason', 'httpStatus']}
        S.require(code == 0 and setup.get('result') == 'PINNED_LOCAL_TOOLCHAIN_INSTALLED', 'LOCAL_TOOLCHAIN_SETUP_FAILED')
        path, approved, request = S.create_bootstrap_request(revision)
        phase = 'bootstrap'
        S.stage(phase, [*python, str(S.SOURCE / 'scripts/concurrency/linux-local-bootstrap.py'), '--request', str(path), '--approve', approved], 'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE', timeout=1500)
        S.write(S.RUNTIME / 'bootstrap-input.json', S.private(path))
        S.install_psql_adapter()
        phase = 'profile-pin'
        pin = S.stage(phase, [*python, str(S.RUNTIME / 'pin-execution-profile.py'), revision, approved], 'LOCAL_PROFILE_PINNED_PENDING_CALIBRATION', timeout=180)
        phase = 'kernel-calibration'
        S.stage(phase, [*python, str(S.RUNTIME / 'calibrate-linux-runtime.py'), revision, pin['pinReceiptSha256']], 'ROOT_LINUX_KERNEL_CALIBRATION_VERIFIED', timeout=1650)
        phase = 'build-and-preview'
        S.stage(phase, [*python, str(S.RUNTIME / 'activate-candidate.py'), revision], 'LOCAL_ARTIFACT_READY', timeout=240)
        phase = 'entry-bundle'
        S.stage(phase, [*python, str(S.RUNTIME / 'measure-entry-bundle.py'), revision], timeout=60)
        phase = 'edge-source-bind'
        S.stage(phase, [*python, str(S.RUNTIME / 'bind-edge-source.py'), revision, 'all-functions'], 'LOCAL_EDGE_SOURCE_BOUND', timeout=120)
        # Independently retain this raw approval in Root memory before admitting
        # application fixtures. The actor never chooses its shutdown scope.
        snapshot_plan, snapshot_approval = S.create_snapshot_plan(revision, approved)
        phase = 'functional-prepare'
        prepared = S.stage(phase, [*python, str(S.RUNTIME / 'prepare-functional-request-observed.py'), revision], 'LOCAL_FUNCTIONAL_REQUEST_PREPARED', timeout=180)
        phase = 'functional-run'
        S.stage(phase, [*python, str(S.RUNTIME / 'run-functional-owned.py'), revision, prepared['runId'], prepared['approvalSha256']], 'PASS', timeout=1650)
        summary['functional'] = 'PASS'
        summary['functionalRunId'] = prepared['runId']
        node = str(S.TOOLS / 'node')
        phase = 'capacity-plan'
        plan = S.stage(phase, [node, '--import', 'tsx', str(S.RUNTIME / 'prepare-capacity-plan.mjs'), revision, prepared['runId']], 'LOCAL_CAPACITY_PLAN_PREPARED', timeout=180)
        S.require(plan['plannedLegs'] == 15)
        summary['planId'] = plan['planId']
        for index in range(15):
            # Stop admitting work before the five-hour reserve. Job timeout is
            # 330 minutes; each leg owns a 25-minute bound and snapshot gets 30.
            S.require(time.monotonic() - started < 240 * 60, 'LOCAL_SUITE_DEADLINE_BEFORE_NEXT_LEG')
            phase = 'capacity-prepare-' + str(index)
            leg = S.stage(phase, [node, '--import', 'tsx', str(S.RUNTIME / 'prepare-capacity-leg.mjs'), plan['planId'], str(index)], 'LOCAL_CAPACITY_LEG_PREPARED', timeout=180)
            phase = 'capacity-run-' + str(index)
            S.stage(phase, [*python, str(S.RUNTIME / 'run-capacity-owned.py'), revision, leg['runId'], leg['approvalSha256']], 'PASS', timeout=1650)
            summary['passedLegs'] += 1
        summary['remainingLegs'] = 0
        summary['capacityVerdict'] = 'ALL_15_LEGS_PASS_PENDING_ROOT_DOWNLOAD_REVIEW'
        success = True
    except Exception as error:
        if isinstance(error, S.StageRejected) and error.bootstrapOutcome is not None:
            summary['bootstrapOutcome'] = error.bootstrapOutcome
        summary['failedStage'] = phase
        summary['failureClass'] = type(error).__name__
        reason = str(error)
        summary['safeReason'] = reason if re.fullmatch('[A-Z_]{3,100}', reason) else 'LOCAL_SUITE_IO_UNAVAILABLE'
        summary['capacityVerdict'] = 'NOT_VERIFIED'
        summary['remainingLegs'] = 15 - summary['passedLegs']
    finally:
        summary['elapsedSecondsBeforeSnapshot'] = round(time.monotonic() - started, 3)
        if snapshot_plan is not None:
            try:
                # All business/observer subprocesses have returned; no log file
                # remains open under Runtime. Snapshot itself checks kernel FDs.
                S.write(S.PARENT / 'requests/suite-before-snapshot.json', summary)
                snapshot = S.stage('consistent-snapshot', [*python, str(S.SOURCE / 'scripts/concurrency/snapshot-local-evidence.py'), '--plan', str(snapshot_plan), '--approve', snapshot_approval], 'LOCAL_SNAPSHOT_CREATED', timeout=1800)
                root = Path(snapshot['snapshotDirectory'])
                S.require(root.parent == S.PARENT / 'snapshots' and root.name == request['instanceNonce'])
                S.require(S.digest(S.private(root / 'snapshot-manifest.json')) == snapshot['snapshotManifestSha256'])
                attach_controls(root, summary)
                profile = S.load(S.RUNTIME / 'execution-profile.json')
                encryption_attempted = True
                encrypted = S.export_snapshot(root, revision, pin['executionProfileSha256'], profile['identity']['jobSha256'])
                summary['archive'] = {key: encrypted[key] for key in ['cipherSha256', 'cipherBytes', 'fileCount', 'plaintextBytes']}
                summary['snapshot'] = 'CREATED_ENCRYPTED_PENDING_ROOT_DOWNLOAD'
            except Exception as error:
                success = False
                summary['snapshot'] = 'UNVERIFIED'
                summary['snapshotFailureClass'] = type(error).__name__
                reason = str(error)
                summary['snapshotSafeReason'] = reason if re.fullmatch('[A-Z_]{3,100}', reason) else 'LOCAL_SNAPSHOT_IO_UNAVAILABLE'
                if not encryption_attempted:
                    try:
                        root = S.PARENT / 'snapshots' / request['instanceNonce']
                        S.capture_partial_diagnostic(root, summary)
                        profile = S.load(S.RUNTIME / 'execution-profile.json')
                        encryption_attempted = True
                        encrypted = S.export_snapshot(root, revision, pin['executionProfileSha256'], profile['identity']['jobSha256'], completeness='PARTIAL')
                        summary['partialDiagnosticArchive'] = {key: encrypted[key] for key in ['cipherSha256', 'cipherBytes', 'fileCount', 'plaintextBytes']}
                    except Exception as diagnostic_error:
                        summary['partialDiagnostic'] = 'UNVERIFIED'
                        summary['partialDiagnosticFailureClass'] = type(diagnostic_error).__name__
        else:
            summary['snapshot'] = 'NOT_ADMITTED_NO_BUSINESS_FIXTURES'
            summary['prebusinessEvidenceRetention'] = 'UNVERIFIED_RUNNER_EPHEMERAL'
        print(json.dumps({'result': 'LOCAL_SUITE_AWAITING_ROOT_REVIEW' if success else 'LOCAL_SUITE_STOPPED', **summary}), flush=True)
    return 0 if success else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print(json.dumps({'result': 'LOCAL_SUITE_ADMISSION_BLOCKED', 'capacityVerdict': 'NOT_RUN', 'hostedAuthority': 'NONE'}), flush=True)
        raise SystemExit(1) from None
