import {providerAdapter,unavailableAgent} from "./providers.js";

const OPENAI_KEY=process.env.OPENAI_API_KEY||"";
const GEMINI_KEY=process.env.GEMINI_API_KEY||"";
const ANTHROPIC_KEY=process.env.ANTHROPIC_API_KEY||"";
const OPENAI_MODEL=process.env.SIFISTK_AI_MODEL||"gpt-5.6-luna";
const GEMINI_MODEL=process.env.SIFISTK_GEMINI_MODEL||"";
const ANTHROPIC_MODEL=process.env.SIFISTK_ANTHROPIC_MODEL||"";

async function postJson(url,headers,body,timeoutMs=60000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetch(url,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify(body),signal:controller.signal});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||d?.error||"Provider request failed");return d}
  finally{clearTimeout(timer)}
}
function textPrompt(task,context){return task+"\n\nContext:\n"+JSON.stringify(context||{})+"\n\nReturn a concise proposal with: findings, evidence, risks, limitations, alternatives, and uncertainty. Do not claim tools/tests were run unless the request contains their verified results."}

export const openaiAgent=OPENAI_KEY?providerAdapter({id:"openai",name:"OpenAI",provider:"openai",capabilities:["reasoning","tools","web_search"],async propose({task,context}){return {status:"PROPOSED",provider:"openai",model:OPENAI_MODEL,note:"OpenAI is executed by the existing Sifistk Responses API path.",prompt:textPrompt(task,context)}}):unavailableAgent({id:"openai",name:"OpenAI",provider:"openai",reason:"OPENAI_API_KEY is not configured"});
export const geminiAgent=GEMINI_KEY&&GEMINI_MODEL?providerAdapter({id:"gemini",name:"Gemini",provider:"google",capabilities:["multimodal","tools","code_execution"],async propose({task,context}){const d=await postJson("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(GEMINI_MODEL)+":generateContent",{"x-goog-api-key":GEMINI_KEY},{contents:[{parts:[{text:textPrompt(task,context)}]}]});return {status:"PROPOSED",provider:"google",model:GEMINI_MODEL,text:d?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"",usage:d?.usageMetadata||null}}}):unavailableAgent({id:"gemini",name:"Gemini",provider:"google",reason:GEMINI_KEY?"SIFISTK_GEMINI_MODEL is not configured":"GEMINI_API_KEY is not configured"});
export const claudeAgent=ANTHROPIC_KEY&&ANTHROPIC_MODEL?providerAdapter({id:"claude",name:"Claude",provider:"anthropic",capabilities:["long_context","reasoning","tool_use"],async propose({task,context}){const d=await postJson("https://api.anthropic.com/v1/messages",{"x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},{model:ANTHROPIC_MODEL,max_tokens:4096,messages:[{role:"user",content:textPrompt(task,context)}]});return {status:"PROPOSED",provider:"anthropic",model:ANTHROPIC_MODEL,text:d?.content?.map(x=>x.text||"").join("")||"",usage:d?.usage||null}}}):unavailableAgent({id:"claude",name:"Claude",provider:"anthropic",reason:ANTHROPIC_KEY?"SIFISTK_ANTHROPIC_MODEL is not configured":"ANTHROPIC_API_KEY is not configured"});

export function trioAgents(){return [openaiAgent,geminiAgent,claudeAgent]}
export async function collectProposals({task,context={},mode="complex"}){
  const agents=trioAgents();const selected=mode==="simple"?agents.slice(0,1):agents;
  const results=await Promise.all(selected.map(async agent=>{try{return {...(await agent.propose({task,context})),agentId:agent.id}}catch(error){return {agentId:agent.id,status:"FAILED",error:String(error.message||error)}}}));
  return {mode,results};
}
