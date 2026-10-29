"""Build the initial Cordialidad batch without replacing the ten authored signs.

python tools/build_cordialidad.py --dataset data/LSC-54 --blender <blender.exe>
Existing completed outputs are skipped; --overwrite explicitly regenerates them.
The dataset remains read-only. JSON extraction uses the existing project tool.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--blender', type=Path, required=True)
    parser.add_argument('--only', nargs='+')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    if not args.blender.is_file():
        parser.error('No se encontró Blender')
    manifest = json.loads((ROOT / 'web/src/app/cordialidad.json').read_text(encoding='utf-8'))
    if args.only:
        unknown = set(args.only) - {e['id'] for e in manifest}
        if unknown:
            parser.error(f'IDs fuera de la tanda: {sorted(unknown)}')
        manifest = [e for e in manifest if e['id'] in args.only]
    pending = [e for e in manifest if args.overwrite or
               not all((ROOT / p).is_file() for p in
                       (f"web/public/avatar/{e['id']}.vrma", f"web/public/Animaciones/{e['id']}.blend"))]
    missing = [e for e in pending if not (ROOT / f"web/public/avatar/{e['id']}.json").is_file()]
    if missing:
        command = [sys.executable, str(ROOT / 'tools/extract_lsc54_avatar.py'),
                   '--dataset', str(args.dataset.resolve()), '--output-dir', str(ROOT / 'web/public/avatar'),
                   '--fps-verificado']
        for entry in missing:
            command += ['--target', f"{entry['id']}=Cordialidad/{entry['expresion']}"]
        subprocess.run(command, cwd=ROOT, check=True)
    reports = ROOT / 'data/inspection/cordialidad'
    reports.mkdir(parents=True, exist_ok=True)

    def build(entry):
        log = reports / f"{entry['id']}-build.log"
        with log.open('w', encoding='utf-8') as output:
            subprocess.run([str(args.blender.resolve()), '--background', '-t', '2',
                            str(ROOT / 'web/public/Animaciones/losiento.blend'),
                            '--python-exit-code', '1', '--python',
                            str(ROOT / 'tools/prepare_cordialidad_blender.py'),
                            '--', '--sign', entry['id']], cwd=ROOT, stdout=output,
                           stderr=subprocess.STDOUT, check=True)
        return entry['id']

    # Separate files per process; all processes read the same unchanged base.
    failures = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(build, e): e['id'] for e in pending}
        for future in as_completed(futures):
            try:
                print('CREADA', future.result(), flush=True)
            except Exception as error:
                failures.append(futures[future])
                print('ERROR', futures[future], str(error), flush=True)
    if failures:
        raise SystemExit(f'Animaciones fallidas: {failures}. Consultar sus logs.')
    print(f'{len(pending)} creadas; {len(manifest) - len(pending)} existentes conservadas.')


if __name__ == '__main__':
    main()
