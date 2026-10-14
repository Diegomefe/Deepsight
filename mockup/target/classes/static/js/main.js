/* Interactive mockup only: no network calls, diagnosis or model inference. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const PATCH = 128;
    const candidates = [{index:36, score:.87}, {index:52, score:.74}, {index:67, score:.62}];
    const original = document.createElement('canvas');
    const source = original.getContext('2d', {willReadFrequently:true});
    const canvas = $('mammogram');
    const ctx = canvas.getContext('2d');
    let demo = true, selected = 36, cols = 8, rows = 12, zoom = 1, processed = false, loading = false;
    const label = index => `P-${String(index + 1).padStart(3, '0')}`;
    const region = index => {
        const x = (index % cols) * PATCH, y = Math.floor(index / cols) * PATCH;
        return {x, y, w:Math.min(PATCH, original.width-x), h:Math.min(PATCH, original.height-y)};
    };
    function feedback(message, error = false) {
        $('feedback').textContent = message;
        $('feedback').classList.toggle('error', error);
        $('feedback').hidden = !message;
    }
    function createSyntheticImage() {
        original.width = 1024; original.height = 1536;
        const image = source.createImageData(original.width, original.height);
        let seed = 18271;
        const random = () => {seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296;};
        for (let y=0; y<1536; y++) {
            for (let x=0; x<1024; x++) {
                const u=x/1024, v=y/1536;
                const boundary = .10 + .77*Math.pow(Math.max(0, Math.sin(Math.PI*(v*.94+.03))), .7);
                const edge = Math.max(0, Math.min(1,(boundary-u)*45));
                const density = Math.exp(-((u-.42)**2/.07+(v-.43)**2/.16));
                const waves = Math.sin(u*60+v*24+Math.sin(v*47)*1.8)*Math.sin(v*89-u*21);
                const fine = Math.sin(x*.15+y*.05)*Math.cos(y*.12-x*.02);
                const tissue = 44+120*density+waves*18*density+fine*9+(random()-.5)*30;
                const g = Math.max(0,Math.min(255, tissue*edge + 8*(1-edge)));
                const p=(y*1024+x)*4; image.data[p]=g; image.data[p+1]=g; image.data[p+2]=g; image.data[p+3]=255;
            }
        }
        source.putImageData(image,0,0);
        source.save();
        source.globalCompositeOperation='screen';
        for(let i=0;i<65;i++) {
            const start=130+random()*650, end=350+random()*690;
            source.beginPath(); source.moveTo(15,start); source.bezierCurveTo(240,start+30,440,end,640+random()*65,end+130);
            source.strokeStyle=`rgba(210,215,216,${.025+random()*.035})`; source.lineWidth=.5+random()*2.5; source.stroke();
        }
        for (const c of candidates) {
            const r=region(c.index);
            for(let i=0;i<8;i++) {
                const x=r.x+32+random()*65,y=r.y+28+random()*65;
                const g=source.createRadialGradient(x,y,0,x,y,5);g.addColorStop(0,'rgba(250,250,245,.88)');g.addColorStop(1,'rgba(240,240,230,0)');source.fillStyle=g;source.fillRect(x-5,y-5,10,10);
            }
        }
        source.restore();
    }
    function fit() {
        const viewport=$('imageViewport');
        const ratio=Math.min(viewport.clientWidth/original.width,viewport.clientHeight/original.height);
        $('imageStage').style.width=`${Math.round(original.width*ratio*zoom)}px`;
        $('imageStage').style.height=`${Math.round(original.height*ratio*zoom)}px`;
        $('zoomValue').value=`${Math.round(zoom*100)}%`;
        $('zoomOut').disabled=zoom<=1; $('zoomIn').disabled=zoom>=3;
    }
    function drawImage() {
        canvas.width=original.width; canvas.height=original.height;
        ctx.filter=processed?'contrast(1.35) brightness(1.05)':'none';
        ctx.drawImage(original,0,0);ctx.filter='none';
        if(demo && $('heatToggle').checked) {
            for(const c of candidates) {
                const r=region(c.index), x=r.x+64,y=r.y+64;
                const gradient=ctx.createRadialGradient(x,y,0,x,y,170);
                gradient.addColorStop(0,'rgba(237,110,49,.68)');gradient.addColorStop(.3,'rgba(242,194,83,.50)');gradient.addColorStop(.65,'rgba(69,153,178,.28)');gradient.addColorStop(1,'rgba(49,109,163,0)');
                ctx.fillStyle=gradient;ctx.fillRect(x-170,y-170,340,340);
            }
        }
        $('imageMode').textContent=processed?'PROCESADA · CONTRASTE ILUSTRATIVO':'ORIGINAL';
        $('heatLegend').hidden=!(demo && $('heatToggle').checked);
        $('originalView').classList.toggle('selected',!processed);$('processedView').classList.toggle('selected',processed);
        $('originalView').setAttribute('aria-pressed',String(!processed));$('processedView').setAttribute('aria-pressed',String(processed));
    }
    function buildGrid() {
        cols=Math.ceil(original.width/PATCH); rows=Math.ceil(original.height/PATCH);
        const grid=$('patchGrid');grid.replaceChildren();
        // Last-row/column widths follow the actual image crop, including partial patches.
        grid.style.gridTemplateColumns=Array.from({length:cols},(_,i)=>`${Math.min(PATCH,original.width-i*PATCH)}fr`).join(' ');
        grid.style.gridTemplateRows=Array.from({length:rows},(_,i)=>`${Math.min(PATCH,original.height-i*PATCH)}fr`).join(' ');
        const fragment=document.createDocumentFragment();
        for(let i=0;i<cols*rows;i++) {
            const button=document.createElement('button');button.className='patch-cell';button.type='button';
            button.dataset.index=i;button.dataset.short=label(i);button.setAttribute('aria-label',`Seleccionar patch ${label(i)}`);
            button.setAttribute('aria-pressed','false');button.tabIndex=-1;
            if(demo && candidates.some(c=>c.index===i)) button.classList.add('candidate');
            button.addEventListener('click',()=>selectPatch(i));
            button.addEventListener('keydown',event=>{
                const offset={ArrowRight:1,ArrowLeft:-1,ArrowDown:cols,ArrowUp:-cols}[event.key];
                if(offset){event.preventDefault();selectPatch(Math.max(0,Math.min(cols*rows-1,i+offset)));grid.children[selected].focus();}
            });fragment.append(button);
        }
        grid.append(fragment);$('patchCount').innerHTML=`${cols*rows} <span>regiones</span>`;
        $('viewerHint').textContent=`Malla ${cols} × ${rows} · ${PATCH} × ${PATCH} px${original.width%PATCH||original.height%PATCH?' · bordes parciales':''}`;
        grid.classList.toggle('no-grid',!$('gridToggle').checked);grid.classList.toggle('no-candidates',!$('candidatesToggle').checked);
    }
    function drawCrop(target,index) {
        const r=region(index), c=target.getContext('2d');
        c.fillStyle='#10191e';c.fillRect(0,0,target.width,target.height);
        const scale=Math.min(target.width/r.w,target.height/r.h),w=r.w*scale,h=r.h*scale;
        c.drawImage(original,r.x,r.y,r.w,r.h,(target.width-w)/2,(target.height-h)/2,w,h);
    }
    function updateHistogram() {
        const r=region(selected),data=source.getImageData(r.x,r.y,r.w,r.h).data;
        const bins=new Array(64).fill(0);let sum=0,sumSquares=0;
        for(let i=0;i<data.length;i+=4){const value=Math.round(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);bins[Math.min(63,Math.floor(value/4))]++;sum+=value;sumSquares+=value*value;}
        const n=r.w*r.h,mean=sum/n;
        $('meanIntensity').textContent=mean.toFixed(1)+' / 255';$('stdIntensity').textContent=Math.sqrt(Math.max(0,sumSquares/n-mean*mean)).toFixed(1);
        const chart=$('histogram'),c=chart.getContext('2d');c.clearRect(0,0,chart.width,chart.height);
        c.strokeStyle='#e8efec';c.lineWidth=1;
        [35,70,105,139].forEach(y=>{c.beginPath();c.moveTo(0,y);c.lineTo(chart.width,y);c.stroke();});
        const max=Math.max(...bins,1),step=chart.width/bins.length;
        bins.forEach((value,i)=>{c.fillStyle=i>25&&i<44?'#6a9e8b':'#9ebcaf';const h=value/max*130;c.fillRect(i*step+1,139-h,step-2,h);});
        chart.setAttribute('aria-label',`Histograma de ${label(selected)}. Media ${mean.toFixed(1)} en escala de 0 a 255.`);
    }
    function selectPatch(index) {
        selected=Math.max(0,Math.min(cols*rows-1,index));
        [...$('patchGrid').children].forEach((button,i)=>{button.classList.toggle('selected',i===selected);button.setAttribute('aria-pressed',String(i===selected));button.tabIndex=i===selected?0:-1;});
        const r=region(selected);
        $('patchId').textContent=label(selected);$('selectedLabel').textContent=label(selected);$('patchSize').textContent=`${r.w} × ${r.h} px`;
        $('coordinates').textContent=`x: ${r.x} · y: ${r.y} · Origen: esquina superior izquierda`;
        $('patchPosition').textContent=`${selected+1} de ${cols*rows}`;
        $('previousPatch').disabled=selected===0;$('nextPatch').disabled=selected===cols*rows-1;
        drawCrop($('patchCanvas'),selected);updateHistogram();
        const score=demo?(candidates.find(c=>c.index===selected)?.score ?? (.08+(selected*17%29)/100)):null;
        $('scoreValue').textContent=score===null?'—':score.toFixed(2);$('scoreBar').style.width=score===null?'0%':`${score*100}%`;
        $('scoreCaption').textContent=demo?'Valor ilustrativo · No es una probabilidad de MCC':'No disponible · Modelo CNN no integrado';
        document.querySelectorAll('.candidate-item').forEach(button=>{button.classList.toggle('active',Number(button.dataset.index)===selected);button.setAttribute('aria-pressed',String(Number(button.dataset.index)===selected));});
    }
    function buildCandidates() {
        const list=$('candidateList');list.replaceChildren();
        $('candidateBadge').textContent=demo?'03':'—';$('candidateCount').innerHTML=demo?'3 <span>ilustrativos</span>':'— <span>sin análisis</span>';
        $('candidateDescription').textContent=demo?'Selección ilustrativa para recorrer el flujo de exploración.':'La imagen está disponible para explorar. Aún no se ha ejecutado un modelo.';
        $('candidateCaption').textContent=demo?'PUNTUACIONES DEL EJEMPLO':'INFERENCIA NO DISPONIBLE';
        if(!demo){const empty=document.createElement('p');empty.className='empty-candidates';empty.textContent='Sin resultados de inferencia. Esto no indica ausencia de regiones candidatas.';list.append(empty);return;}
        candidates.forEach((candidate,i)=>{
            const button=document.createElement('button');button.className='candidate-item';button.dataset.index=candidate.index;
            button.innerHTML=`<canvas width="128" height="128" aria-hidden="true"></canvas><span><strong>Región ${String(i+1).padStart(2,'0')}</strong><small>${label(candidate.index)} · Ilustrativa</small></span><span class="candidate-score">${candidate.score.toFixed(2)}</span><svg><use href="#i-arrow"/></svg>`;
            button.addEventListener('click',()=>{selectPatch(candidate.index);$('patchGrid').children[selected].scrollIntoView({block:'nearest',inline:'nearest'});});list.append(button);drawCrop(button.querySelector('canvas'),candidate.index);
        });
    }
    function resetDemo() {
        demo=true;processed=false;zoom=1;cols=8;rows=12;
        $('heatToggle').checked=false;$('heatToggle').disabled=false;$('candidatesToggle').disabled=false;$('candidatesToggle').checked=true;$('gridToggle').checked=true;
        createSyntheticImage();buildGrid();buildCandidates();drawImage();selectPatch(36);fit();feedback('');
        $('fileName').textContent='mamografia_demo.png';$('fileProperties').textContent='1024 × 1536 px · 8 bits · Escala de grises sintética';
        $('sidebarFile').innerHTML='Ejemplo de exploración<small>Imagen sintética</small>';
        $('analysisStatus').innerHTML='<span></span>Ejemplo listo';$('demoMessage').innerHTML='<b>Estás explorando un ejemplo.</b> Imagen sintética y resultados ilustrativos; no corresponden a un estudio clínico.';
        $('viewportMode').textContent='VISTA DE DEMOSTRACIÓN';$('watermark').textContent='DEEPSIGHT / EJEMPLO SINTÉTICO';
        document.querySelector('.orientation').hidden=false;canvas.setAttribute('aria-label','Imagen sintética de ejemplo con malla seleccionable');
    }
    async function loadFile(file) {
        if(!file||loading)return;
        loading=true;$('uploadButton').disabled=true;$('resetDemo').disabled=true;
        feedback('Validando PNG y preparando vista local…');
        let bitmap;
        try {
            if(file.size>20*1024*1024)throw new Error('El archivo supera el límite de 20 MB de esta vista previa.');
            const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),view=new DataView(buffer);
            const signature=[137,80,78,71,13,10,26,10];
            if(bytes.length<33||!signature.every((v,i)=>bytes[i]===v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('El archivo no es un PNG válido. Selecciona una imagen PNG sin daños.');
            const width=view.getUint32(16),height=view.getUint32(20),bits=bytes[24],type=bytes[25];
            if(!width||!height||width>4096||height>4096||width*height>8000000)throw new Error('Dimensiones no compatibles: máximo 4096 px por lado y 8 megapíxeles.');
            if(bits!==8||![0,2,3,4,6].includes(type))throw new Error(`PNG de ${bits} bits no compatible con esta vista previa. Utiliza un PNG de 8 bits.`);
            try{bitmap=await createImageBitmap(new Blob([buffer],{type:'image/png'}));}catch{throw new Error('No se pudo decodificar el PNG. El archivo puede estar dañado.');}
            if(bitmap.width!==width||bitmap.height!==height)throw new Error('Las dimensiones decodificadas no coinciden con el encabezado del archivo.');
            // Commit only after validation. Invalid files leave the previous study available.
            original.width=width;original.height=height;source.fillStyle='#000';source.fillRect(0,0,width,height);source.drawImage(bitmap,0,0);
            demo=false;processed=false;zoom=1;$('heatToggle').checked=false;$('heatToggle').disabled=true;$('candidatesToggle').checked=false;$('candidatesToggle').disabled=true;
            buildGrid();buildCandidates();drawImage();selectPatch(0);fit();
            const channels={0:'gris',2:'RGB',3:'paleta',4:'gris + alfa',6:'RGBA'}[type];
            $('fileName').textContent=file.name;$('fileProperties').textContent=`${width} × ${height} px · ${bits} bits · ${channels} → vista RGBA de 8 bits`;
            $('sidebarFile').textContent=file.name;$('analysisStatus').innerHTML='<span></span>Vista previa local';
            $('demoMessage').innerHTML='<b>Imagen local cargada.</b> Puedes explorar patches e histogramas. El modelo CNN y Grad-CAM aún no están integrados.';
            $('viewportMode').textContent='VISTA PREVIA · SIN INFERENCIA';$('watermark').textContent='DEEPSIGHT / ARCHIVO LOCAL';document.querySelector('.orientation').hidden=true;
            canvas.setAttribute('aria-label','Imagen PNG local con malla seleccionable');
            feedback('Vista lista. Original conservado; vista RGBA de 8 bits sobre fondo negro. Histograma de luminancia del patch. No se ha realizado inferencia.');
        } catch(error) {feedback(`${error.message} Se conserva la vista anterior.`,true);}
        finally {bitmap?.close();loading=false;$('uploadButton').disabled=false;$('resetDemo').disabled=false;$('imageInput').value='';}
    }
    function navigate(name) {
        document.querySelectorAll('.page-view').forEach(section=>section.hidden=section.id!==name);
        document.querySelectorAll('.nav-item').forEach(button=>{const active=button.dataset.view===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
        $('breadcrumb').textContent={exploracion:'Exploración',evaluacion:'Evaluación del modelo',configuracion:'Configuración'}[name];
        if(name==='exploracion')fit();
    }
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
    document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();navigate('exploracion');});
    $('uploadButton').addEventListener('click',()=>$('imageInput').click());$('imageInput').addEventListener('change',event=>loadFile(event.target.files[0]));
    $('resetDemo').addEventListener('click',resetDemo);
    $('previousPatch').addEventListener('click',()=>selectPatch(selected-1));$('nextPatch').addEventListener('click',()=>selectPatch(selected+1));
    $('gridToggle').addEventListener('change',()=> $('patchGrid').classList.toggle('no-grid',!$('gridToggle').checked));
    $('candidatesToggle').addEventListener('change',()=> $('patchGrid').classList.toggle('no-candidates',!$('candidatesToggle').checked));
    $('heatToggle').addEventListener('change',drawImage);
    $('originalView').addEventListener('click',()=>{processed=false;drawImage();});$('processedView').addEventListener('click',()=>{processed=true;drawImage();});
    $('zoomIn').addEventListener('click',()=>{zoom=Math.min(3,zoom+.25);fit();});$('zoomOut').addEventListener('click',()=>{zoom=Math.max(1,zoom-.25);fit();});
    $('fitView').addEventListener('click',()=>{zoom=1;fit();$('imageViewport').scrollTo(0,0);});
    new ResizeObserver(()=>{if(!$('exploracion').hidden)fit();}).observe($('imageViewport'));
    resetDemo();
})();
