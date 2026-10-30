"""Prepare blind LSC evaluation inputs with classical motion scoring (no ML)."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random

import cv2
import numpy as np

CLASSES = {'chao':'Chao', 'perfecto':'Perfecto', 'hola':'Hola', 'gracias':'Gracias',
           'esperar':'Esperar', 'losiento':'Lo siento', 'bienvenido':'Bienvenido', 'perdon':'Perdon'}


def select_indices(scores, count=12):
    if not scores:
        raise ValueError('Empty clip')
    n = len(scores)
    if n <= count:
        return list(range(n))
    values = np.maximum(np.asarray(scores, dtype=float), 0)
    active = np.flatnonzero(values > max(float(values.max()) * .12, .05))
    first, last = (max(0, int(active[0])-2), min(n-1, int(active[-1])+2)) if len(active) else (0,n-1)
    if last-first+1 < count:
        first, last = 0, n-1
    selected = set(np.rint(np.linspace(first,last,6)).astype(int).tolist())
    cumulative = np.cumsum(values[first:last+1])
    if cumulative[-1] > 0:
        for q in np.linspace(.04,.96,6):
            selected.add(first+int(np.searchsorted(cumulative,q*cumulative[-1])))
    for index in np.rint(np.linspace(first,last,count)).astype(int):
        if len(selected) >= count:
            break
        selected.add(int(index))
    if len(selected) < count:
        for index in range(first,last+1):
            selected.add(index)
            if len(selected) == count:
                break
    return sorted(selected)


def extract(source, folder):
    folder.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(source))
    fps = capture.get(cv2.CAP_PROP_FPS)
    scores = []
    previous = None
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        gray = cv2.cvtColor(cv2.resize(frame,(160,90)),cv2.COLOR_BGR2GRAY)[:,24:136]
        gray = cv2.GaussianBlur(gray,(5,5),0)
        scores.append(0.0 if previous is None else float(np.mean(cv2.absdiff(gray,previous))))
        previous = gray
    capture.release()
    if fps <= 0 or not scores:
        raise ValueError(f'Unreadable video: {source}')
    indices = select_indices(scores)
    capture = cv2.VideoCapture(str(source))
    selected = []
    for index in indices:
        capture.set(cv2.CAP_PROP_POS_FRAMES,index)
        ok, frame = capture.read()
        if not ok:
            raise ValueError(f'Failed reading frame {index} from {source}')
        if frame.shape[1] > 640:
            frame = cv2.resize(frame,(640,round(frame.shape[0]*640/frame.shape[1])))
        path = folder / f'{len(selected):02}.jpg'
        ok, encoded = cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,90])
        if not ok:
            raise ValueError('JPEG encode failed')
        encoded.tofile(str(path))
        selected.append({'index':index,'seconds':round(index/fps,4),'file':path.name,
                         'sha256':hashlib.sha256(encoded.tobytes()).hexdigest(),'motion':round(scores[index],4)})
    capture.release()
    tiles=[]
    for item in selected:
        image=cv2.imdecode(np.fromfile(str(folder/item['file']),dtype=np.uint8),cv2.IMREAD_COLOR)
        image=cv2.resize(image,(320,180))
        cv2.putText(image,f"#{item['index']}  {item['seconds']:.2f}s",(8,22),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,255,255),1)
        tiles.append(image)
    while len(tiles)%4:
        tiles.append(np.zeros_like(tiles[0]))
    sheet=np.vstack([np.hstack(tiles[i:i+4]) for i in range(0,len(tiles),4)])
    cv2.imencode('.jpg',sheet)[1].tofile(str(folder/'sheet.jpg'))
    return {'fps':fps,'totalFrames':len(scores),'durationSeconds':round(len(scores)/fps,4),'frames':selected,
            'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}


def transcode(source, target):
    capture=cv2.VideoCapture(str(source))
    fps=capture.get(cv2.CAP_PROP_FPS)
    width=int(capture.get(cv2.CAP_PROP_FRAME_WIDTH));height=int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer=cv2.VideoWriter(str(target),cv2.VideoWriter_fourcc(*'mp4v'),fps,(width,height))
    if not writer.isOpened():
        raise ValueError('MP4 writer unavailable')
    try:
        while True:
            ok,frame=capture.read()
            if not ok:break
            writer.write(frame)
    finally:
        writer.release();capture.release()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('data/LSC-54/RawVideos/Videos Courtesy'))
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    rng=random.Random(20261029)
    jobs=[]
    counts={}
    for label,name in CLASSES.items():
        paths=sorted(root.glob(f'*/Cordialidad/{name}/*.avi'))
        if not paths:raise ValueError(f'Missing class {name}')
        counts[label]=len(paths)
        for source in paths:
            jobs.append({'id':f'clip-{len(jobs)+1:04}', 'expected':label,'source':source.relative_to(root).as_posix(),'scope':'closed','kind':'frames'})
    excluded=sorted({p.parent.name for p in root.glob('*/Cordialidad/*/*.avi')}-set(CLASSES.values()))
    negative_word=rng.choice(excluded)
    source=rng.choice(sorted(root.glob(f'*/Cordialidad/{negative_word}/*.avi')))
    negative={'id':'outside-0001','expected':'otra','word':negative_word,'source':source.relative_to(root).as_posix(),'scope':'closed','kind':'frames'}
    inputs=jobs+[negative]
    def prepare(item):
        metadata=extract(root/item['source'],out/'samples'/item['id'])
        return {**item,**metadata}
    samples=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for sample in pool.map(prepare,inputs):
            samples.append(sample)
            if len(samples)%25==0:print(f'Extracted {len(samples)}/{len(inputs)}',flush=True)
    by_id={s['id']:s for s in samples}
    tasks=[{'sampleId':s['id'],'expected':s['expected'],'scope':'closed','kind':'frames'} for s in samples]
    tasks.append({'sampleId':negative['id'],'expected':negative_word,'scope':'open','kind':'frames'})
    comparison=rng.sample(samples[:-1],2)
    for sample in comparison+[by_id[negative['id']]]:
        transcode(root/sample['source'],out/'samples'/sample['id']/'full.mp4')
        tasks.append({'sampleId':sample['id'],'expected':sample['expected'],'scope':'closed','kind':'video'})
    tasks.append({'sampleId':negative['id'],'expected':negative_word,'scope':'open','kind':'video'})
    for index,task in enumerate(tasks):task['id']=f'test-{index+1:04}'
    manifest={'createdAt':datetime.now(timezone.utc).isoformat(),'seed':20261029,'root':str(root),'selection':'12 chronological frames: six temporal anchors + six cumulative-motion quantiles; active range threshold 12% of peak with two-frame padding; fill unique indices; no ML',
              'counts':counts,'negativeWord':negative_word,'negativeSource':negative['source'],'samples':samples,'tasks':tasks}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'counts':counts,'samples':len(samples),'tasks':len(tasks),'negativeWord':negative_word,'negativeSource':negative['source'],'output':str(out)},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
