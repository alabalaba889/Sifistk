const ADVANCED={};
ADVANCED.auditPage=function(){
  const text=v=>String(v||"").trim().replace(/\s+/g," ");
  const issues=[];
  const add=(id,severity,message,evidence,fix)=>issues.push({id,severity,message,evidence:evidence||null,fix:fix||null});
  const secure=location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1";
  const title=text(document.title),desc=text(document.querySelector('meta[name="description"]')?.content),lang=document.documentElement.lang||"";
  const h1=[...document.querySelectorAll("h1")],links=[...document.querySelectorAll("a[href]")],imgs=[...document.images],buttons=[...document.querySelectorAll("button,input[type=button],input[type=submit],[role=button]")],inputs=[...document.querySelectorAll("input,select,textarea")],passwords=[...document.querySelectorAll('input[type="password"]')],forms=[...document.forms];
  const headings=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(x=>Number(x.tagName.slice(1)));
  if(!title)add("seo-title","error","A página não possui título.","document.title está vazio.","Defina um <title> descritivo.");
  else if(title.length<20||title.length>70)add("seo-title-length","warn","Título fora da faixa de referência.","comprimento="+title.length,"Revise o título para representar claramente a página.");
  if(!desc)add("seo-description","warn","Meta description ausente.","meta[name=description] não encontrada.","Adicione uma descrição curta e específica.");
  else if(desc.length<70||desc.length>170)add("seo-description-length","warn","Meta description fora da faixa de referência.","comprimento="+desc.length,"Revise o tamanho mantendo a mensagem principal.");
  if(!lang)add("a11y-lang","error","Idioma do documento não declarado.","html[lang] vazio.","Defina o idioma principal no elemento <html>.");
  if(h1.length===0)add("seo-h1","warn","Nenhum H1 encontrado.","h1=0","Adicione um H1 principal.");
  if(h1.length>1)add("seo-multiple-h1","warn","Mais de um H1 encontrado.","h1="+h1.length,"Revise a hierarquia e mantenha um título principal quando fizer sentido.");
  for(let i=1;i<headings.length;i++)if(headings[i]-headings[i-1]>1)add("a11y-heading-order","warn","Salto na hierarquia de headings.","de H"+headings[i-1]+" para H"+headings[i],"Evite pular níveis sem uma razão estrutural clara.");
  const missingAlt=imgs.filter(i=>!text(i.alt)&&!i.hasAttribute("aria-hidden")&&!i.hasAttribute("role")).length;
  if(missingAlt)add("a11y-image-alt","error","Imagens sem texto alternativo detectadas.",String(missingAlt),"Forneça alt útil ou marque imagens decorativas de forma explícita.");
  const unnamedButtons=buttons.filter(b=>!text(b.innerText||b.value||b.getAttribute("aria-label")||b.getAttribute("title"))).length;
  if(unnamedButtons)add("a11y-button-name","error","Controles sem nome acessível detectados.",String(unnamedButtons),"Dê nome acessível por texto visível, aria-label ou mecanismo equivalente.");
  const unnamedLinks=links.filter(a=>!text(a.innerText||a.getAttribute("aria-label")||a.getAttribute("title"))).length;
  if(unnamedLinks)add("a11y-link-name","warn","Links sem nome discernível detectados.",String(unnamedLinks),"Forneça um nome textual ou acessível ao link.");
  const unlabeledInputs=inputs.filter(x=>{if(x.type==="hidden")return false;const id=x.id;return !(x.getAttribute("aria-label")||x.getAttribute("aria-labelledby")||(id&&document.querySelector('label[for="'+CSS.escape(id)+'"]'))||x.closest("label"));}).length;
  if(unlabeledInputs)add("a11y-form-label","warn","Campos sem associação de label detectados.",String(unlabeledInputs),"Associe cada campo a um <label> ou nome acessível equivalente.");
  const positiveTab= [...document.querySelectorAll("[tabindex]")].filter(x=>Number(x.tabIndex)>0).length;
  if(positiveTab)add("a11y-positive-tabindex","warn","tabindex positivo detectado.",String(positiveTab),"Prefira a ordem natural do DOM para navegação por teclado.");
  if(!document.querySelector('meta[name="viewport"]'))add("best-practice-viewport","warn","Meta viewport ausente.","meta[name=viewport] não encontrada.","Defina viewport responsivo para páginas móveis.");
  if(location.protocol==="https:"){
    let mixed=0;
    for(const el of document.querySelectorAll("[src],[href]")){const raw=el.getAttribute("src")||el.getAttribute("href")||"";if(/^http:\/\//i.test(raw))mixed++;}
    if(mixed)add("security-mixed-content","error","Referências HTTP foram encontradas em uma página HTTPS.",String(mixed),"Troque recursos para HTTPS ou caminhos relativos.");
  }
  const insecurePassword=secure===false&&passwords.length>0;
  if(insecurePassword)add("security-password-http","critical","Campo de senha em contexto não seguro.","protocol="+location.protocol,"Use HTTPS para qualquer autenticação.");
  const badBlank=links.filter(a=>a.target==="_blank"&&!/\bnoopener\b/i.test(a.rel)).length;
  if(badBlank)add("security-target-blank","warn","Links target=_blank sem noopener detectados.",String(badBlank),"Use rel=\"noopener\" para links que abrem nova janela.");
  const resources=performance.getEntriesByType?.("resource")||[];
  const totalTransfer=resources.reduce((sum,r)=>sum+(Number(r.transferSize)||0),0);
  const longTasks=performance.getEntriesByType?.("longtask")||[];
  const scripts=document.scripts.length,styles=document.styleSheets.length;
  if(scripts>40)add("perf-script-count","warn","Quantidade alta de scripts detectada.","scripts="+scripts,"Reduza scripts desnecessários e agrupe quando adequado.");
  if(styles>20)add("perf-style-count","warn","Quantidade alta de folhas de estilo detectada.","stylesheets="+styles,"Reduza folhas redundantes e agrupe quando possível.");
  if(totalTransfer>3000000)add("perf-transfer-size","warn","Transferência observada acima de 3 MB.","bytes="+totalTransfer,"Investigue recursos pesados e compressão.");
  if(longTasks.some(x=>x.duration>200))add("perf-long-task","warn","Long task acima de 200 ms observada.","maior="+Math.round(Math.max(...longTasks.map(x=>x.duration))),"Investigue JavaScript que bloqueia a thread principal.");
  for(const form of forms)if((form.method||"get").toLowerCase()==="post"&&!secure)add("security-form-http","critical","Formulário POST em contexto não seguro.","action="+form.action,"Proteja o formulário com HTTPS.");
  const canonical=document.querySelector('link[rel="canonical"]')?.href||null,robots=document.querySelector('meta[name="robots"]')?.content||null;
  return{schemaVersion:2,url:location.href,title,description:desc,lang,secureContext:secure,canonical,robots,summary:{issues:issues.length,critical:issues.filter(x=>x.severity==="critical").length,errors:issues.filter(x=>x.severity==="error").length,warnings:issues.filter(x=>x.severity==="warn").length},counts:{links:links.length,images:imgs.length,imagesMissingAlt:missingAlt,buttons:buttons.length,inputs:inputs.length,forms:forms.length,scripts,stylesheets,resources:resources.length},performance:{totalTransferBytes:totalTransfer,longTasks:longTasks.map(x=>Math.round(x.duration)).slice(0,50)},issues,generatedAt:new Date().toISOString()};
};
ADVANCED.compatibility=async function(){
  const manifest=chrome.runtime.getManifest();
  let uaData=null;
  try{uaData=navigator.userAgentData?await navigator.userAgentData.getHighEntropyValues(["platform","platformVersion","architecture","bitness","fullVersionList"]):null;}catch{}
  const apis={storage:!!chrome.storage,storageSession:!!chrome.storage?.session,scripting:!!chrome.scripting,sidePanel:!!chrome.sidePanel,alarms:!!chrome.alarms,permissions:!!chrome.permissions,tabs:!!chrome.tabs,sessions:!!chrome.sessions,downloads:!!chrome.downloads,notifications:!!chrome.notifications};
  const missing=Object.entries(apis).filter(([,ok])=>!ok).map(([k])=>k);
  return{schemaVersion:1,minimumChrome:manifest.minimum_chrome_version||null,apis,missing,userAgent:navigator.userAgent,userAgentData:uaData,features:{fetch:typeof fetch==="function",structuredClone:typeof structuredClone==="function",cryptoRandomUUID:typeof crypto?.randomUUID==="function",webStreams:typeof ReadableStream==="function"},generatedAt:new Date().toISOString()};
};
ADVANCED.inspect=function(){
  const c=v=>String(v||"").trim().replace(/\s+/g," ").slice(0,1500);
  const el=window.__sifistkSelectedElement;
  if(!el)return null;
  const path=[];let n=el;for(let i=0;n&&i<8;i++,n=n.parentElement)path.push(n.tagName.toLowerCase()+ (n.id?"#"+n.id:"")+(n.classList?.length?"."+[...n.classList].slice(0,3).join("."):""));
  const s=getComputedStyle(el),aria={role:el.getAttribute("role"),label:el.getAttribute("aria-label"),labelledby:el.getAttribute("aria-labelledby"),describedby:el.getAttribute("aria-describedby"),hidden:el.getAttribute("aria-hidden")};
  return{tag:el.tagName.toLowerCase(),id:el.id||null,classes:[...el.classList].slice(0,50),text:c(el.innerText||el.textContent),outerHTML:c(el.outerHTML).slice(0,5000),attributes:[...el.attributes].reduce((o,a)=>(o[a.name]=c(a.value).slice(0,500),o),{}),aria,rect:(()=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})(),styles:{display:s.display,position:s.position,color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,zIndex:s.zIndex},ancestorPath:path,url:location.href,generatedAt:new Date().toISOString()};
};
SIFISTK.ADVANCED=ADVANCED;