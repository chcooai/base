import { IsIn } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['active', 'disabled']) status!: 'active' | 'disabled';
}
