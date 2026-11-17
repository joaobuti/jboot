import { BadRequestException, Injectable } from '@nestjs/common';
import { JuridicoRequestContext } from '../shared/juridico.types';
import { DeadlineRepository } from './deadline.repository';
import { CalculateDeadlineDto, CreateDeadlineCalendarDto, CreateDeadlineEntryDto } from './dto/deadline.dto';
@Injectable()
export class DeadlineService { constructor(private readonly repository: DeadlineRepository) {}
  async calculate(ctx:JuridicoRequestContext,dto:CalculateDeadlineDto) { const start=new Date(`${dto.startDate}T00:00:00Z`); if(Number.isNaN(start.valueOf())) throw new BadRequestException('Data inicial invalida'); const calendars=new Map<number,Set<string>>(); const holidays=async(year:number)=>{if(!calendars.has(year))calendars.set(year,new Set(await this.repository.holidays(ctx.clientId,ctx.databaseRef,year)));return calendars.get(year)!;}; const skipped:string[]=[]; let cursor=new Date(start); let counted=0; if(!dto.includeStart) cursor.setUTCDate(cursor.getUTCDate()+1); while(counted<dto.businessDays) { const key=cursor.toISOString().slice(0,10); const weekend=cursor.getUTCDay()===0||cursor.getUTCDay()===6; if(weekend||(await holidays(cursor.getUTCFullYear())).has(key)) skipped.push(key); else counted++; if(counted<dto.businessDays) cursor.setUTCDate(cursor.getUTCDate()+1); } const resultDate=cursor.toISOString().slice(0,10); return this.repository.saveCalculation(ctx.clientId,ctx.databaseRef,ctx.identityId,{...dto,resultDate,memory:{skipped,calendarYears:[...calendars.keys()],notice:'Cálculo assistivo: confirme o prazo oficial.'}}); }
  createCalendar(ctx:JuridicoRequestContext,dto:CreateDeadlineCalendarDto) { if(dto.sourceUrl){const host=new URL(dto.sourceUrl).hostname; if(!(host.endsWith('.gov.br')||host.endsWith('.jus.br')))throw new BadRequestException('Fonte deve ser oficial');} return this.repository.createCalendar(ctx.clientId,ctx.databaseRef,ctx.identityId,dto); }
  listCalendars(ctx:JuridicoRequestContext) { return this.repository.listCalendars(ctx.clientId,ctx.databaseRef); }
  listEntries(ctx:JuridicoRequestContext,id:string) { return this.repository.listEntries(ctx.clientId,ctx.databaseRef,id); }
  addEntry(ctx:JuridicoRequestContext,id:string,dto:CreateDeadlineEntryDto) { return this.repository.addEntry(ctx.clientId,ctx.databaseRef,ctx.identityId,id,dto); }
}
