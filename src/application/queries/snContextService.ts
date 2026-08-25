import { DeterministicSnLifecycleReplayService, type SnLifecycleReplayService } from '../../domain/sn/snLifecycleReplay.js';
import type { SnLifecycleReplayResult } from '../../domain/sn/types.js';
import type { MovementRepository } from './movementQueryService.js';
export interface SnContextService {get(sn:string):Promise<SnLifecycleReplayResult>}
export class ReplaySnContextService implements SnContextService {
  constructor(private readonly repository:MovementRepository,private readonly replayService:SnLifecycleReplayService=new DeterministicSnLifecycleReplayService()){}
  async get(sn:string):Promise<SnLifecycleReplayResult>{const normalized=sn.trim().toUpperCase().replace(/\s+/g,'');if(!normalized)throw new TypeError('INVALID_SN');const result=await this.repository.search({sn:normalized});return this.replayService.replay(normalized,result.movements);}
}
