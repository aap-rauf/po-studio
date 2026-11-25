const ScanService = {
  validUrl(url) { return typeof url === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url); },
  async request(url, body) {
    if (!this.validUrl(url)) throw Error('Use the Apps Script web app URL ending in /exec.');
    const response = await fetch(url,{method:'POST',credentials:'omit',body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('Could not reach the scan sheet.');
    let result;
    try { result=await response.json(); } catch { throw Error('Check the web app deployment and its access setting.'); }
    if(result.error) throw Error(result.error);
    return result;
  }
};
function csvRows(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);return rows}
