const $=s=>document.querySelector(s);
const send=(type,data={})=>chrome.runtime.sendMessage({type,...data}).then(r=>{if(!r?.ok)throw Error(r?.error||"Falha.");return r.result});
function card(label,value,cls=""){const el=document.createElement("div");el.className="card";el.innerHTML='<div class="label"></div><div class="value"></div>';el.querySelector(".label").textContent=label;el.querySelector(".value").textContent=String(value??"—");el.querySelector(".value").className="value "+cls;return el}
function clear(el){while(el.firstChild)el.removeChild(el.firstChild)}
function row(label,detail,buttons=[]){
  const el=document.createElement("div");el.className="row";
  const left=document.createElement("div");const title=document.createElement("b");title.textContent=label;left.appendChild(title);
  if(detail){const small=document.createElement("div");small.className="muted";small.textContent=detail;left.appendChild(small)}
  el.appendChild(left);
  const actions=document.createElement("div");
  for(const spec of buttons){const b=document.createElement("button");b.textContent=spec.label;b.addEventListener("click",spec.onClick);actions.appendChild(b)}
  el.appendChild(actions);return el
}
async function render(){
  const s=await send("GET_STATE"),state=$("#state");clear(state);
  state.append(card("Servidor",s.server?.ok?"Conectado":"Offline",s.server?.ok?"good":"bad"),card("Conta",s.user?.email||"Não conectada",s.user?"good":"warn"),card("Licença",s.license?.status||"Não autenticada",s.license?.status==="active"?"good":"warn"),card("Versão",SIFISTK.VERSION));
}
async function showTabs(){
  const out=$("#managerBody");clear(out);
  if(!await chrome.permissions.contains({permissions:["tabs"]})){
    out.append(row("Permissão de abas","Necessária para listar título, URL e fechar abas.",[{label:"Conceder",onClick:async()=>{try{const ok=await chrome.permissions.request({permissions:["tabs"]});$("#out").textContent=ok?"Permissão concedida.":"Permissão não concedida.";if(ok)await showTabs();}catch(e){$("#out").textContent=e.message}}}]));
    return;
  }
  try{
    const tabs=await send("LIST_TABS");
    for(const t of tabs){
      out.append(row(t.title||"(sem título)",t.url||"URL indisponível",[
        {label:"Ativar",onClick:async()=>{try{await chrome.tabs.update(t.id,{active:true});if(t.windowId!=null)await chrome.windows.update(t.windowId,{focused:true});}catch(e){$("#out").textContent=e.message}}},
        {label:"Fechar",onClick:async()=>{try{await send("CLOSE_TAB",{tabId:t.id});await showTabs();}catch(e){$("#out").textContent=e.message}}}
      ]));
    }
    if(!tabs.length)out.append(row("Nenhuma aba encontrada.",""));
  }catch(e){$("#out").textContent=e.message}
}
async function showSessions(){
  const out=$("#managerBody");clear(out);
  if(!await chrome.permissions.contains({permissions:["sessions"]})){
    out.append(row("Permissão de sessões","Necessária para restaurar janelas/guias fechadas.",[{label:"Conceder",onClick:async()=>{try{const ok=await chrome.permissions.request({permissions:["sessions"]});$("#out").textContent=ok?"Permissão concedida.":"Permissão não concedida.";if(ok)await showSessions();}catch(e){$("#out").textContent=e.message}}}]));
    return;
  }
  try{
    const data=await send("LIST_SESSIONS"),sessions=data?.sessions||[];
    for(const s of sessions){
      const count=s.tabCount||s.window?.tabs?.length||0;
      out.append(row(s.window?"Janela fechada":"Guia fechada",String(count)+" item(ns)",[{label:"Restaurar",onClick:async()=>{try{await send("RESTORE_SESSION",{sessionId:s.sessionId});await showSessions();}catch(e){$("#out").textContent=e.message}}}]));
    }
    if(!sessions.length)out.append(row("Nenhuma sessão recente.",""));
  }catch(e){$("#out").textContent=e.message}
}
async function showWorkSessions(){
  const out=$("#managerBody");clear(out);
  const sessions=await send("GET_WORK_SESSIONS");
  for(const s of sessions||[]){
    out.append(row(s.name,String(s.tabs?.length||0)+" abas • "+new Date(s.createdAt).toLocaleString(),[{label:"Restaurar",onClick:async()=>{try{const r=await send("RESTORE_WORK_SESSION",{session:s});$("#out").textContent="Sessão restaurada: "+r.count+" abas.";}catch(e){$("#out").textContent=e.message}}}]));
  }
  if(!(sessions||[]).length)out.append(row("Nenhuma sessão salva.","Use “Salvar sessão de trabalho” para criar uma."));
}
async function run(action){
  const out=$("#out");
  try{
    const t=(await chrome.tabs.query({active:true,currentWindow:true}))[0];let r;
    if(action==="panel"){if(!t?.id)throw Error("Não foi possível identificar a aba atual.");await chrome.sidePanel.open({tabId:t.id});r={ok:true}}
    if(action==="sync")r=await send("SYNC");
    if(action==="diagnostics")r=await send("DIAGNOSTICS");
    if(action==="analyze")r=await send("ANALYZE_PAGE",{tabId:t?.id});
    if(action==="capture")r=await send("CAPTURE_CONTEXT",{tabId:t?.id});
    if(action==="inspect")r=await send("INSPECT_ELEMENT",{tabId:t?.id});
    if(action==="advanced-audit")r=await send("ADVANCED_AUDIT",{tabId:t?.id});
    if(action==="compatibility")r=await send("COMPATIBILITY");
    if(action==="advanced-inspect")r=await send("ADVANCED_INSPECT",{tabId:t?.id});
    if(action==="tabs"){await showTabs();return}
    if(action==="sessions"){await showSessions();return}
    if(action==="history"){r=(await send("GET_STATE")).actionHistory}
    if(action==="permissions"){r=await send("PERMISSIONS")}
    if(action==="options")r=await send("OPEN_OPTIONS");
    out.textContent=typeof r==="string"?r:JSON.stringify(r,null,2);await render();
  }catch(e){out.textContent=e.message}
}
document.querySelectorAll("[data-a]").forEach(b=>b.addEventListener("click",()=>run(b.dataset.a)));
$("#loadTabs")?.addEventListener("click",showTabs);
$("#loadSessions")?.addEventListener("click",showSessions);
$("#loadWork")?.addEventListener("click",showWorkSessions);
$("#saveWork")?.addEventListener("click",async()=>{try{if(!await chrome.permissions.contains({permissions:["tabs"]})){const ok=await chrome.permissions.request({permissions:["tabs"]});if(!ok)throw Error("Permissão de abas não concedida.")}const name=prompt("Nome da sessão de trabalho:","Sessão Sifistk");if(name===null)return;const tabs=await chrome.tabs.query({});const r=await send("SAVE_WORK_SESSION",{name,tabs});$("#out").textContent="Sessão salva com "+r.tabs.length+" abas.";await showWorkSessions();}catch(e){$("#out").textContent=e.message}});
const search=$("#search");
async function doSearch(){
  try{
    const results=await send("SEARCH",{query:search?.value||""});
    const out=$("#results");clear(out);
    for(const x of results){
      const b=row(x.label,x.type==="tab"?(x.url||""):"",[{label:"Abrir",onClick:async()=>{
        try{
          const t=(await chrome.tabs.query({active:true,currentWindow:true}))[0];let r;
          if(x.type==="tab")r=await chrome.tabs.update(Number(x.id),{active:true});
          else if(x.type==="command"&&x.id==="analyze")r=await send("ANALYZE_PAGE",{tabId:t?.id});
          else if(x.type==="command"&&x.id==="capture")r=await send("CAPTURE_CONTEXT",{tabId:t?.id});
          else if(x.type==="command"&&x.id==="inspect")r=await send("INSPECT_ELEMENT",{tabId:t?.id});
          else if(x.type==="command"&&x.id==="diagnostics")r=await send("DIAGNOSTICS");
          else if(x.type==="command"&&x.id==="sync")r=await send("SYNC");
          else if(x.type==="command"&&x.id==="tabs")return showTabs();
          else if(x.type==="command"&&x.id==="sessions")return showSessions();
          else if(x.type==="command"&&x.id==="permissions")r=await send("PERMISSIONS");
          else if(x.type==="command"&&x.id==="options")r=await send("OPEN_OPTIONS");
          else r="Histórico: "+x.label;
          $("#out").textContent=typeof r==="string"?r:JSON.stringify(r,null,2);await render();
        }catch(e){$("#out").textContent=e.message}
      }}]);
      out.append(b);
    }
    if(!results.length)out.append(row("Nenhum resultado.",""));
  }catch(e){$("#out").textContent=e.message}
}
search?.addEventListener("input",doSearch);
render().catch(e=>$("#out").textContent=e.message);
