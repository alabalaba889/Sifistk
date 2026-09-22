const $=s=>document.querySelector(s);
const send=(type,data={})=>chrome.runtime.sendMessage({type,...data}).then(r=>{if(!r?.ok)throw Error(r?.error||"Falha.");return r.result});
async function render(){
  const s=await send("GET_STATE");
  $("#version").textContent="v"+SIFISTK.VERSION;
  $("#apiOrigin").value=s.apiOrigin||"";
  $("#accountState").textContent=s.user?"Conectado: "+s.user.email:"Não conectado";
  $("#loginBox").style.display=s.user?"none":"block";
  $("#logout").style.display=s.user?"inline-block":"none";
  $("#serverState").textContent=s.server?.ok?"Conectado":"Offline";
  $("#autoSync").checked=!!s.settings.autoSync;
  $("#notifications").checked=!!s.settings.notifications;
  $("#saveReports").checked=!!s.settings.saveReports;
  $("#saveActionHistory").checked=!!s.settings.saveActionHistory;
  const perms=await send("PERMISSIONS");
  const labels={tabs:["Abas","Ler título e URL no gerenciador."],downloads:["Downloads","Baixar relatórios JSON."],sessions:["Sessões","Listar/restaurar janelas e guias fechadas."],notifications:["Notificações","Exibir avisos do Sifistk."],tabGroups:["Grupos","Consultar grupos de abas."]};
  $("#permissions").innerHTML=Object.entries(labels).map(([k,v])=>'<div class="perm"><div><b>'+v[0]+'</b><small>'+v[1]+'</small></div><button data-p="'+k+'">'+(perms[k]?"Concedida":"Conceder")+'</button></div>').join("");
  document.querySelectorAll("[data-p]").forEach(b=>b.onclick=async()=>{
    try{const granted=await chrome.permissions.request({permissions:[b.dataset.p]});$("#out").textContent=granted?"Permissão concedida.":"Permissão não concedida.";await render();}
    catch(e){$("#out").textContent=e.message}
  });
}
$("#saveOrigin").onclick=async()=>{try{await SIFISTK.setServer($("#apiOrigin").value);await render();$("#out").textContent="Servidor salvo."}catch(e){$("#out").textContent=e.message}};
$("#login").onclick=async()=>{try{await send("LOGIN",{email:$("#email").value,password:$("#password").value});$("#password").value="";await render();$("#out").textContent="Login da extensão realizado."}catch(e){$("#out").textContent=e.message}};
$("#logout").onclick=async()=>{await send("LOGOUT");await render();$("#out").textContent="Sessão encerrada."};
$("#saveSettings").onclick=async()=>{try{await send("SAVE_SETTINGS",{settings:{autoSync:$("#autoSync").checked,notifications:$("#notifications").checked,saveReports:$("#saveReports").checked,saveActionHistory:$("#saveActionHistory").checked,compactMode:false}});$("#out").textContent="Preferências salvas."}catch(e){$("#out").textContent=e.message}};
$("#diagnostics").onclick=async()=>{try{$("#out").textContent=JSON.stringify(await send("DIAGNOSTICS"),null,2)}catch(e){$("#out").textContent=e.message}};
$("#download").onclick=async()=>{try{const r=await send("DIAGNOSTICS"),id=await send("DOWNLOAD_REPORT",{report:r,filename:"sifistk-diagnostic-"+Date.now()+".json"});$("#out").textContent="Download iniciado: "+id}catch(e){$("#out").textContent=e.message}};
$("#clear").onclick=async()=>{if(!confirm("Limpar os dados locais desta instalação?"))return;await send("CLEAR_DATA");await render();$("#out").textContent="Dados locais limpos."};
render().catch(e=>$("#out").textContent=e.message);