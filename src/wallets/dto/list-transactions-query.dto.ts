import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListTransactionsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 5;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
