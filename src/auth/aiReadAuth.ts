import { timingSafeEqual } from 'node:crypto';
import { authenticateWarehouseRequest } from './requestAuth.js';

export function authenticateAiReadRequest(request: Request, env: Readonly<Record<string,string|undefined>>=process.env): { limiterKey:string; role?:'READ_ONLY'|'WAREHOUSE_OPERATOR'|'WAREHOUSE_ADMIN' } {
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();
  const expected=env.WAREHOUSE_AI_READ_TOKEN?.trim();
  if(supplied&&expected&&expected.length>=32&&safeEqual(supplied,expected)) return {limiterKey:'feishu-ai-service'};
  const auth=authenticateWarehouseRequest(request,'DASHBOARD_READ');
  return {limiterKey:`ai:${auth.user.userId}`,...(auth.user.roles[0]?{role:auth.user.roles[0]}:{})};
}
function safeEqual(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
