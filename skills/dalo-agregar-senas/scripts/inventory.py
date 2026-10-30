"""Inventory labeled videos without modifying media or contacting any provider."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
import re
import unicodedata

VIDEO_EXTENSIONS = {'.avi', '.mp4', '.webm', '.mov', '.mkv'}


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value.casefold())
                   if not unicodedata.combining(c)).strip()


def parse_words(values):
    mappings = {}
    for value in values:
        identifier, separator, location = value.partition('=')
        parts = location.replace('\\', '/').split('/')
        if (not separator or not re.fullmatch('[a-z][a-z0-9]*', identifier)
                or identifier == 'otra' or identifier in mappings
                or len(parts) != 2 or any(not p or p in {'.', '..'} for p in parts)):
            raise ValueError(f'Usa ID=Categoría/Carpeta, con ID único: {value}')
        mappings[identifier] = tuple(normalize(p) for p in parts)
    if len(set(mappings.values())) != len(mappings):
        raise ValueError('Una carpeta no puede representar dos etiquetas distintas.')
    return mappings


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def inventory(root, mappings, seed=20261030, holdout_fraction=.25):
    root = Path(root).resolve()
    if not root.is_dir():
        raise ValueError(f'No existe la fuente de videos: {root}')
    if not 0 < holdout_fraction < 1:
        raise ValueError('La fracción reservada debe estar entre 0 y 1.')
    found = {identifier: [] for identifier in mappings}
    directories = {identifier: set() for identifier in mappings}
    for path in sorted(root.glob('*/*/*/*')):
        if not path.is_file() or path.suffix.casefold() not in VIDEO_EXTENSIONS:
            continue
        participant, category, word, _ = path.relative_to(root).parts
        for identifier, location in mappings.items():
            if (normalize(category), normalize(word)) == location:
                directories[identifier].add((category, word))
                found[identifier].append((path, participant))
    for identifier in mappings:
        if not found[identifier]:
            raise ValueError(f'No hay videos para {identifier}: {mappings[identifier]}')
        if len(directories[identifier]) > 1:
            raise ValueError(f'Carpetas ambiguas para {identifier}: {directories[identifier]}')

    samples, seen = [], {}
    for identifier in sorted(found):
        for path, participant in found[identifier]:
            digest = sha256(path)
            previous = seen.get(digest)
            if previous and previous['expected'] != identifier:
                raise ValueError(f'Mismo video con etiquetas contradictorias: {previous["source"]} y {path}')
            sample = {
                'id': f'clip-{len(samples)+1:05}', 'expected': identifier,
                'source': path.relative_to(root).as_posix(), 'participant': participant,
                'sha256': digest, 'bytes': path.stat().st_size,
                'duplicateOf': previous['id'] if previous else None,
            }
            samples.append(sample)
            if not previous:
                seen[digest] = sample

    participants = sorted({s['participant'] for s in samples if not s['duplicateOf']})
    shuffled = participants.copy()
    random.Random(seed).shuffle(shuffled)
    count = min(len(participants)-1, max(1, round(len(participants)*holdout_fraction))) if len(participants) > 1 else 0
    held_out = set(shuffled[:count])
    for sample in samples:
        sample['partition'] = ('excluded_duplicate' if sample['duplicateOf'] else
                               'holdout' if sample['participant'] in held_out else 'development')
    classes = {}
    warnings = []
    for identifier in mappings:
        rows = [s for s in samples if s['expected'] == identifier]
        unique = [s for s in rows if not s['duplicateOf']]
        classes[identifier] = {
            'videos': len(rows), 'uniqueVideos': len(unique),
            'participants': sorted({s['participant'] for s in unique}),
            'partitions': dict(Counter(s['partition'] for s in rows)),
        }
        if len(classes[identifier]['participants']) < 2:
            warnings.append(f'{identifier}: solo un participante único; cobertura insuficiente para validar generalización.')
        for partition in ['development', 'holdout']:
            if not any(s['partition'] == partition for s in unique):
                warnings.append(f'{identifier}: no tiene clips en {partition}. Revisa la separación antes de evaluar.')
    return {
        'createdAt': datetime.now(timezone.utc).isoformat(), 'root': str(root),
        'layout': 'participant/category/word/video', 'seed': seed,
        'holdoutFraction': holdout_fraction,
        'splitNote': 'Proposed participant split only. Prior inspection/tuning history must be checked before calling this held-out validation.',
        'mediaNote': 'File hashes and labels only; videos have not been decoded, linguistically validated or sent to an API.',
        'developmentParticipants': sorted(set(participants)-held_out),
        'holdoutParticipants': sorted(held_out), 'classes': classes,
        'warnings': warnings, 'samples': samples,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--word', action='append', required=True, help='ID=Categoría/Carpeta; repetir para contrastes')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=20261030)
    parser.add_argument('--holdout-fraction', type=float, default=.25)
    parser.add_argument('--source-name', default='LSC-54')
    parser.add_argument('--source-reference', default=None)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('El directorio de salida ya existe. Usa uno nuevo; no se sobrescriben experimentos.')
    try:
        result = inventory(args.root, parse_words(args.word), args.seed, args.holdout_fraction)
    except ValueError as error:
        parser.error(str(error))
    result['provenance'] = {
        'name': args.source_name, 'reference': args.source_reference,
        'permissions': 'Not reviewed by this script',
        'mappings': args.word,
    }
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output/'inventory.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    lines = ['# Inventario de videos', '', f'Fuente: {args.source_name}', '',
             '| Clase | Videos | Únicos | Participantes | Desarrollo | Reservada | Duplicados |',
             '|---|---:|---:|---:|---:|---:|---:|']
    for label, item in result['classes'].items():
        partitions = item['partitions']
        lines.append(f'| {label} | {item["videos"]} | {item["uniqueVideos"]} | {len(item["participants"])} | {partitions.get("development",0)} | {partitions.get("holdout",0)} | {partitions.get("excluded_duplicate",0)} |')
    lines += ['', 'La partición es una propuesta. Revisa si las personas reservadas ya se usaron para ajustes.',
              'No se inspeccionó la calidad visual, no se modificaron videos y no se llamó a una API.', '']
    lines.extend(f'- {warning}' for warning in result['warnings'])
    (args.output/'INVENTORY.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(json.dumps({'classes': result['classes'], 'warnings': result['warnings'], 'output': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
