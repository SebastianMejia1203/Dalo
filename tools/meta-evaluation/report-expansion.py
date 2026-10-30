"""Report preserved development trials without dropping failures or mixing conditions."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path('data/meta-evaluation/2026-10-29-welcome-plus-two')
CONDITIONS = ['candidate-screen', 'welcome-v3-control', 'welcome-v4', 'full-10']


def main():
    runs, records = {}, []
    for name in CONDITIONS:
        folder = ROOT / name
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        rows = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((folder / 'results').glob('*.json'))]
        assert {r['id'] for r in rows} == {t['id'] for t in manifest['tasks']}, name
        runs[name] = rows
        records.extend({**r, 'condition': name} for r in rows)
    primary = [r for r in runs['full-10'] if r['sampleId'] != 'outside-0001']
    assert len(primary) == 402
    manifest = json.loads((ROOT / 'full-10/manifest.json').read_text(encoding='utf-8'))
    context = json.loads((ROOT / 'full-10/contexts.json').read_text(encoding='utf-8'))
    previous = [json.loads(p.read_text(encoding='utf-8')) for p in Path('data/meta-evaluation/2026-10-29-video-contributor/full/results').glob('*.json')]

    def metric(rows):
        return {'videos': len(rows), 'correct': sum(r['exactMatch'] is True for r in rows),
                'technicalErrors': sum(r['status'] != 'ok' for r in rows)}

    per_class = [{'class': label, **metric([r for r in primary if r['expected'] == label])}
                 for label in manifest['counts']]
    main_metric = metric(primary)
    main_metric['accuracy'] = main_metric['correct'] / len(primary)
    main_metric['perClass'] = per_class
    main_metric['confusion'] = {label: dict(Counter((r.get('result') or {}).get('clase', 'ERROR') for r in primary if r['expected'] == label)) for label in manifest['counts']}
    summary = {
        'model': context['model'], 'promptVersion': context['closed']['promptVersion'],
        'recognitionTasks': len(records), 'main': main_metric,
        'welcomeComparison': {
            'previousFullV3': metric([r for r in previous if r['expected'] == 'bienvenido']),
            'repeatedV3Control': metric(runs['welcome-v3-control']),
            'targetedV4EightClasses': metric([r for r in runs['welcome-v4'] if r['expected'] == 'bienvenido']),
            'finalV4TenClasses': metric([r for r in primary if r['expected'] == 'bienvenido'])},
        'screening': {label: metric([r for r in runs['candidate-screen'] if r['expected'] == label]) for label in ['bien', 'mal', 'si', 'no']},
        'outside': [r for r in runs['full-10'] if r['sampleId'] == 'outside-0001'],
        'limitations': 'Development data used to tune descriptions and select words; no independent validation. Confidence is subjective, not calibrated. Technical failures count as misses.'}
    (ROOT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    with (ROOT / 'events.jsonl').open('w', encoding='utf-8') as stream:
        for row in records:
            for line in (ROOT / row['condition'] / 'logs' / f"{row['id']}.jsonl").read_text(encoding='utf-8').splitlines():
                if line.strip():
                    stream.write(json.dumps({'condition': row['condition'], 'testId': row['id'], **json.loads(line)}, ensure_ascii=False) + '\n')
    lines = ['# Bienvenido y ampliación a diez palabras', '',
             f"Lote final: **{main_metric['correct']}/402 ({main_metric['accuracy']:.1%})**, incluidos los fallos técnicos en el denominador. Modelo `{context['model']}`, contexto `{summary['promptVersion']}`, videos completos MP4 sin audio a velocidad original, muestreo Meta de 12 fps.", '',
             '## Por qué bajó Bienvenido', '',
             'El contexto anterior describía un barrido amplio hacia un lado y un posible giro de torso. Era demasiado restrictivo para las variantes breves y frontales del dataset. En ocho errores previos hubo cuatro respuestas otra, dos Esperar, una Gracias y una Perdón. Las explicaciones del modelo descartaban Bienvenido por falta de barrido lateral amplio o confundían proximidad a la cara/manos con otra clase.', '',
             'La comprobación de originales y MP4 no encontró pérdida de fotogramas ni duración: los clips fallidos conservan 40–64 fotogramas a 30 fps, entre 1,33 y 2,13 segundos. La evidencia apunta a sesgo de la descripción y errores de percepción; no demuestra una causa interna única del modelo.', '',
             'Se precisó la trayectoria coordinada de dos manos abiertas en arco hacia delante/abajo o al lado opuesto, sin exigir amplitud grande ni giro. Se distinguen el desplazamiento conjunto, el sostén frontal de Esperar, la salida desde la boca de Gracias y los roces repetidos de Perdón. Las descripciones son provisionales y requieren validación lingüística.', '',
             '| Condición | Bienvenido correcto |', '|---|---:|']
    for name, m in summary['welcomeComparison'].items():
        lines.append(f"| {name} | {m['correct']}/{m['videos']} |")
    lines += ['', 'El control repetido y la prueba dirigida mantuvieron modelo, videos y muestreo; el lote final añadió dos clases. Hay variación entre ejecuciones. El clip residual y sus respuestas se conservan en el índice.', '',
              '## Elección de las palabras', '',
              'Se exploraron Bien, Mal, Sí y No con tres participantes distintos por palabra. Bien y Mal obtuvieron 3/3; Sí y No, 2/3. Se eligieron Bien y Mal por ese piloto y por su contraste observable de pulgar arriba/abajo. Esto no demuestra que sean las palabras más fáciles de toda la LSC. En el lote completo Mal resultó menos fiable que Bien.', '',
              '| Clase | Aciertos / videos | Exactitud | Errores técnicos |', '|---|---:|---:|---:|']
    for m in per_class:
        lines.append(f"| {m['class']} | {m['correct']}/{m['videos']} | {m['correct']/m['videos']:.1%} | {m['technicalErrors']} |")
    lines += ['', 'El único fallo técnico fue final-0384 (Perdón): HTTP 200 del proveedor, pero sin respuesta estructurada válida. Se conserva y cuenta como fallo; no se reemplazó por un reintento selectivo.', '',
              '## Video externo: Necesitar', '', '| Condición | Respuesta | Confianza | Resultado |', '|---|---|---:|---|']
    for row in summary['outside']:
        answer = row.get('result') or {}
        verdict = 'falso positivo: debía rechazar con otra' if row['scope'] == 'closed' else 'no identificada en vocabulario abierto'
        lines.append(f"| {row['scope']} | {answer.get('clase', 'ERROR')} | {answer.get('confianza', '')} | {verdict} |")
    lines += ['', 'El rechazo de señas externas sigue sin ser fiable. Un único video no estima una tasa general de falsos positivos.', '',
              '## Alcance y trazabilidad', '',
              '**Son métricas de desarrollo:** los mismos datos ayudaron a ajustar el contexto y elegir palabras. No equivalen a precisión con personas nuevas. La confianza no está calibrada. El cambio mejora Bienvenido pero no todas las clases; Perdón sigue siendo una de las más débiles.', '',
              f"Se conservaron {len(records)} tareas: 12 de selección, 28 de control, 55 de prueba dirigida y 404 del lote final (402 positivas y dos condiciones externas). Cada petición es independiente. No se enviaron nombres de archivo, etiquetas esperadas ni identidades; solo medios y contexto del catálogo. Contributor mantiene las condiciones de uso de datos del proveedor ya indicadas en la aplicación.", '',
              '[Diagnóstico y errores previos](diagnosis.json) · [Resumen](summary.json) · [Resultados separados](results.json) · [Log consolidado](events.jsonl) · [Contexto exacto final](full-10/contexts.json)', '',
              '## Índice por prueba', '', '| Condición | Prueba | Esperada | Predicha | Log | Resultado | Video |', '|---|---|---|---|---|---|---|']
    for row in records:
        prefix = row['condition']
        answer = (row.get('result') or {}).get('clase', 'ERROR')
        lines.append(f"| {prefix} | {row['id']} | {row['expected']} | {answer} | [log]({prefix}/logs/{row['id']}.jsonl) | [respuesta]({prefix}/results/{row['id']}.json) | [MP4]({prefix}/samples/{row['sampleId']}/full.mp4) |")
    (ROOT / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({'main': main_metric, 'tasks': len(records)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
