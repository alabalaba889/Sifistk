const $=s=>document.querySelector(s);
const welcome=$("#welcome"),conversationEl=$("#conversation"),composer=$("#composer"),message=$("#message"),send=$("#send"),task=$("#task"),stepsEl=$("#steps"),toolsEl=$("#toolsUsed"),notice=$("#notice");
let state={conversation:[],inputHistory:[],busy:false,cancelled:false,toolCalls:[],toolResults:[]};

function call(type,payload={}){return new Promise((resolve,reject)=>chrome.runtime.sendMessage({type,...payload},r=>{if(chrome.runtime.lastError)return reject(Error(chrome.runtime.lastError.message));if(!r?.ok)return reject(Error(r?.error||"Falha"));resolve(r.result)}))}
function addMessage(role,text,meta=""){if(!text)return;const row=document.createElement("div");row.className="msg "+role;const bubble=document.createElement("div");bubble.className="bubble";bubble.textContent=text;row.appendChild(bubble);conversationEl.appendChild(row);if(meta){const m=document.createElement("div");m.className="meta";m.textContent=meta;conversationEl.appendChild(m)}conversationEl.scrollTop=conversationEl.scrollHeight}
function showNotice(text){notice.textContent=text;notice.classList.remove("hidden");setTimeout(()=>notice.classList.add("hidden"),7000)}
function setTask(active,title="Tarefa"){task.classList.toggle("hidden",!active);$("#taskTitle").textContent=title}
function addStep(text,status="active"){const el=document.createElement("div");el.className="step "+status;el.textContent=text;stepsEl.appendChild(el);return el}
function addTool(name){if([...toolsEl.children].some(x=>x.dataset.name===name))return;const el=document.createElement("span");el.className="tool-chip";el.dataset.name=name;el.textContent=name;toolsEl.appendChild(el)}
function autoResize(){message.style.height="auto";message.style.height=Math.min(message.scrollHeight,180)+"px"}
async function currentContext(){try{return await call("AGENT_EXECUTE",{name:"page_capture_context",args:{}})}catch{return{available:false}}}
function toolRisk(name){return ["browser_open_url","artifact_download"].includes(name)?"write":"read"}
async function executeTool(callInfo){
 const args=JSON.parse(callInfo.arguments||"{}");
 if(toolRisk(callInfo.name)==="write"){
   const ok=confirm("A IA solicitou uma ação que altera o navegador ou cria um arquivo.\n\nFerramenta: "+callInfo.name+"\n\nDeseja permitir?");
   if(!ok)return{callId:callInfo.callId,output:{ok:false,denied:true,error:"Usuário recusou a ação."}};
 }
 addTool(callInfo.name);
 const step=addStep("Executando "+callInfo.name+"…","active");
 try{const output=await call("AGENT_EXECUTE",{name:callInfo.name,args});step.className="step done";step.textContent="✓ "+callInfo.name;return{callId:callInfo.callId,output:{ok:true,data:output}}}
 catch(e){step.className="step error";step.textContent="✕ "+callInfo.name;return{callId:callInfo.callId,output:{ok:false,error:e.message}}}
}
async function turn(messageText,toolOutputs=null){
 if(state.cancelled)return;
 const context=await currentContext();
 const body={message:toolOutputs? "":messageText,history:state.inputHistory.slice(-40),context,toolOutputs};
 const result=await callApi(body);
 for(const tc of result.toolCalls||[])state.inputHistory.push({type:"function_call",call_id:tc.callId,name:tc.name,arguments:tc.arguments});
 if(result.text)addMessage("assistant",result.text,(result.toolCalls?.length?"Preparando ferramentas":""));
 if(result.toolCalls?.length){
   setTask(true,"Executando tarefa");
   const outputs=[];
   for(const tc of result.toolCalls){if(state.cancelled)break;outputs.push(await executeTool(tc))}
   for(const out of outputs)state.inputHistory.push({type:"function_call_output",call_id:out.callId,output:JSON.stringify(out.output)});
   state.inputHistory.push(...[]);
   if(!state.cancelled)await turn("",outputs);
 }else{
   setTask(false);
   if(result.text)state.inputHistory.push({role:"assistant",content:[{type:"output_text",text:result.text}]});
   state.busy=false;send.disabled=false;message.focus();
   await call("SAVE_AGENT_STATE",{conversation:state.conversation,inputHistory:state.inputHistory}).catch(()=>{});
 }
}
async function callApi(body){const s=await call("GET_STATE");if(!s.authToken)throw Error("Faça login na conta Sifistk antes de usar a IA.");const base=s.apiOrigin.replace(/\/$/,"");const r=await fetch(base+"/api/extension/agent/turn",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+s.authToken},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"A IA não pôde executar a tarefa.");return d}
async function submit(text){
 const value=String(text||"").trim();if(!value||state.busy)return;
 state.busy=true;state.cancelled=false;send.disabled=true;welcome.classList.add("hidden");addMessage("user",value);state.conversation.push({role:"user",text:value,at:Date.now()});setTask(true,"Entendendo a tarefa");stepsEl.innerHTML="";toolsEl.innerHTML="";addStep("Entendendo o objetivo…","active");
 try{await turn(value)}catch(e){setTask(false);state.busy=false;send.disabled=false;showNotice(e.message);addMessage("assistant","Não consegui concluir a execução. "+e.message)}
}
composer.addEventListener("submit",e=>{e.preventDefault();submit(message.value);message.value="";autoResize()});
message.addEventListener("input",autoResize);message.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();composer.requestSubmit()}});
$("#newChat").addEventListener("click",async()=>{if(state.busy)return;state={conversation:[],inputHistory:[],busy:false,cancelled:false,toolCalls:[],toolResults:[]};conversationEl.innerHTML="";welcome.classList.remove("hidden");await call("NEW_CONVERSATION")});
$("#cancelBtn").addEventListener("click",()=>{state.cancelled=true;state.busy=false;send.disabled=false;setTask(false);addMessage("assistant","Tarefa cancelada. Nenhuma etapa posterior será executada.")});
document.querySelectorAll(".examples button").forEach(b=>b.addEventListener("click",()=>submit(b.dataset.prompt)));
(async()=>{try{const s=await call("GET_STATE");if(s.conversation?.length){welcome.classList.add("hidden");for(const m of s.conversation)addMessage(m.role,m.text)}if(!s.authToken)showNotice("A extensão está conectada, mas a conta não está autenticada.")}catch(e){showNotice(e.message)}})();