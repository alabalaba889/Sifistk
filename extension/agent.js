const $=s=>document.querySelector(s);
const welcome=$("#welcome"),conversationEl=$("#conversation"),composer=$("#composer"),message=$("#message"),send=$("#send"),task=$("#task"),stepsEl=$("#steps"),toolsEl=$("#toolsUsed"),notice=$("#notice"),auth=$("#auth"),loginForm=$("#loginForm"),loginEmail=$("#loginEmail"),loginPassword=$("#loginPassword"),serverOrigin=$("#serverOrigin"),authMessage=$("#authMessage"),accountStatus=$("#accountStatus"),logoutBtn=$("#logoutBtn");
const MAX_TOOL_CALLS=20,MAX_TOOL_ROUNDS=8;
let state={conversation:[],inputHistory:[],threadId:null,busy:false,cancelled:false,generation:0,controller:null,apiOrigin:"http://localhost:8787",user:null,activeUserText:""};

function call(type,payload={}){
  return new Promise((resolve,reject)=>{
    chrome.runtime.sendMessage({type,...payload},r=>{
      if(chrome.runtime.lastError)return reject(Error(chrome.runtime.lastError.message));
      if(!r?.ok)return reject(Error(r?.error||"Falha"));
      resolve(r.result);
    });
  });
}
function addMessage(role,text,meta=""){
  if(!text)return;
  const row=document.createElement("div");row.className="msg "+role;
  const bubble=document.createElement("div");bubble.className="bubble";bubble.textContent=text;row.appendChild(bubble);conversationEl.appendChild(row);
  if(meta){const m=document.createElement("div");m.className="meta";m.textContent=meta;conversationEl.appendChild(m)}
  conversationEl.scrollTop=conversationEl.scrollHeight;
}
function rememberMessage(role,text){if(text)state.conversation.push({role,text,at:Date.now()});}
function showNotice(text){notice.textContent=String(text||"");notice.classList.remove("hidden");clearTimeout(showNotice.timer);showNotice.timer=setTimeout(()=>notice.classList.add("hidden"),7000)}
function setTask(active,title="Tarefa"){task.classList.toggle("hidden",!active);$("#taskTitle").textContent=title}
function addStep(text,status="active"){const el=document.createElement("div");el.className="step "+status;el.textContent=text;stepsEl.appendChild(el);return el}
function addTool(name){if([...toolsEl.children].some(x=>x.dataset.name===name))return;const el=document.createElement("span");el.className="tool-chip";el.dataset.name=name;el.textContent=name;toolsEl.appendChild(el)}
function autoResize(){message.style.height="auto";message.style.height=Math.min(message.scrollHeight,180)+"px"}
function toolRisk(name){return["browser_open_url","artifact_download"].includes(name)?"write":"read"}

function setAuthenticated(user){
  state.user=user||null;
  const ok=!!state.user;
  auth.classList.toggle("hidden",ok);
  message.disabled=!ok;send.disabled=!ok;
  logoutBtn.classList.toggle("hidden",!ok);
  accountStatus.textContent=ok?(state.user.name||state.user.email||"Autenticado"):"Não autenticado";
}
async function refreshState(){
  const s=await call("GET_STATE");
  state.apiOrigin=s.apiOrigin;
  state.user=s.user||null;
  state.conversation=s.conversation||[];
  state.inputHistory=s.agentInputHistory||[];
  state.threadId=s.agentThreadId||null;
  serverOrigin.value=state.apiOrigin;
  setAuthenticated(state.user);
  if(state.conversation.length){
    welcome.classList.add("hidden");
    conversationEl.innerHTML="";
    for(const m of state.conversation)addMessage(m.role,m.text);
  }else welcome.classList.remove("hidden");
  if(!state.user)auth.classList.remove("hidden");
}

async function currentContext(){
  try{return await call("AGENT_EXECUTE",{name:"page_capture_context",args:{}})}
  catch{return{available:false}}
}

async function downloadArtifact(args){
  const filename=String(args?.filename||"sifistk-result.txt").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,140)||"sifistk-result.txt";
  const content=String(args?.content??"");
  if(content.length>2_000_000)throw Error("O arquivo solicitado excede o limite de 2 MB.");
  const mime=String(args?.mime||"text/plain").slice(0,100);
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  try{
    const a=document.createElement("a");a.href=url;a.download=filename;a.rel="noopener";a.style.display="none";document.documentElement.appendChild(a);a.click();a.remove();
    return{downloaded:true,filename,size:blob.size};
  }finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}
}

