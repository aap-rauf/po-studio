const el = id => document.getElementById(id);
const message = text => el('status').textContent=text;
const params = new URLSearchParams(location.hash.slice(1));
let prior;
try { prior=JSON.parse(localStorage.getItem('po-scanner-device')); } catch {}
const device = params.has('url') ? {url:params.get('url'),write:params.get('key'),store:params.get('store'),name:params.get('name'),po:params.get('po')} : prior;
const pairingHint = "Scan the QR code under Phone scans on your desktop to save items to a store.";
let paired=false;
async function init(){
  if(!device || !ScanService.validUrl(device.url) || !device.write || !device.store || !device.name || !/^[0-9a-f]{16}$/.test(device.po)) { el('add').disabled=true; message(pairingHint);return; }
  paired=true;
  localStorage.setItem('po-scanner-device',JSON.stringify(device));
  history.replaceState(null,'',location.pathname);
  el('store').textContent=device.name;el('newItem').disabled=false;renderItems();loadNames();
  flush();
}
const prefix='po-send-'+(device?.url||'')+'-';
let sending=false;
function keys(){return Object.keys(localStorage).filter(k=>k.startsWith(prefix));}
async function flush(){
  if(sending || !device)return;
  sending=true;
  try {
    for(const key of keys()){
      const scan=JSON.parse(localStorage.getItem(key));
      const result=await ScanService.request(device.url,{...scan,action:'submit',key:device.write});
      if(result.id!==scan.id) throw Error('Missing receipt.');
      localStorage.setItem(historyPrefix+scan.id,JSON.stringify(scan));localStorage.removeItem(key);renderItems();
      message('Saved to sheet · '+scan.barcode+' × '+scan.qty);
    }
  } catch(error){message('Scan pending. '+error.message);}
  finally{sending=false;const n=keys().length;el('pending').textContent=n?n+' pending on this phone':'';el('retry').hidden=!n;}
}
el('scanForm').onsubmit=event=>{
  event.preventDefault();
  if(!paired){message(pairingHint);return;}
  const barcode=el('barcode').value.trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+-]{0,127}$/.test(barcode)){message('Enter a valid product barcode.');return;}
  const scan={id:device.po+crypto.randomUUID().replaceAll('-','').slice(-20),store:device.store,time:Date.now(),barcode,qty:Number(el('qty').value)};
  try {localStorage.setItem(prefix+scan.id,JSON.stringify(scan));}catch{message('Phone storage is full. Scan was not saved.');return;}
  el('barcode').value='';el('qty').value='1';message('Queued on phone.');renderItems();leave();flush();
};
el('retry').onclick=flush;window.addEventListener('online',flush);setInterval(()=>{if(keys().length)flush();},30000);
const historyPrefix='po-scanned-'+(device?.url||'')+'-';
const names=new Map();
async function loadNames(){
  try {
    let saved=JSON.parse(localStorage.getItem('po-studio-admin-inventory'));
    if(saved?.encoding==='json') saved=JSON.parse(saved.data);
    if(saved?.encoding==='gzip-base64'){
      const bytes=Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0));
      saved=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    }
    for(const [codes,,name,,,store] of saved?.records||[]){
      if(store && store!==device.store)continue;
      for(const code of String(codes).split(/[,;|\n]+/)){const k=code.trim();if(k)names.set(k,names.has(k)&&names.get(k)!==name?'':name);}
    }
  } catch {}
  renderItems();
}
function renderItems(){
  const all=new Map(), groups=new Map();
  for(const key of Object.keys(localStorage)){
    if(!device?.po || !(key.startsWith(prefix+device.po)||key.startsWith(historyPrefix+device.po)))continue;
    try{const row=JSON.parse(localStorage.getItem(key));if(row.store===device.store)all.set(row.id,row);}catch{}
  }
  for(const row of [...all.values()].sort((a,b)=>(b.time||0)-(a.time||0))){
    groups.set(row.barcode,(groups.get(row.barcode)||0)+row.qty);
  }
  const list=el('items');list.replaceChildren();let units=0;
  for(const [barcode,qty] of groups){
    const li=document.createElement('li'), detail=document.createElement('div'),title=document.createElement('strong'),count=document.createElement('b');
    const name=names.get(barcode);title.textContent=name||barcode;detail.append(title);
    if(name){const label=document.createElement('small');label.textContent=barcode;detail.append(label);}
    count.textContent='× '+qty;li.append(detail,count);list.append(li);units+=qty;
  }
  el('empty').hidden=groups.size>0;el('units').textContent=units?units+' units':'';
}
function page(form){
  el('formPage').hidden=!form;el('listPage').hidden=form;el('back').hidden=!form;
  if(form){el('scanForm').reset();updateQuantityButtons();message(paired?'':pairingHint);}
  else {stopCamera();renderItems();}
}
function leave(){if(history.state?.scanForm)history.back();else page(false);}
el('newItem').onclick=()=>{page(true);history.pushState({scanForm:true},'');};
el('cancel').onclick=leave;el('back').onclick=leave;
window.addEventListener('popstate',()=>page(Boolean(history.state?.scanForm)));
const quantity = el('qty');
function updateQuantityButtons(){
  el('minus').disabled = quantity.valueAsNumber <= Number(quantity.min);
  el('plus').disabled = quantity.valueAsNumber >= Number(quantity.max);
}
quantity.addEventListener('input', updateQuantityButtons);
for(const [id,step] of [['minus','stepDown'],['plus','stepUp']]){
  el(id).onclick=()=>{
    quantity[step]();
    quantity.dispatchEvent(new Event('input',{bubbles:true}));
  };
}
let camera,startPromise;
async function stopCamera(){
  const current=camera;if(!current)return;
  camera=null;el('cameraBtn').disabled=true;
  try{await startPromise;if(current.isScanning)await current.stop();current.clear();}catch{}
  finally{el('cameraBtn').disabled=false;el('cameraBtn').setAttribute('aria-label','Scan barcode with camera');}
}
el('cameraBtn').onclick=async()=>{
  if(camera){await stopCamera();return;}
  const btn=el('cameraBtn');btn.disabled=true;
  try{
    const current=camera=new Html5Qrcode('camera');
    startPromise=current.start({facingMode:'environment'},{fps:8},async value=>{
      if(camera!==current || el('formPage').hidden)return;
      el('barcode').value=value;await stopCamera();
      if(!el('formPage').hidden){el('qty').focus();el('qty').select();}
    });
    await startPromise;
    if(camera===current)btn.setAttribute('aria-label','Close camera');
  }catch{camera=null;message('Camera unavailable. Allow camera access or type the barcode.');}
  finally{btn.disabled=false;}
};
window.addEventListener('pagehide',stopCamera);
init().catch(e=>message(e.message));