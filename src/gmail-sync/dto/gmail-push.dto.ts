import { Type } from 'class-transformer';
import {
  IsBase64,
  IsDefined,
  IsISO8601,
  IsNotEmpty,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PubSubMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  messageId: string;

  // Google Pub/Sub sends both camelCase and snake_case variants
  @IsString()
  @IsOptional()
  @MaxLength(256)
  message_id?: string;

  @IsBase64()
  @IsNotEmpty()
  data: string;

  @IsISO8601()
  @IsOptional()
  publishTime?: string;

  @IsString()
  @IsOptional()
  publish_time?: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;

  @IsString()
  @IsOptional()
  orderingKey?: string;
}

export class GmailPushEnvelopeDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PubSubMessageDto)
  message: PubSubMessageDto;

  @IsString()
  @MaxLength(512)
  @IsOptional()
  subscription?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  deliveryAttempt?: number;
}

export type GmailPushData = {
  emailAddress: string;
  historyId: string;
};
