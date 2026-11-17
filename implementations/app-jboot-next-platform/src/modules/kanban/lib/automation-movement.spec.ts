import { describe, expect, it, vi } from 'vitest';
import { movementActionConfig, movementDestinations } from './automation-movement';
import { kanbanApi, type BoardColumnDto } from './kanban-api';

vi.mock('@/lib/module-auth-token',()=>({getApplicationAuthToken:()=> 'test-token'}));
const columns=[{id:'source',name:'Source',status:'active'},{id:'target',name:'Target',status:'active'},
  {id:'archived',name:'Archived',status:'archived'}] as BoardColumnDto[];

describe('AI completion movement configuration',()=>{
  it('offers active destinations except the source and validates a fresh selection',()=>{
    expect(movementDestinations(columns,'source').map(column=>column.name)).toEqual(['Target']);
    for(const id of ['','source','archived','unknown']) expect(()=>movementActionConfig(columns,'source',id)).toThrow();
    expect(movementActionConfig(columns,'source','target')).toEqual({toBoardColumnId:'target'});
  });
  it('persists the trigger and movement target without recipient or client authority',async()=>{
    const mock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({id:'rule'}),{status:200}));
    try {
      await kanbanApi.automationRules.create('board','source',{triggerType:'ai_completed',actionType:'move_card',actionConfig:movementActionConfig(columns,'source','target')});
      expect(JSON.parse(mock.mock.calls[0][1]?.body as string)).toEqual({triggerType:'ai_completed',actionType:'move_card',actionConfig:{toBoardColumnId:'target'}});
    } finally { mock.mockRestore(); }
  });
});
