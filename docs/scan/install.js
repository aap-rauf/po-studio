if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
const installButton=document.getElementById('install');
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installButton.hidden=false;
  installButton.onclick=async()=>{await event.prompt();installButton.hidden=true;};
});
if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) document.getElementById('installHelp').hidden=false;