async function executeTool(tc,generation){
  let args={};
  try{args=JSON.parse(tc.arguments||"{}")}catch{return{callId:tc.callId,output:{ok:false,error:"Argumentos de ferramenta inválidos."}}}
  if(generation!==state.generation||state.cancelled)return{callId:tc.callId,output:{ok:false,aborted:true,error:"Execução cancelada."}};
  if(toolRisk(tc.name)==="write"){
    const ok=confirm("A IA solicitou uma ação sensível.\n\nFerramenta: "+tc.name+"\n\nDeseja permitir?");
    if(!ok)return{callId:tc.callId,output:{ok:false,denied:true,error:"Usuário recusou a ação."}};
  }
  addTool(tc.name);
  const step=addStep(tc.name==="page_inspect_element"?"Clique no elemento que deseja inspecionar…":"Executando "+tc.name+"…","active");
  try{
    const output=tc.name==="artifact_download"?await downloadArtifact(args):await call("AGENT_EXECUTE",{name:tc.name,args});
    if(generation!==state.generation||state.cancelled)return{callId:tc.callId,output:{ok:false,aborted:true,error:"Execução cancelada."}};
    step.className="step done";step.textContent="✓ "+tc.name;
    return{callId:tc.callId,output:{ok:true,data:output}};
  }catch(e){
    step.className="step error";step.textContent="✕ "+tc.name;
    return{callId:tc.callId,output:{ok:false,error:e.message}};
  }
}

async function callApi(body,generation){
  const s=await call("GET_STATE");
  if(generation!==state.generation)throw Error("Execução substituída.");
  if(!s.authToken)throw Error("Faça login na conta Sifistk antes de usar a IA.");
  const base=s.apiOrigin.replace(/\/$/,"");
  if(state.controller)state.controller.abort();
  state.controller=new AbortController();
  const timer=setTimeout(()=>state.controller?.abort(),60000);
  try{
    const r=await fetch(base+"/api/extension/agent/turn",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+s.authToken},body:JSON.stringify(body),signal:state.controller.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){const e=Error(d.error||"A IA não pôde executar a tarefa.");e.status=r.status;throw e}
    return d;
  }catch(e){
    if(e.name==="AbortError")throw Error("A execução foi cancelada ou excedeu o limite de 60 segundos.");
    throw e;
  }finally{clearTimeout(timer)}
}

async function runTurn(messageText,generation,context=null,toolOutputs=null){
  if(generation!==state.generation||state.cancelled)return;
  const payload={history:state.inputHistory.slice(-40),threadId:state.threadId||undefined};
  if(messageText){payload.message=messageText;payload.context=context||{}}
  if(toolOutputs)payload.toolOutputs=toolOutputs;
  const result=await callApi(payload,generation);
  if(result.threadId)state.threadId=result.threadId;
  for(const tc of result.toolCalls||[]){}
  if(result.text){
    addMessage("assistant",result.text,result.toolCalls?.length?"Executando ferramentas":"");
    rememberMessage("assistant",result.text);
  }
  const calls=result.toolCalls||[];
  if(!calls.length){
    if(state.activeUserText){
      state.inputHistory.push({role:"user",content:[{type:"input_text",text:state.activeUserText}]});
      state.activeUserText="";
    }
    if(result.text)state.inputHistory.push({role:"assistant",content:[{type:"output_text",text:result.text}]});
    await chrome.storage.local.set({agentConversation:state.conversation.slice(-100),agentInputHistory:state.inputHistory.slice(-40),agentThreadId:state.threadId||null});
    setTask(false);
    state.busy=false;state.controller=null;send.disabled=false;message.focus();
    return;
  }
  setTask(true,"Executando tarefa");
  state.toolCount=(state.toolCount||0)+calls.length;
  if((state.rounds||0)>=MAX_TOOL_ROUNDS||state.toolCount>MAX_TOOL_CALLS){
    if(state.activeUserText){state.inputHistory.push({role:"user",content:[{type:"input_text",text:state.activeUserText}]});state.activeUserText="";}
    setTask(false);state.busy=false;send.disabled=false;
    addMessage("assistant","Parei a execução porque o limite seguro de etapas foi atingido. Revise o que já foi concluído antes de continuar.");
    rememberMessage("assistant","Parei a execução porque o limite seguro de etapas foi atingido.");
    await chrome.storage.local.set({agentConversation:state.conversation.slice(-100),agentInputHistory:state.inputHistory.slice(-40),agentThreadId:state.threadId||null});
    return;
  }
  state.rounds=(state.rounds||0)+1;
  const outputs=[];
  for(const tc of calls){
    if(state.cancelled)break;
    outputs.push(await executeTool(tc,generation));
  }
  if(!state.cancelled)await runTurn("",generation,null,outputs);
}

