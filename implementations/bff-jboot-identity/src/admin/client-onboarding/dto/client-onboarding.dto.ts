import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator';

export class OnboardingClientDto {
  @ApiProperty({ enum: ['person', 'company', 'public_agency'] })
  @IsIn(['person', 'company', 'public_agency'])
  clientType: string;

  @ApiPropertyOptional({ enum: ['cpf', 'cnpj'] })
  @IsOptional()
  @IsIn(['cpf', 'cnpj'])
  documentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9]{11}$|^[0-9]{14}$/)
  documentNumber?: string;

  @ApiProperty()
  @IsString()
  legalName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ description: 'Mensalidade do contratante em reais (informativa)', type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  monthlyFee?: number | null;
}

export class OnboardingApplicationDto {
  @ApiProperty()
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional({ enum: ['active', 'trial'] })
  @IsOptional()
  @IsIn(['active', 'trial'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class OnboardingAdminDto {
  @ApiProperty({ enum: ['cpf', 'cnpj'] })
  @IsIn(['cpf', 'cnpj'])
  documentType: string;

  @ApiProperty()
  @Matches(/^[0-9]{11}$|^[0-9]{14}$/)
  documentNumber: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  /** Recebe o convite com o link para criar a senha (docs/product/account-access-email-sprints.md). */
  @ApiProperty()
  @IsEmail()
  email: string;
}

export class CreateClientOnboardingDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => OnboardingClientDto)
  client: OnboardingClientDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => OnboardingApplicationDto)
  @IsOptional()
  application?: OnboardingApplicationDto;

  @ApiPropertyOptional({ type: [OnboardingApplicationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingApplicationDto)
  applications?: OnboardingApplicationDto[];

  @ApiProperty()
  @ValidateNested()
  @Type(() => OnboardingAdminDto)
  admin: OnboardingAdminDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adminScopes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adminRoles?: string[];
}
