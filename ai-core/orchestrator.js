import {STATUS,id} from "./types.js";
import {createState,record,setStatus,registerAgent,registerDecision} from "./state.js";
import {appendAudit} from "./audit.js";
export class Orchestrator{
 constructor({version="10.1.0",agents=[],costPolicy={}}={}){this.version=version;this.agents=new Map(agents.map(a=>[a.id,a]));this.costPolicy={simple:1,critical:3,complex:3,...costPolicy}}
 register(agent){this.agents.set(agent.id,agent)}
 plan(task,kind="simple"){const n=kind==="simple"?1:Math.min(3,this.agents.size);return {requestId:id("req"),task,kind,agentCount:n,agents:[...this.agents.keys()].slice(0,n),status:STATUS.PROPOSED}}
 async run({task,kind="simple",context={}}){let state=createState({version:this.version,task});let audit=[];const plan=this.plan(task,kind);state=record(state,{type:"PLAN",plan});const chosen=plan.agents.map(id=>this.agents.get(id)).filter(Boolean);for(const a of chosen)state=registerAgent(state,{id:a.id,name:a.name,role:a.role,provider:a.provider});if(!chosen.length)return {state:setStatus(state,STATUS.BLOCKED,"No agents available"),plan,outputs:[],audit};
 const outputs=[];for(const a of chosen){try{const result=await a.propose({task,context,state});outputs.push({agentId:a.id,result,status:STATUS.PROPOSED});state=record(state,{type:"PROPOSAL",agentId:a.id,status:STATUS.PROPOSED})}catch(error){outputs.push({agentId:a.id,error:String(error.message||error),status:STATUS.FAILED});state=record(state,{type:"AGENT_FAILURE",agentId:a.id,status:STATUS.FAILED})}}
 const valid=outputs.filter(x=>x.status===STATUS.PROPOSED);if(!valid.length)state=setStatus(state,STATUS.FAILED,"All selected agents failed");else{state=registerDecision(state,{requestId:state.requestId,method:"evidence-comparison",selectedAgents:valid.map(x=>x.agentId),status:STATUS.PROPOSED});state=setStatus(state,STATUS.IMPLEMENTED,"Proposal stage completed; implementation requires executor and authorization")}
 audit=appendAudit(audit,{action:"ORCHESTRATE",status:state.status,requestId:state.requestId,details:{agentCount:chosen.length,successfulAgents:valid.length}});return {state,plan,outputs,audit}}
}