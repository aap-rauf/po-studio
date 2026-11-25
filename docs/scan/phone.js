const el = id => document.getElementById(id);
const message = text => el('status').textContent=text;
const params = new URLSearchParams(location.hash.slice(1));
const prior=JSON.parse(localStorage.getItem('po-scanner-device')||'null');
const device = params.has('url') ? {url:params.get('url'),write:params.get('key'),store:params.get('store'),name:params.get('name'),po:params.get('po')} : prior;
async function init(){
  if(!device || !ScanService.validUrl(device.url) || !device.write || !device.store || !device.name || !/^[0-9a-f]{16}$/.test(device.po)) { el('add').disabled=true; message('Scan the QR code in PO Studio → Phone scans.');return; }
  localStorage.setItem('po-scanner-device',JSON.stringify(device));
  history.replaceState(null,'',location.pathname);
  el('store').textContent=device.name;
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
      localStorage.removeItem(key);
      message('Saved to sheet · '+scan.barcode+' × '+scan.qty);
    }
  } catch(error){message('Scan pending. '+error.message);}
  finally{sending=false;const n=keys().length;el('pending').textContent=n?n+' pending on this phone':'';el('retry').hidden=!n;}
}
el('scanForm').onsubmit=event=>{
  event.preventDefault();
  const barcode=el('barcode').value.trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+-]{0,127}$/.test(barcode)){message('Enter a valid product barcode.');return;}
  const scan={id:device.po+crypto.randomUUID().replaceAll('-','').slice(-20),store:device.store,barcode,qty:Number(el('qty').value)};
  try {localStorage.setItem(prefix+scan.id,JSON.stringify(scan));}catch{message('Phone storage is full. Scan was not saved.');return;}
  el('barcode').value='';el('qty').value='1';message('Queued on phone.');flush();
};
el('retry').onclick=flush;window.addEventListener('online',flush);setInterval(()=>{if(keys().length)flush();},30000);
let camera,reading=false;
el('cameraBtn').onclick=async()=>{
  const btn=el('cameraBtn');btn.disabled=true;
  try{
    if(reading){await camera.stop();reading=false;btn.textContent='Scan barcode';return;}
    camera ||= new Html5Qrcode('camera');
    await camera.start({facingMode:'environment'},{fps:8},async value=>{
      if(!reading)return;reading=false;
      el('barcode').value=value;
      try{await camera.stop();}finally{btn.textContent='Scan barcode';el('qty').focus();el('qty').select();}
    });reading=true;btn.textContent='Close camera';
  }catch{message('Camera unavailable. Allow camera access or type the barcode.');}finally{btn.disabled=false;}
};
init().catch(e=>message(e.message));