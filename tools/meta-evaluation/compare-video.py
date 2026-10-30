"""Compare preserved frame baseline, paired video prompts and full video development run."""
import json
from pathlib import Path

ROOT=Path('data/meta-evaluation/2026-10-29-video-contributor')
OLD=Path('data/meta-evaluation/2026-10-29-cordialidad')


def main():
    runs={}
    records=[]
    for name in ['control','pilot','full']:
        folder=ROOT/name
        manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
        rows=[json.loads(path.read_text(encoding='utf-8')) for path in sorted((folder/'results').glob('*.json'))]
        assert {row['id'] for row in rows}=={task['id'] for task in manifest['tasks']}
        runs[name]={'manifest':manifest,'results':rows,'context':json.loads((folder/'contexts.json').read_text(encoding='utf-8'))}
        records += [{**row,'condition':name} for row in rows]
    baseline=json.loads((OLD/'summary.json').read_text(encoding='utf-8'))['mainEvaluation']
    primary=[row for row in runs['full']['results'] if row['sampleId']!='outside-0001']
    assert len(primary)==297
    ids={row['sampleId'] for row in runs['control']['results']}
    paired=[row for row in primary if row['sampleId'] in ids]
    assert len(paired)==24
    correct=sum(row['exactMatch'] is True for row in primary)
    labels=list(runs['full']['manifest']['counts'])
    by_class=[]
    matrix={label:{prediction:0 for prediction in labels+['otra','ERROR']} for label in labels}
    for label in labels:
        rows=[row for row in primary if row['expected']==label]
        before=next(row for row in baseline['perClass'] if row['class']==label)
        by_class.append({'class':label,'videos':len(rows),'beforeCorrect':before['correct'],'beforeAccuracy':before['accuracy'],'correct':sum(row['exactMatch'] is True for row in rows),'accuracy':sum(row['exactMatch'] is True for row in rows)/len(rows)})
        for row in rows:matrix[label][row['result']['clase'] if row['status']=='ok' else 'ERROR']+=1
    summary={'model':runs['full']['context']['model'],'promptVersion':runs['full']['context']['closed']['promptVersion'],'recognitionRequests':len(records),
             'main':{'videos':297,'correct':correct,'accuracy':correct/297,'technicalErrors':sum(row['status']!='ok' for row in primary),'perClass':by_class,'confusion':matrix},
             'paired':{'videos':24,'oldContextCorrect':sum(row['exactMatch'] is True for row in runs['control']['results']),'v2ContextCorrect':sum(row['exactMatch'] is True for row in runs['pilot']['results']),'v3ContextCorrect':sum(row['exactMatch'] is True for row in paired)},
             'outside':[row for row in runs['full']['results'] if row['sampleId']=='outside-0001'],
             'developmentWarning':'Prompts tuned using dataset samples and paired pilot outcomes. Not held-out generalization. Overall comparison changes model mode, media and prompt.'}
    ROOT.mkdir(exist_ok=True)
    (ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    with (ROOT/'events.jsonl').open('w',encoding='utf-8') as stream:
        for row in records:
            for line in (ROOT/row['condition']/'logs'/f"{row['id']}.jsonl").read_text(encoding='utf-8').splitlines():
                if line.strip():stream.write(json.dumps({'condition':row['condition'],'testId':row['id'],**json.loads(line)},ensure_ascii=False)+'\n')
    lines=['# Videos completos, Contributor y contexto de movimientos','',
           f"**{correct}/297 aciertos ({correct/297:.1%})** con `muse-spark-1.3-contributor`, video a 12 fps y `lsc-motion-v3`. Cero errores técnicos en el lote principal.",'',
           f"La configuración anterior obtuvo {baseline['correct']}/297 ({baseline['accuracy']:.1%}). Esta comparación cambia simultáneamente medio, modo del modelo y contexto; no demuestra que el video por sí solo explique la mejora.",'',
           '**Métrica de desarrollo, no validación independiente:** las descripciones se precisaron observando muestras y resultados del mismo dataset. No se enviaron respuestas esperadas, nombres de archivo ni identidades al modelo. Los videos se enviaron completos en MP4 sin audio, a la velocidad original; Meta los muestrea a 12 fps.','',
           '| Clase | Antes: JPEG / contexto v1 | Ahora: video / contexto v3 | Exactitud actual |','|---|---:|---:|---:|']
    for item in by_class:lines.append(f"| {item['class']} | {item['beforeCorrect']}/{item['videos']} | {item['correct']}/{item['videos']} | {item['accuracy']:.1%} |")
    p=summary['paired']
    lines+=['','## Comparación de contexto sobre los mismos 24 videos','',
            'Se mantuvieron Contributor y video a 12 fps. Cada condición fue independiente. La tercera condición corresponde a esos mismos clips dentro del lote completo, después de ajustar el contexto; no es un conjunto reservado.', '',
            f"- Contexto v1: **{p['oldContextCorrect']}/24**.",f"- Primer contexto de movimientos v2: **{p['v2ContextCorrect']}/24**.",f"- Contexto precisado v3: **{p['v3ContextCorrect']}/24**.",'',
            'La versión v2 recuperó Esperar y Perdón en el piloto, pero confundió Gracias y Lo siento. En v3 se describieron los ocho movimientos y se aclaró que las manos juntas durante el reposo no son evidencia de Perdón. También se separó contacto mano-mano, mano-pecho y salida desde la boca. Las descripciones siguen siendo provisionales y no validadas lingüísticamente.','',
            '## Palabra externa: Necesitar','', '| Condición | Respuesta | Confianza | Resultado |','|---|---|---:|---|']
    for row in summary['outside']:
        answer=row['result']['clase'];verdict=('rechazo correcto' if answer=='otra' else 'falso positivo') if row['scope']=='closed' else ('identificada' if row['exactMatch'] else 'no identificada')
        lines.append(f"| {row['scope']} | {answer} | {row['result']['confianza']} | {verdict} |")
    lines+=['','El rechazo de palabras externas sigue sin ser fiable. Un solo clip no permite estimar una tasa general de falsos positivos. No se cambió un umbral de confianza para ocultar este fallo.','',
            '## Decisión de alcance','',
            'Se conservaron las ocho clases mientras se evaluaba el contexto. Las tres clases originalmente más débiles mejoraron. Persisten fallos y una regresión en Bienvenido; antes de reemplazar palabras conviene comprobar variantes con una persona competente en LSC y reservar participantes nuevos para validación. No se presentan estos resultados como suficientes para interpretación autónoma.','',
            '## Voice Transcribe','',
            'Integrado `muse-voice-transcribe-1.0` en Español → Señas: AudioWorklet, WAV mono PCM16 a 24 kHz, turnos de hasta 15 segundos, backend con clave y preferencia de español. La prueba real con audio sintético devolvió exactamente “Hola. Gracias. Bienvenido.”. No se activó el micrófono para esa prueba. [Resultado real](VOICE-SMOKE.json).','',
            '## Uso de datos y artefactos','',
            'Contributor permite a Meta usar contenido para entrenamiento. La clave queda en el backend. [Documentación](https://dev.meta.ai/docs/models).', '',
            f"Se conservaron **{len(records)} peticiones de reconocimiento**: 24 control, 24 primer piloto y 299 del lote final (297 clases + 2 condiciones externas). Los dos errores técnicos del control/piloto se conservan y no se excluyen de sus denominadores.",'',
            '[Resultados consolidados](results.json) · [Log completo](events.jsonl) · [Resumen JSON](summary.json) · [Contexto final](full/contexts.json)','',
            '## Índice de cada prueba','', '| Condición | Prueba | Esperada | Predicha | Log | Resultado | Video |','|---|---|---|---|---|---|']
    for row in records:
        prefix=row['condition'];answer=(row.get('result')or{}).get('clase','ERROR')
        lines.append(f"| {prefix} | {row['id']} | {row['expected']} | {answer} | [log]({prefix}/logs/{row['id']}.jsonl) | [respuesta]({prefix}/results/{row['id']}.json) | [MP4]({prefix}/samples/{row['sampleId']}/full.mp4) |")
    (ROOT/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({'main':summary['main'],'paired':summary['paired'],'requests':len(records)},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
