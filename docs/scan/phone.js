const el = id => document.getElementById(id);
const message = text => el('status').textContent=text;
const params = new URLSearchParams(location.hash.slice(1));
let prior;
try { prior=JSON.parse(localStorage.getItem('po-scanner-device')); } catch {}
const device = params.has('url') ? {url:params.get('url'),write:params.get('key'),store:params.get('store'),name:params.get('name'),po:params.get('po')} : prior;
const pairingHint = "Scan the QR code under Phone scans on your desktop to save items to a store.";
let paired=false;
el('copyCode').onclick=async()=>{
  try{await navigator.clipboard.writeText(device.po);el('copyResult').textContent='Code copied.';}
  catch{const range=document.createRange();range.selectNodeContents(el('pairCode'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);el('copyResult').textContent='Code selected. Use Copy on your device.';}
};
async function init(){
  if(!device || !ScanService.validUrl(device.url) || !device.write || !device.store || !device.name || !/^[0-9a-f]{16}$/.test(device.po)) { el('add').disabled=true; message(pairingHint);return; }
  paired=true;el('pairDetails').hidden=false;el('pairCode').textContent=device.po;
  localStorage.setItem('po-scanner-device',JSON.stringify(device));
  history.replaceState(null,'',location.pathname);
  el('store').textContent=device.name;el('newItem').disabled=false;renderItems();loadNames();
  flush();
}
const prefix='po-send-'+(device?.url||'')+'-';
let sending=false;
function keys(){return Object.keys(localStorage).filter(k=>k.startsWith(prefix));}
function keysForReceipt(){
  return Object.keys(localStorage).some(key=>key.startsWith(historyPrefix+device.po));
}
function updateSyncState(){
  const pending=keys().filter(key=>key.startsWith(prefix+device?.po)).length;
  let state='Unpaired';
  if(paired){
    if(!navigator.onLine)state=pending?'Offline · '+pending+' pending':'Offline';
    else if(pending)state=sending?'Syncing…':pending+' pending';
    else state=keysForReceipt()?'Sent to sheet':'Ready';
  }
  el('syncState').textContent=state;
}
window.addEventListener('offline',updateSyncState);
async function flush(){
  if(sending || !device)return;
  sending=true;updateSyncState();
  try {
    for(const key of keys().sort((a,b)=>JSON.parse(localStorage.getItem(a)).time-JSON.parse(localStorage.getItem(b)).time)){
      const scan=JSON.parse(localStorage.getItem(key));
      const result=await ScanService.request(device.url,{...scan,action:'submit',key:device.write});
      if(result.id!==scan.id) throw Error('Missing receipt.');
      localStorage.setItem(historyPrefix+scan.id,JSON.stringify(scan));localStorage.removeItem(key);renderItems();
      if(el('status').textContent.startsWith('Scan pending.'))message('');
    }
  } catch(error){message('Scan pending. '+error.message);}
  finally{sending=false;updateSyncState();const n=keys().length;el('pending').textContent=n?n+' pending on this phone':'';el('retry').hidden=!n;}
}
el('scanForm').onsubmit=event=>{
  event.preventDefault();
  if(!paired){message(pairingHint);return;}
  const barcode=el('barcode').value.trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+-]{0,127}$/.test(barcode)){message('Enter a valid product barcode.');return;}
  const qty=Number(el('qty').value);
  if(!/^[0-9]{1,6}$/.test(el('qty').value)||qty<1){message('Enter a quantity from 1 to 999999.');return;}
  const delta=qty-(editing ? balances().get(editing)||0 : 0);
  if(!queueChange(barcode,delta))return;
  if(editing)leave();
  else {
    page(true);el('saveReceipt').textContent='Saved on phone · '+(names.get(barcode)||barcode)+' × '+qty;
    el('saveReceipt').hidden=false;el('barcode').focus();
  }
  flush();
};
let editing=null,selecting=false;
const selected=new Set();
function queueChange(barcode,delta){
  try {
    while(delta){
      const qty=Math.min(999999,Math.abs(delta));
      const random=crypto.randomUUID().replaceAll('-','');
      // A dash after the PO token marks a subtraction in the append-only scan sheet.
      const id=device.po+(delta<0?'-'+random.slice(-19):random.slice(-20));
      const row={id,store:device.store,time:Date.now(),barcode,qty};
      localStorage.setItem(prefix+id,JSON.stringify(row));
      delta-=Math.sign(delta)*qty;
    }
    return true;
  }catch{message('Phone storage is full. Check the item list before retrying.');renderItems();return false;}
}
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
function balances(){
  const all=new Map(), groups=new Map();
  for(const key of Object.keys(localStorage)){
    if(!device?.po || !(key.startsWith(prefix+device.po)||key.startsWith(historyPrefix+device.po)))continue;
    try{const row=JSON.parse(localStorage.getItem(key));if(row.store===device.store)all.set(row.id,row);}catch{}
  }
  for(const row of [...all.values()].sort((a,b)=>(b.time||0)-(a.time||0))){
    groups.set(row.barcode,(groups.get(row.barcode)||0)+(row.id[16]==='-'?-row.qty:row.qty));
  }
  for(const [code,qty] of groups)if(qty<=0)groups.delete(code);
  return groups;
}
function renderItems(){
  const groups=balances();
  const list=el('items');list.replaceChildren();
  for(const [barcode,qty] of groups){
    const li=document.createElement('li'), detail=document.createElement('div'),title=document.createElement('strong'),count=document.createElement('b');
    const name=names.get(barcode);title.textContent=name||barcode;detail.append(title);
    if(name){const label=document.createElement('small');label.textContent=barcode;detail.append(label);}
        const button=document.createElement('button');button.className='itemRow';
    if(selecting){
      button.setAttribute('aria-pressed',String(selected.has(barcode)));
      const mark=document.createElement('span');mark.textContent=selected.has(barcode)?'☑':'☐';button.append(mark);
    }
    let timer, startX, startY, held=false;
    function selectRow(){
      selecting=true;selected.add(barcode);renderItems();
    }
    button.onpointerdown=e=>{
      if(e.button!==0 || !e.isPrimary)return;
      held=false;startX=e.clientX;startY=e.clientY;
      timer=setTimeout(()=>{if(button.isConnected){held=true;selectRow();}},500);
    };
    button.onpointermove=e=>{
      if(Math.hypot(e.clientX-startX,e.clientY-startY)>10)clearTimeout(timer);
    };
    button.onpointercancel=button.onpointerleave=button.onpointerup=()=>clearTimeout(timer);
    button.oncontextmenu=e=>{e.preventDefault();clearTimeout(timer);if(!held){held=true;selectRow();}};
    button.onkeydown=e=>{
      if(e.key==='F10' && e.shiftKey){e.preventDefault();selectRow();el('selectAll').focus();}
    };
    button.onclick=()=>{
      if(held){held=false;return;}
      if(selecting){if(selected.has(barcode))selected.delete(barcode);else selected.add(barcode);renderItems();}
      else openForm(barcode);
    };
    count.textContent='× '+qty;button.append(detail,count);li.append(button);list.append(li);
  }
  if(!groups.size){selecting=false;selected.clear();}
  el('selectionBar').hidden=!selecting;el('selectMode').hidden=!selecting;
  el('selectAll').hidden=!selecting;el('deleteSelected').hidden=!selecting;
  el('deleteSelected').disabled=!selected.size;
  el('empty').hidden=groups.size>0;el('itemCount').textContent=groups.size+(groups.size===1?' item':' items');updateSyncState();
}
function removeCodes(codes){
  const totals=balances();
  if(!confirm('Delete '+codes.length+' selected item'+(codes.length===1?'':'s')+' from this order?'))return false;
  for(const code of codes)if(!queueChange(code,-(totals.get(code)||0)))return false;
  selecting=false;selected.clear();renderItems();flush();return true;
}
el('selectMode').onclick=()=>{selecting=!selecting;selected.clear();renderItems();};
el('selectAll').onclick=()=>{for(const code of balances().keys())selected.add(code);renderItems();};
el('deleteSelected').onclick=()=>removeCodes([...selected]);
el('deleteItem').onclick=()=>{if(editing && removeCodes([editing]))leave();};
function page(form,code=null){
  el('saveReceipt').hidden=true;editing=form?code:null;
  el('formPage').hidden=!form;el('listPage').hidden=form;el('back').hidden=!form;
  if(form){
    el('scanForm').reset();el('formTitle').textContent=editing?'Edit item':'Add item';el('add').textContent=editing?'Save changes':'Save & add next';
    el('barcode').readOnly=Boolean(editing);el('cameraBtn').hidden=Boolean(editing);
    el('deleteItem').hidden=!editing;
    if(editing){el('barcode').value=editing;el('qty').value=balances().get(editing);}
    updateQuantityButtons();message(paired?'':pairingHint);
  }else{stopCamera();renderItems();}
}
function openForm(code=null){page(true,code);history.pushState({scanForm:true,code},'');}
function leave(){if(history.state?.scanForm)history.back();else page(false);}
el('newItem').onclick=()=>openForm();
el('cancel').onclick=leave;el('back').onclick=leave;
window.addEventListener('popstate',()=>page(Boolean(history.state?.scanForm),history.state?.code));
const quantity=el('qty');
function updateQuantityButtons(){
  el('minus').disabled=Number(quantity.value)<=1;el('plus').disabled=Number(quantity.value)>=999999;
}
quantity.addEventListener('beforeinput',e=>{if(e.data && /[^0-9]/.test(e.data))e.preventDefault();});
quantity.addEventListener('paste',e=>{if(/[^0-9]/.test(e.clipboardData.getData('text')))e.preventDefault();});
quantity.addEventListener('input',()=>{quantity.value=quantity.value.replace(/[^0-9]/g,'');updateQuantityButtons();});
for(const [id,delta] of [['minus',-1],['plus',1]])el(id).onclick=()=>{
  quantity.value=Math.min(999999,Math.max(1,Number(quantity.value)+delta));updateQuantityButtons();
};
const viewer=el('viewfinder');
let reader=null,starting,facing='environment',light=false;
async function stopCamera(){
  const current=reader;reader=null;
  if(viewer.open)viewer.close();
  if(!current)return;
  el('cameraBtn').disabled=true;
  try{await starting;if(current.isScanning)await current.stop();current.clear();}catch{}
  finally{el('cameraBtn').disabled=false;}
}
async function startCamera(){
  if(reader)return;
  viewer.showModal();el('torch').hidden=true;el('flip').hidden=true;light=false;
  try{
    const current=reader=new Html5Qrcode('camera');
    starting=current.start({facingMode:facing},{fps:10},async code=>{
      if(reader!==current)return;
      el('barcode').value=code;await stopCamera();quantity.focus();quantity.select();
    });
    await starting;
    if(reader!==current)return;
    const track=el('camera').querySelector('video')?.srcObject?.getVideoTracks()[0];
    el('torch').hidden=!track?.getCapabilities?.().torch;
    el('torch').setAttribute('aria-pressed','false');
    const devices=await navigator.mediaDevices.enumerateDevices();
    el('flip').hidden=devices.filter(d=>d.kind==='videoinput').length<2;
  }catch{await stopCamera();message('Camera unavailable. Allow camera access or type the barcode.');}
}
el('cameraBtn').onclick=startCamera;
el('closeCamera').onclick=stopCamera;
viewer.addEventListener('cancel',e=>{e.preventDefault();stopCamera();});
el('flip').onclick=async()=>{await stopCamera();facing=facing==='environment'?'user':'environment';await startCamera();};
el('torch').onclick=async()=>{
  try{await reader.applyVideoConstraints({advanced:[{torch:!light}]});light=!light;el('torch').setAttribute('aria-pressed',String(light));}
  catch{el('torch').hidden=true;}
};
window.addEventListener('pagehide',stopCamera);
init().catch(e=>message(e.message));
