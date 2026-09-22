importScripts("core.js","agent-tools.js");

const validTabId=id=>Number.isInteger(id)&&id>0;

async function activeTab(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs[0];
  if(!tab?.id||!validTabId(tab.id))throw Error("Nenhuma aba ativa utilizável foi encontrada.");
  return tab;
}

async function injectActive(fn,args=[]){
  const tab=await activeTab();
  const r=await chrome.scripting.executeScript({target:{tabId:tab.id},func:fn,args});
  return r?.[0]?.result??null;
}

function pageAnalyze(){
  const clean=v=>String(v||"").trim().replace(/\s+/g," ");
  const links=[...document.querySelectorAll("a[href]")],imgs=[...document.images],heads=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const scripts=[...document.scripts].map(x=>x.src||"inline");
  const styles=[...document.querySelectorAll('link[rel="stylesheet"],style')].map(x=>x.href||"inline");
  return{
    schemaVersion:2,url:location.href,title:document.title,lang:document.documentElement.lang||null,
    canonical:document.querySelector('link[rel="canonical"]')?.href||null,
    headings:heads.map(h=>({level:+h.tagName.slice(1),text:clean(h.textContent)})).slice(0,200),
    counts:{links:links.length,images:imgs.length,forms:document.forms.length,scripts:scripts.length,stylesheets:styles.length,h1:document.querySelectorAll("h1").length,structuredData:document.querySelectorAll('script[type="application/ld+json"]').length},
    meta:[...document.querySelectorAll("meta")].map(m=>({name:m.name||null,property:m.getAttribute("property"),content:clean(m.content)})).filter(x=>x.name||x.property).slice(0,100),
    resources:{scripts:scripts.slice(0,100),stylesheets:styles.slice(0,100)},
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    generatedAt:new Date().toISOString()
  };
}

function captureContext(){
  const clean=v=>String(v||"").trim().replace(/\s+/g," ");
  return{
    schemaVersion:2,
    page:{url:location.href,title:document.title,origin:location.origin},
    selection:clean(getSelection()?.toString()).slice(0,4000),
    viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY},
    focusedElement:document.activeElement?{tag:document.activeElement.tagName,id:document.activeElement.id||null,name:document.activeElement.getAttribute?.("name")||null}:null,
    counts:{elements:document.querySelectorAll("*").length,links:document.links.length,images:document.images.length,forms:document.forms.length},
    generatedAt:new Date().toISOString()
  };
}

function pageResources(){
  const pick=(xs,limit=150)=>xs.map(x=>({tag:x.tagName.toLowerCase(),url:x.src||x.href||null,rel:x.rel||null,type:x.type||null})).filter(x=>x.url||x.type).slice(0,limit);
  return{scripts:pick([...document.scripts]),styles:pick([...document.querySelectorAll("link[rel=stylesheet],style")]),images:pick([...document.images])};
}
function pageLinks(){
  return{links:[...document.querySelectorAll("a[href]")].slice(0,500).map(a=>({text:String(a.innerText||a.textContent||"").trim().replace(/\s+/g," ").slice(0,300),url:a.href,external:new URL(a.href,location.href).origin!==location.origin}))};
}
function inspectElement(){
  return new Promise(resolve=>{
    const h=e=>{
      e.preventDefault();e.stopPropagation();
      const el=e.target,c=v=>String(v||"").trim().replace(/\s+/g," ").slice(0,1500),r=el.getBoundingClientRect(),s=getComputedStyle(el);
      const out={
        schemaVersion:2,tag:el.tagName.toLowerCase(),id:el.id||null,classes:[...el.classList].slice(0,40),
        text:c(el.innerText||el.textContent),
        attributes:Object.fromEntries([...el.attributes].slice(0,50).map(a=>[a.name,c(a.value).slice(0,500)])),
        aria:{role:el.getAttribute("role"),label:el.getAttribute("aria-label"),labelledby:el.getAttribute("aria-labelledby")},
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},
        styles:{display:s.display,position:s.position,color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,zIndex:s.zIndex},
        url:location.href
      };
      document.removeEventListener("click",h,true);resolve(out);
    };
    document.addEventListener("click",h,true);
    setTimeout(()=>{document.removeEventListener("click",h,true);resolve(null)},30000);
  });
}

async function executeTool(name,args={}){
  const a=args||{};
  switch(name){
    case"page_analyze":return injectActive(pageAnalyze);
    case"page_capture_context":return injectActive(captureContext);
    case"page_resources":return injectActive(pageResources);
    case"page_links":return injectActive(pageLinks);
    case"page_inspect_element":return injectActive(inspectElement);
    case"page_screenshot":{const tab=await activeTab();if(tab.windowId==null)throw Error("Janela ativa não encontrada.");return{dataUrl:await chrome.tabs.captureVisibleTab(tab.windowId,{format:"png"})}}
    case"browser_list_tabs":{
      const tabs=await chrome.tabs.query({});
      return tabs.map(t=>({id:t.id,active:!!t.active,windowId:t.windowId,status:t.status||null,pinned:!!t.pinned,audible:!!t.audible,muted:!!t.muted,groupId:t.groupId??null,title:t.title||null,url:t.url||null}));
    }
    case"browser_open_url":{
      const u=new URL(String(a.url||""));
      if(!["http:","https:"].includes(u.protocol))throw Error("Somente HTTP/HTTPS pode ser aberto.");
      const created=await chrome.tabs.create({url:u.href});
      return{id:created.id,url:created.url||u.href};
    }
    case"extension_diagnostics":return SIFISTK.collectDiagnostics();
    default:throw Error("Ferramenta não permitida: "+name);
  }
}

chrome.runtime.onInstalled.addListener(async()=>{
  await SIFISTK.ensureDefaults();
  try{await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true})}catch{}
});
chrome.runtime.onStartup.addListener(()=>SIFISTK.ensureDefaults());

chrome.runtime.onMessage.addListener((m,s,send)=>{
  (async()=>{
    if(m?.type==="AGENT_TOOLS")return agentToolCatalog();
    if(m?.type==="AGENT_EXECUTE")return executeTool(m.name,m.args);
    if(m?.type==="GET_STATE")return SIFISTK.getState();
    if(m?.type==="LOGIN")return SIFISTK.login(m.email,m.password);
    if(m?.type==="SET_API_ORIGIN")return SIFISTK.setApiOrigin(m.value);
    if(m?.type==="LOGOUT"){await SIFISTK.logout();return{ok:true}}
    if(m?.type==="DIAGNOSTICS")return SIFISTK.collectDiagnostics();
    if(m?.type==="NEW_CONVERSATION"){await SIFISTK.clearConversation();return{ok:true}}
    throw Error("Comando desconhecido.");
  })().then(r=>send({ok:true,result:r})).catch(e=>send({ok:false,error:e.message}));
  return true;
});
(async()=>{await SIFISTK.ensureDefaults()})();