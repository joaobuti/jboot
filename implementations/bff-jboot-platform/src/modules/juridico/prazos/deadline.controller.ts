import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { DeadlineService } from './deadline.service';
import { CalculateDeadlineDto, CreateDeadlineCalendarDto, CreateDeadlineEntryDto } from './dto/deadline.dto';
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/prazos')
export class DeadlineController { constructor(private readonly service:DeadlineService) {}
 @Post('calculos') calculate(@Req() r:JuridicoRequest,@Body() b:CalculateDeadlineDto){this.scope(r,'juridico:write');return this.service.calculate(r.juridicoContext,b);}
 @Post('calendarios') calendar(@Req() r:JuridicoRequest,@Body() b:CreateDeadlineCalendarDto){this.scope(r,'juridico:admin');return this.service.createCalendar(r.juridicoContext,b);}
 @Get('calendarios') calendars(@Req() r:JuridicoRequest){this.scope(r,'juridico:read');return this.service.listCalendars(r.juridicoContext);}
 @Get('calendarios/:id/entradas') entries(@Req() r:JuridicoRequest,@Param('id') id:string){this.scope(r,'juridico:read');return this.service.listEntries(r.juridicoContext,id);}
 @Post('calendarios/:id/entradas') entry(@Req() r:JuridicoRequest,@Param('id') id:string,@Body() b:CreateDeadlineEntryDto){this.scope(r,'juridico:admin');return this.service.addEntry(r.juridicoContext,id,b);}
 private scope(r:JuridicoRequest,s:string){if(!r.juridicoContext.scopes.includes(s))throw new ForbiddenException('Insufficient juridico scope');}
}
