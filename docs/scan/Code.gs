// Bind this script to a NEW, private Google spreadsheet.
const TAB = 'Phone scans';
const SOURCE = '1vtZ2Xmb4eKPFs_v-D-nVNAm2_d2TtqqaMFO93TtaKxM';
function onOpen() {
  SpreadsheetApp.getUi().createMenu('PO Studio').addItem('Connect desktop', 'setup').addToUi();
}
function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const p = PropertiesService.getScriptProperties();
  const url = ScriptApp.getService().getUrl();
  if (!url) throw Error('Deploy as a web app first.');
  if (book.getId() === SOURCE) throw Error('Use a separate private spreadsheet.');
  const sheet = book.getSheetByName(TAB) || book.insertSheet(TAB);
  if (!sheet.getLastRow()) sheet.appendRow(['Scan ID','Time','Store ID','Barcode','Quantity']);
  if (!p.getProperty('read')) p.setProperties({book:book.getId(),read:Utilities.getUuid()+Utilities.getUuid(),write:Utilities.getUuid()+Utilities.getUuid()});
  const config = {url:url,read:p.getProperty('read'),write:p.getProperty('write')};
  SpreadsheetApp.getUi().alert('Paste into PO Studio → Phone scans → Connect desktop. Keep this private.',JSON.stringify(config),SpreadsheetApp.getUi().ButtonSet.OK);
}
function doPost(event) {
  let result;
  try {
    const body = JSON.parse(event.postData.contents);
    const p = PropertiesService.getScriptProperties();
    const read = body.action === 'read';
    if (!body.key || body.key !== p.getProperty(read ? 'read':'write')) throw Error('Device access denied.');
    const sheet = SpreadsheetApp.openById(p.getProperty('book')).getSheetByName(TAB);
    if (read) {
      const after = Math.max(1,Number(body.after)||1);
      if (!Number.isSafeInteger(after)) throw Error('Invalid cursor.');
      const count = Math.min(500,Math.max(0,sheet.getLastRow()-after));
      result = {rows:count ? sheet.getRange(after+1,1,count,5).getDisplayValues():[], after:after+count, more:after+count<sheet.getLastRow()};
    } else {
      if (body.action !== 'submit' || !/^[0-9a-f-]{36}$/i.test(body.id) || !/^[\w-]{1,100}$/.test(body.store) || typeof body.barcode !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+-]{0,127}$/.test(body.barcode) || !Number.isSafeInteger(body.qty) || body.qty<1 || body.qty>999999) throw Error('Invalid scan.');
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const n = sheet.getLastRow();
        const exists = n>1 && sheet.getRange(2,1,n-1,1).createTextFinder(body.id).matchEntireCell(true).findNext();
        if (!exists) {
          sheet.getRange(n+1,1,1,5).setNumberFormat('@').setValues([[body.id,new Date().toISOString(),body.store,body.barcode,String(body.qty)]]);
          SpreadsheetApp.flush();
        }
      } finally { lock.releaseLock(); }
      result = {id:body.id};
    }
  } catch (error) { result = {error:String(error.message || error)}; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}