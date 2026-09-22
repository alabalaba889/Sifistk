const out=document.querySelector("#out");
async function run(type,method,params){
  try{
    const message=type==="audit"?{type:"AUDIT"}:{type:"CDP",method,params};
    const r=await chrome.runtime.sendMessage(message);
    if(!r?.ok)throw Error(r?.error||"Falha.");
    out.textContent=JSON.stringify(r.result,null,2);
  }catch(e){out.textContent=e.message;}
}
document.querySelector("#audit").onclick=()=>run("audit");
document.querySelector("#perf").onclick=()=>run("cdp","Performance.getMetrics");
document.querySelector("#ax").onclick=()=>run("cdp","Accessibility.getFullAXTree");
document.querySelector("#dom").onclick=()=>run("cdp","DOM.getDocument",{depth:-1,pierce:true});