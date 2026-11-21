"""Measure the exact Vite entry's recursive static import closure, once per file."""
import gzip
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import runpy
import sys
import urllib.parse
from linux_runtime_common import require_linux

RUNTIME = Path(__file__).resolve().parent
SOURCE = RUNTIME.parent.parent / 'colorplay-live-recovery'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


class EntryHtml(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.preloads = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'script' and attrs.get('type') == 'module':
            assert attrs.get('src'), 'INLINE_MODULE_UNSUPPORTED'
            self.scripts.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'modulepreload':
            assert attrs.get('href'), 'PRELOAD_WITHOUT_PATH'
            self.preloads.append(attrs['href'])


def relative_file(value):
    assert isinstance(value, str) and len(value) <= 240 and '\\' not in value, 'ASSET_PATH_INVALID'
    url = urllib.parse.urlsplit(value)
    assert not url.scheme and not url.netloc and not url.query and not url.fragment and '%' not in value, 'NONLOCAL_ASSET'
    path = url.path[1:] if url.path.startswith('/') else url.path
    assert path and all(part not in ['', '.', '..'] for part in path.split('/')), 'ASSET_PATH_INVALID'
    assert path.endswith('.js'), 'NON_JS_ENTRY'
    return path


def closure(manifest, scripts, preloads):
    assert isinstance(manifest, dict) and 1 <= len(manifest) <= 2000, 'MANIFEST_INVALID'
    files = {}
    for key, record in manifest.items():
        assert isinstance(key, str) and isinstance(record, dict) and isinstance(record.get('file'), str), 'MANIFEST_RECORD_INVALID'
        assert record['file'] not in files, 'MANIFEST_FILE_DUPLICATED'
        files[record['file']] = key
    assert scripts and len(set(scripts)) == len(scripts), 'ENTRY_INVALID'
    entry_keys = []
    for src in scripts:
        filename = relative_file(src)
        assert filename in files and manifest[files[filename]].get('isEntry') is True, 'ENTRY_NOT_IN_MANIFEST'
        entry_keys.append(files[filename])
    visited = set()
    pending = list(entry_keys)
    while pending:
        key = pending.pop()
        if key in visited:
            continue
        assert key in manifest, 'IMPORT_ABSENT'
        visited.add(key)
        record = manifest[key]
        relative_file(record['file'])
        imports = record.get('imports', [])
        assert isinstance(imports, list) and all(isinstance(item, str) for item in imports), 'IMPORT_SHAPE_INVALID'
        pending.extend(imports)
    result = sorted(manifest[key]['file'] for key in visited)
    assert all(relative_file(src) in result for src in preloads), 'PRELOAD_OUTSIDE_ENTRY_CLOSURE'
    return result


def measure(dist, expected_files):
    assert isinstance(expected_files, dict) and expected_files, 'ARTIFACT_MANIFEST_INVALID'
    actual = {}
    for path in sorted(dist.rglob('*')):
        assert not path.is_symlink(), 'ARTIFACT_SYMLINK'
        if not path.is_file():
            continue
        assert path.resolve().is_relative_to(dist.resolve()), 'ARTIFACT_PATH_ESCAPED'
        actual[str(path.relative_to(dist))] = digest(path.read_bytes())
    assert actual == expected_files, 'ARTIFACT_CONTENT_CHANGED'
    parsed = EntryHtml()
    parsed.feed((dist / 'index.html').read_text())
    manifest = json.loads((dist / '.vite/manifest.json').read_text())
    files = closure(manifest, parsed.scripts, parsed.preloads)
    records = []
    for filename in files:
        raw = (dist / filename).read_bytes()
        records.append({'file': filename, 'sha256': digest(raw), 'gzipBytes': len(gzip.compress(raw, mtime=0))})
    canonical = json.dumps(records, sort_keys=True, separators=(',', ':')).encode()
    return {'entryClosureSha256': digest(canonical), 'entryClosureGzipBytes': sum(row['gzipBytes'] for row in records), 'recursiveColdImports': True, 'deduplicatedChunks': True}, records


def main():
    require_linux()
    assert len(sys.argv) == 2 and re.fullmatch('[a-f0-9]{40}', sys.argv[1]), 'REVISION_REQUIRED'
    revision = sys.argv[1]
    root = runpy.run_path(str(RUNTIME / 'capacity-root-readonly.py'), run_name='_bundle_fixed_root')
    root['frozen'](revision)
    review, _ = root['read'](RUNTIME / 'reviewed-candidate.json')
    assert review['sourceRevision'] == revision and review['result'] == 'ACCEPTED_FOR_LOCAL_VALIDATION', 'REVIEW_MISMATCH'
    active, _ = root['read'](RUNTIME / 'active-preview.json')
    attempt = Path(active['attemptPath'])
    assert attempt.parent == RUNTIME and attempt.name.startswith('activation-') and active['sourceRevision'] == revision and active['appUrl'] == 'http://127.0.0.1:58373', 'ACTIVATION_INVALID'
    root['private_dir'](attempt)
    manifest, manifest_sha = root['read'](attempt / 'build-manifest.json', maximum=2097152)
    assert manifest['sourceRevision'] == revision and manifest['projectId'] == 'cp-whole-site-261115' and manifest['privateValuesAbsent'] is True, 'ARTIFACT_IDENTITY_INVALID'
    result, records = measure(SOURCE / 'dist', manifest['files'])
    # B3's frozen artifactSha256 is the actual admin-release.json response bytes.
    # Keep the independent whole-dist build manifest digest in the detailed proof.
    marker_bytes = (SOURCE / 'dist/admin-release.json').read_bytes()
    assert json.loads(marker_bytes) == {'environment': 'local', 'revision': revision}, 'ARTIFACT_MARKER_INVALID'
    marker_sha = digest(marker_bytes)
    assert manifest['files']['admin-release.json'] == marker_sha, 'ARTIFACT_MARKER_CHANGED'
    bundle = {'sourceRevision': revision, 'artifactSha256': marker_sha, **result}
    root['frozen'](revision)
    root['write'](attempt / 'entry-bundle-proof.json', {'kind': 'ROOT_RECURSIVE_ENTRY_BUNDLE', 'buildManifestSha256': manifest_sha, 'artifactDigestKind': 'ADMIN_RELEASE_RESPONSE_BYTES', 'measurement': bundle, 'files': records, 'dynamicRouteChunksIncluded': False, 'cwvProof': False, 'capacityProof': False})
    root['write'](RUNTIME / 'entry-bundle-proof.json', bundle)
    print(json.dumps(bundle))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'result': 'ENTRY_BUNDLE_MEASUREMENT_BLOCKED', 'errorClass': type(error).__name__, 'rawLogsStored': False}))
        raise SystemExit(1) from None
