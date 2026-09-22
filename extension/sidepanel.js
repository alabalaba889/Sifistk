const $=s=>document.querySelector(s);const send=(type,data={})=>chrome.runtime.sendMessage({type,...data}).then(r=>{if(!r?.ok)throw Error(r?.error||"Falha.");return r.result});function card(l,v,c=""){return '<div class="card"><div class="label">'+l+'</div><div class="value '+c+'">'+String(v??"—")+'</div></div>'}async function render(){const s=await send("GET_STATE");$("#state").innerHTML=card("Servidor",s.server?.ok?"Conectado":"Offline",s.server?.ok?"good":"bad")+card("Conta",s.user?.email||"Não conectada",s.user?"good":"warn")+card("Licença",s.license?.status||"Não autenticada",s.license?.status==="active"?"good":"warn")+card("Versão",SIFISTK.VERSION)}async function run(a){try{const t=(await chrome.tabs.query({active:true,currentWindow:true}))[0];let r;if(a==="sync")r=await send("SYNC");if(a==="diagnostics")r=await send("DIAGNOSTICS");if(a==="analyze")r=await send("ANALYZE_PAGE",{tabId:t?.id});if(a==="capture")r=await send("CAPTURE_CONTEXT",{tabId:t?.id});if(a==="inspect")r=await send("INSPECT_ELEMENT",{tabId:t?.id});if(a==="advanced-audit")r=await send("ADVANCED_AUDIT",{tabId:t?.id});if(a==="compatibility")r=await send("COMPATIBILITY");if(a==="advanced-inspect")r=await send("ADVANCED_INSPECT",{tabId:t?.id});if(a==="tabs")r=await send("LIST_TABS");if(a==="sessions")r=await send("LIST_SESSIONS");if(a==="permissions")r=await send("PERMISSIONS");if(a==="history")r=(await send("GET_STATE")).actionHistory;if(a==="options")r=await send("OPEN_OPTIONS");$("#out").textContent=JSON.stringify(r,null,2);await render()}catch(e){$("#out").textContent=e.message}}document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>run(b.dataset.a));render().catch(e=>$("#out").textContent=e.message);
const search=$("#search");
async function doSearch(){
  const q=search?.value||"";
  try{
    const r=await send("SEARCH",{query:q});
    $("#results").innerHTML=r.map(x=>'<div class="row"><span>'+x.label+'</span><button data-id="'+x.id+'" data-type="'+x.type+'">Abrir</button></div>').join("")||'<div class="row"><span>Nenhum resultado.</span></div>';
    document.querySelectorAll("#results button").forEach(b=>b.onclick=async()=>{
      try{
        const id=b.dataset.id,type=b.dataset.type,t=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
        const map={diagnostics:"DIAGNOSTICS",sync:"SYNC",tabs:"LIST_TABS",sessions:"LIST_SESSIONS",permissions:"PERMISSIONS",options:"OPEN_OPTIONS"};
        let result;
        if(type==="tab")result=await chrome.tabs.update(Number(id),{active:true});
        else if(type==="command"&&id==="analyze")result=await send("ANALYZE_PAGE",{tabId:t?.id});
        else if(type==="command"&&id==="capture")result=await send("CAPTURE_CONTEXT",{tabId:t?.id});
        else if(type==="command"&&id==="inspect")result=await send("INSPECT_ELEMENT",{tabId:t?.id});
        else if(type==="command"&&map[id])result=await send(map[id]);
        else result="Item de histórico: "+id;
        $("#out").textContent=typeof result==="string"?result:JSON.stringify(result,null,2);
        await render();
      }catch(e){$("#out").textContent=e.message}
    });
  }catch(e){$("#out").textContent=e.message}
}
search?.addEventListener("input",doSearch);
