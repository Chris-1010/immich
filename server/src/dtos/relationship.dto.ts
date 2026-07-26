import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { RelationshipTypePair } from 'src/repositories/relationship.repository';
import { Optional } from 'src/validation';

export class RelationshipTypeCreateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** A blank opposite makes the type symmetric: its inverse is itself. */
  @IsString()
  @Optional({ nullable: true, emptyToNull: true })
  inverseName?: string | null;
}

export class RelationshipTypeUpdateDto {
  @IsString()
  @IsNotEmpty()
  @Optional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @Optional()
  inverseName?: string;
}

export class RelationshipTypeResponseDto {
  id!: string;
  name!: string;
  /** Equal to `id` when the type is symmetric. */
  inverseId!: string;
  inverseName!: string;
}

/** How much a pair deletion would take with it, for the confirmation dialog. */
export class RelationshipTypeUsageResponseDto {
  @ApiProperty({ type: 'integer' })
  relationshipCount!: number;

  @ApiProperty({ type: 'integer' })
  personCount!: number;
}

export function mapRelationshipType(type: RelationshipTypePair): RelationshipTypeResponseDto {
  return {
    id: type.id,
    name: type.name,
    inverseId: type.inverseId,
    inverseName: type.inverseName,
  };
}
