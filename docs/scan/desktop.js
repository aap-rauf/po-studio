function setupPhoneInbox({currentStore, storeLabel, session, apply, alreadyAdded, recover, notify}) {
  const el = id => document.getElementById(id);
  const dialog = el('sheetInbox');
  const status = text => el('sheetStatus').textContent = text;
  let config = JSON.parse(localStorage.getItem('po-scan-config') || 'null');
  let active = '', cursor = 1, busy = false;
  const applied = new Set();
  const pending = new Map();

  function showPairing() {
    const token = session(true);
    const url = new URL('https://aap-rauf.github.io/po-studio/scan/');
    url.hash = new URLSearchParams({url:config.url,key:config.write,store:currentStore(),name:storeLabel(),po:token});
    const qr = qrcode(0,'M');
    qr.addData(url.href);
    qr.make();
    el('sheetQr').innerHTML = qr.createSvgTag({cellSize:4,margin:16,scalable:true});
    el('sheetPhoneLink').href = url.href;
    el('sheetTitle').textContent = storeLabel();
    el('sheetSetup').hidden = true;
    el('sheetConnected').hidden = false;
    status('Scan to send items to this PO.');
    pull();
  }
  el('sheetOpen').onclick = () => {
    if (!currentStore()) { notify('Select a store before connecting a phone.'); el('storeSearch').focus(); return; }
    if (config) showPairing();
    else {
      el('sheetSetup').hidden = false;
      el('sheetSetup').open = true;
      el('sheetConnected').hidden = true;
      status('Connect this desktop once to enable scanning.');
    }
    dialog.showModal();
  };
  el('sheetSaveConfig').onclick = async () => {
    try {
      const candidate = JSON.parse(el('sheetConfig').value);
      if (!candidate.read || !candidate.write) throw Error('Paste the complete connection details.');
      await ScanService.request(candidate.url,{action:'read',key:candidate.read,after:1});
      localStorage.setItem('po-scan-config',JSON.stringify(candidate));
      config = candidate;
      el('sheetConfig').value = '';
      showPairing();
    } catch (error) { status(error.message); }
  };
  el('recoverPhone').onclick=()=>{
    const token=el('recoverCode').value.trim().toLowerCase();
    if(!/^[0-9a-f]{16}$/.test(token)){status('Enter the 16-character code shown on the phone.');return;}
    try{recover(token);showPairing();}catch(error){status(error.message);}
  };
  function issue(text){
    el('phoneIssue').textContent=text;
    el('phoneIssue').hidden=!text;
  }
  async function pull() {
    const token = session(false), store = currentStore();
    if (!config || !token || !store){issue('');return;}
    if(busy || document.hidden)return;
    if (active !== token) { active = token; cursor = 1; applied.clear(); pending.clear(); }
    busy = true;
    try {
      let page;
      do {
        page = await ScanService.request(config.url,{action:'read',key:config.read,after:cursor});
        if (token !== session(false) || store !== currentStore()) return;
        for (const row of page.rows) {
          if (row[2] === store && row[0].startsWith(token)) pending.set(row[0],row);
        }
        cursor = page.after;
      } while (page.more);
      for (const [id,row] of pending) {
        if (applied.has(id) || alreadyAdded(id) || apply(row)) { applied.add(id); pending.delete(id); }
      }
      issue(pending.size?'Phone scan awaiting a catalog match: '+pending.values().next().value[3]:'');
      status(pending.size ? pending.size+' unmatched scan(s). Check the product catalog.' : 'Ready for phone scans.');
    } catch (error) { issue('Phone sync paused. Open Phone scans for details.');status('Sync paused. Retrying automatically. '+error.message); }
    finally { busy = false; }
  }
  setInterval(pull,6000);
  document.addEventListener('visibilitychange',pull);
}