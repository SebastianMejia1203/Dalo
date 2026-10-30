"""Summarize every planned task, including missing requests and technical failures."""
import argparse
from collections import Counter
import json
from pathlib import Path
import statistics


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('directory',type=Path)
    args=parser.parse_args();root=args.directory
    manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    model=json.loads((root/'contexts.json').read_text(encoding='utf-8'))['model']
    results=[json.loads(p.read_text(encoding='utf-8')) for p in sorted((root/'results').glob('*.json'))]
    planned=len(manifest['tasks'])
    supplemental=root/'video-12fps'
    if (supplemental/'manifest.json').exists():
        planned+=len(json.loads((supplemental/'manifest.json').read_text(encoding='utf-8'))['tasks'])
        results += [{**json.loads(p.read_text(encoding='utf-8')),'artifactPrefix':'video-12fps/'} for p in sorted((supplemental/'results').glob('*.json'))]
    main_results=[r for r in results if r['scope']=='closed' and r['kind']=='frames' and r['sampleId']!='outside-0001']
    classes=list(manifest['counts'])
    matrix={c:{p:0 for p in classes+['otra','ERROR']} for c in classes}
    totals=[]
    for label,total in manifest['counts'].items():
        rows=[r for r in main_results if r['expected']==label]
        ok=[r for r in rows if r['status']=='ok']
        errors=len(rows)-len(ok)
        correct=sum(r['exactMatch'] for r in ok)
        for row in rows:matrix[label][row['result']['clase'] if row['status']=='ok' else 'ERROR']+=1
        totals.append({'class':label,'planned':total,'completed':len(rows),'correct':correct,'errors':errors,'accuracy':correct/total})
    negative=[r for r in results if r['sampleId']=='outside-0001']
    comparisons=[]
    for row in results:
        if row['kind']=='video' and row['sampleId']!='outside-0001':
            frame=next((r for r in main_results if r['sampleId']==row['sampleId']),None)
            comparisons.append({'video':row,'frames':frame})
    usage=Counter()
    for r in results:
        for key in ['input_tokens','output_tokens','total_tokens']:
            usage[key]+=((r.get('result') or {}).get('usage') or {}).get(key,0)
    latencies=[r['result']['latencyMs']/1000 for r in results if r['status']=='ok']
    correct=sum(r['exactMatch'] for r in main_results if r['status']=='ok')
    total=sum(manifest['counts'].values())
    wrong=[r for r in main_results if r['status']=='ok' and not r['exactMatch']]
    high_confidence_wrong=[r for r in wrong if r['result']['confianza']>=.8]
    summary={'plannedRequests':planned,'completedRequests':len(results),'missingRequests':planned-len(results),'technicalErrors':sum(r['status']!='ok' for r in results),
             'mainEvaluation':{'planned':total,'completed':len(main_results),'correct':correct,'accuracy':correct/total,'perClass':totals,'confusion':matrix},
             'negativeWord':manifest['negativeWord'],'negativeSource':manifest['negativeSource'],'negativeTests':negative,'pairedVideoComparisons':comparisons,
             'highConfidenceWrongCount':len(high_confidence_wrong),
             'macroAccuracy':statistics.mean(item['accuracy'] for item in totals),
             'latencySeconds':{'median':statistics.median(latencies) if latencies else None,'mean':statistics.mean(latencies) if latencies else None,'maximum':max(latencies) if latencies else None},'usage':dict(usage)}
    (root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    (root/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    with (root/'events.jsonl').open('w',encoding='utf-8') as stream:
        for row in results:
            path=root/row.get('artifactPrefix','')/'logs'/f"{row['id']}.jsonl"
            for line in path.read_text(encoding='utf-8').splitlines():
                if line.strip():stream.write(json.dumps({'testId':row['id'],**json.loads(line)},ensure_ascii=False)+'\n')
    lines=['# Evaluación de Cordialidad con Meta', '',
           f"Modelo: {model}. Contextos: [contexts.json](contexts.json). Selección y referencias: [manifest.json](manifest.json).",
           '',f"Peticiones completadas: **{len(results)}/{planned}**. Errores técnicos: **{summary['technicalErrors']}**.",
           '',f"Catálogo cerrado, fotogramas de las ocho clases: **{correct}/{total} ({correct/total:.1%})**. Completadas: {len(main_results)}. Los errores y pendientes no se eliminan del denominador.",
           '', '| Clase | Videos | Aciertos | Errores técnicos | Exactitud |','|---|---:|---:|---:|---:|']
    for item in totals:lines.append(f"| {item['class']} | {item['planned']} | {item['correct']} | {item['errors']} | {item['accuracy']:.1%} |")
    lines+=['','## Palabra fuera del catálogo', '',f"Selección aleatoria reproducible (semilla {manifest['seed']}): **{manifest['negativeWord']}**, `{manifest['negativeSource']}`.",
            '', '| Condición | Formato | Respuesta | Confianza | Tiempo | Resultado |','|---|---|---|---:|---:|---|']
    for row in negative:
        result=row.get('result') or {}
        answer=result.get('clase','ERROR')
        verdict=('rechazo correcto' if answer=='otra' else 'falso positivo') if row['scope']=='closed' else ('coincidencia exacta' if row['exactMatch'] else 'sin identificación correcta por coincidencia exacta')
        if row['status']!='ok':verdict='error técnico'
        format_name=row['kind']+(f" {row['videoSamplingFps']} fps" if row.get('videoSamplingFps') else '')
        lines.append(f"| {row['scope']} | {format_name} | {answer} | {result.get('confianza','—')} | {result.get('latencyMs',0)/1000:.2f} s | {verdict} |")
    lines+=['','En abierto, revisar también la equivalencia semántica: la coincidencia literal no mide sinónimos. El único clip externo no estima una tasa general de falsos positivos.','', '## Video completo frente a fotogramas','', '| Esperada | Fuente | Muestreo del video | Fotogramas | Video completo |','|---|---|---|---|---|']
    for pair in comparisons:
        video=pair['video'];frame=pair['frames']
        rate=str(video.get('videoSamplingFps') or 'automático')
        frame_label=((frame or {}).get('result') or {}).get('clase','ERROR' if frame else 'pendiente')
        lines.append(f"| {video['expected']} | {video['source']} | {rate} | {frame_label} | {(video.get('result') or {}).get('clase','ERROR')} |")
    lines+=['','## Matriz de confusión', '', '| Real \\ Predicha | '+' | '.join(classes+['otra','ERROR'])+' |','|---|'+'---:|'*(len(classes)+2)]
    for label in classes:lines.append('| '+label+' | '+' | '.join(str(matrix[label][pred]) for pred in classes+['otra','ERROR'])+' |')
    lines+=['','## Errores con confianza alta','',f"Se registraron **{len(high_confidence_wrong)} errores con confianza declarada ≥ 0,8** en la evaluación principal. Esa confianza no garantiza que la seña esté bien reconocida.",'',
            '| Esperada | Predicha | Confianza | Resultado |','|---|---|---:|---|']
    for row in sorted(high_confidence_wrong,key=lambda r:r['result']['confianza'],reverse=True)[:10]:
        lines.append(f"| {row['expected']} | {row['result']['clase']} | {row['result']['confianza']} | [ver respuesta](results/{row['id']}.json) |")
    lines+=['','## Método y límites','',
            '- Cada petición es independiente. No se dan ejemplos etiquetados ni se envían nombres de archivo, participantes, rutas o respuestas esperadas al modelo.',
            '- Doce JPEG por clip: cobertura temporal y cuantiles de movimiento clásico. Se conservan índices, tiempos y hashes. No es una anotación lingüística de los momentos clave.',
            '- Los MP4 de comparación conservan todos los fotogramas y la velocidad del AVI, transcodificados sin audio. La API decide qué fotogramas consume según el muestreo automático o el valor explícito de fps.',
            '- Contexto y prompt cerrados idénticos al frontend. En abierto se retira todo el catálogo y se permite una etiqueta libre o desconocida. No se ajustaron prompts después de ver resultados.',
            '- El dataset incluye rostros pixelados y videos cortos a 640×360; la expresión facial y ciertos detalles de dedos pueden perderse.',
            '- Los cuatro videos con muestreo automático produjeron respuestas que describen un único fotograma. Se conservan y se repiten como condiciones separadas a 12 fps; no se deben comparar sin advertir esta diferencia de entrada. [Campo fps de Meta](https://dev.meta.ai/docs/api-reference/responses/schemas).',
            '- Esta es una evaluación zero-shot del dataset, no una prueba de generalización de cámara en vivo ni una validación por una persona competente en LSC.',
            '- La confianza es subjetiva, no calibrada. Los logs contienen etapas, resúmenes públicos y uso de tokens; no pensamiento interno privado ni claves.',
            '- Usage acumulado corresponde a respuestas completadas; los intentos fallidos pueden generar consumo adicional. No se estima costo monetario sin consultar la tarifa de la cuenta.',
            '',f"Latencia mediana: {summary['latencySeconds']['median'] or 0:.2f} s. Tokens reportados: {usage.get('total_tokens',0):,}.",
            '', '## Archivos', '', '[Resultados consolidados](results.json) · [Resumen y matriz JSON](summary.json) · [Log completo por evento](events.jsonl) · [Registro JSONL de resultados iniciales](results.jsonl)', '',
            '[Validación técnica y nombres de fallos heredados de test_web_interface](test-validation.json). Las cuatro pruebas nuevas de selección de fotogramas y las trece del backend pasan. La suite Python completa ejecutó 52 pruebas y tiene cinco fallos en las aserciones del frontend anterior, que no se modificó.',
            'Por prueba: `requests/test-NNNN.json` (contexto y referencias locales), `logs/test-NNNN.jsonl` (eventos), `results/test-NNNN.json` (respuesta y evaluación).',
            'Por clip: `samples/clip-NNNN/00.jpg` … `11.jpg`, `sheet.jpg`; MP4 completo en los tres casos comparados.',
            'Las cuatro condiciones adicionales de video a 12 fps tienen manifiesto, contextos, peticiones, logs y resultados independientes en `video-12fps/`.',
            '', '## Índice de las pruebas', '', '| Prueba | Esperada | Predicha | Tipo | Log | Resultado | Fotogramas |','|---|---|---|---|---|---|']
    for row in results:
        answer=(row.get('result') or {}).get('clase','ERROR')
        prefix=row.get('artifactPrefix','')
        lines.append(f"| {row['id']} | {row['expected']} | {answer} | {row['scope']}/{row['kind']} | [log]({prefix}logs/{row['id']}.jsonl) | [resultado]({prefix}results/{row['id']}.json) | [hoja](samples/{row['sampleId']}/sheet.jpg) |")
    (root/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({key:summary[key] for key in ['plannedRequests','completedRequests','technicalErrors','missingRequests']},ensure_ascii=False))
    print(f'Main accuracy: {correct}/{total} ({correct/total:.1%})')


if __name__=='__main__':main()
