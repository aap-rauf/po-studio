function setupPhoneInbox({currentStore, apply, alreadyAdded}) {
  const byId=id=>document.getElementById(id);
  const dialog=byId('sheetInbox');
  const status=text=>byId('sheetStatus').textContent=text;
  let config=JSON.parse(localStorage.getItem('po-scan-config')||'null');
  let cursor=1, scans=[], busy=false;
  function showConfig(){
    byId('sheetSetup').open=!config;
    byId('sheetConnected').hidden=!config;
    if(!config)return;
    const url=new URL('https://aap-rauf.github.io/po-studio/scan/');
    url.hash=new URLSearchParams({url:config.url,key:config.write});
    byId('sheetPhoneLink').href=url.href;
    const qr=qrcode(0,'M');
    qr.addData(url.href);
    qr.make();
    byId('sheetQr').innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
  }
  function renderList(){
    const store=currentStore();
    const list=byId('sheetRows');
    list.replaceChildren();
    if(!store){byId('sheetCount').textContent='Select a store on the PO to view its scans.';return;}
    const rows=scans.filter(row=>row[2]===store && !alreadyAdded(row[0]));
    byId('sheetCount').textContent=rows.length+' waiting for this store';
    for(const row of rows.slice(0,100)){
      const li=document.createElement('li');
      const action=document.createElement('button');
      action.className='btn';
      action.textContent='Add to PO';
      action.onclick=()=>{
        const result=apply(row);
        status(result?'Added to this PO. Save the draft to keep it.':'Check the selected store and product catalog.');
        renderList();
      };
      li.append(document.createTextNode(row[3]+' × '+row[4]+'  '),action);
      list.append(li);
    }
  }
  async function pull(){
    if(!config || busy || !dialog.open || document.hidden)return;
    busy=true;
    const active=config;
    try{
      let page;
      do {
        page=await ScanService.request(active.url,{action:'read',key:active.read,after:cursor});
        if(config!==active)return;
        if(!Array.isArray(page.rows))throw Error('Invalid sheet response.');
        scans=scans.concat(page.rows);cursor=page.after;
      }while(page.more && dialog.open);
      renderList();
      status('Updated '+new Date().toLocaleTimeString());
    }catch(e){status(e.message);}finally{busy=false;}
  }
  byId('sheetOpen').onclick=()=>{dialog.showModal();showConfig();renderList();pull();};
  byId('sheetRefresh').onclick=pull;
  byId('sheetSaveConfig').onclick=async()=>{
    try {
      const candidate=JSON.parse(byId('sheetConfig').value);
      if(!candidate.read||!candidate.write||!ScanService.validUrl(candidate.url))throw Error('Paste the connection details from the sheet.');
      await ScanService.request(candidate.url,{action:'read',key:candidate.read,after:1});
      localStorage.setItem('po-scan-config',JSON.stringify(candidate));
      config=candidate;cursor=1;scans=[];byId('sheetConfig').value='';
      showConfig();pull();
    }catch(e){status(e instanceof SyntaxError?'Paste the complete connection details from the sheet.':e.message);}
  };
  setInterval(pull,20000);
}