async function submit(value){
  value=String(value||"").trim();
  if(!value||state.busy)return;
  const s=await call("GET_STATE");
  if(!s.authToken){auth.classList.remove("hidden");showNotice("Faça login antes de usar a IA.");loginEmail.focus();return}
  state.busy=true;state.cancelled=false;state.generation++;state.activeUserText=value;const generation=state.generation;state.controller=null;state.rounds=0;state.toolCount=0;send.disabled=true;
  welcome.classList.add("hidden");addMessage("user",value);rememberMessage("user",value);setTask(true,"Entendendo a tarefa");stepsEl.innerHTML="";toolsEl.innerHTML="";addStep("Entendendo o objetivo…","active");
  try{
    const context=await currentContext();
    await runTurn(value,generation,context,null);
  }catch(e){
    if(generation!==state.generation)return;
    setTask(false);state.busy=false;state.controller=null;send.disabled=false;
    if(e.status===401){await call("LOGOUT").catch(()=>{});setAuthenticated(null);auth.classList.remove("hidden")}
    if(e.status===409){state.threadId=null;await chrome.storage.local.remove(["agentThreadId"]);}
    showNotice(e.message);addMessage("assistant","Não consegui concluir a execução. "+e.message);rememberMessage("assistant","Não consegui concluir a execução. "+e.message);
    await chrome.storage.local.set({agentConversation:state.conversation.slice(-100),agentInputHistory:state.inputHistory.slice(-40),agentThreadId:state.threadId||null});
  }
}

composer.addEventListener("submit",e=>{e.preventDefault();const v=message.value;message.value="";autoResize();submit(v)});
message.addEventListener("input",autoResize);
message.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();composer.requestSubmit()}});

loginForm.addEventListener("submit",async e=>{
  e.preventDefault();authMessage.className="auth-message";authMessage.textContent="Entrando…";
  try{
    await call("SET_API_ORIGIN",{value:serverOrigin.value});
    const data=await call("LOGIN",{email:loginEmail.value,password:loginPassword.value});
    loginPassword.value="";authMessage.className="auth-message ok";authMessage.textContent="Login realizado.";
    state.apiOrigin=(await call("GET_STATE")).apiOrigin;setAuthenticated(data.user);showNotice("Conectado à Sifistk.");
  }catch(err){authMessage.className="auth-message error";authMessage.textContent=err.message}
});

logoutBtn.addEventListener("click",async()=>{if(state.busy)return;await call("LOGOUT");setAuthenticated(null);showNotice("Sessão encerrada.");message.value="";autoResize()});
$("#newChat").addEventListener("click",async()=>{if(state.busy)return;state.conversation=[];state.inputHistory=[];state.threadId=null;conversationEl.innerHTML="";welcome.classList.remove("hidden");await call("NEW_CONVERSATION")});
$("#cancelBtn").addEventListener("click",()=>{if(!state.busy)return;state.cancelled=true;state.generation++;state.controller?.abort();state.controller=null;state.busy=false;send.disabled=!state.user;setTask(false);addMessage("assistant","Tarefa cancelada. Nenhuma etapa posterior será executada.");rememberMessage("assistant","Tarefa cancelada. Nenhuma etapa posterior será executada.")});
document.querySelectorAll(".examples button").forEach(b=>b.addEventListener("click",()=>submit(b.dataset.prompt)));

(async()=>{try{await refreshState()}catch(e){showNotice(e.message)}})();