import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsLatitude, IsLongitude, IsString, Max, Min, ValidateNested } from 'class-validator';
import { ReviewDecision } from 'src/enum';
import { ReviewItem } from 'src/repositories/review.repository';
import { Optional, ValidateBoolean, ValidateEnum, ValidateUUID } from 'src/validation';

export class ReviewFaceEditDto {
  /** A face detected on the pending asset. */
  @ValidateUUID()
  faceId!: string;

  /** The person the face is to be assigned to when the asset is kept. */
  @ValidateUUID()
  personId!: string;
}

/**
 * Changes entered against a pending asset. Nothing here is applied until the review is finished,
 * and only if the asset is kept. Each field mirrors the matching asset update.
 */
export class ReviewEditsDto {
  @Optional()
  @IsString()
  description?: string;

  @Optional()
  @IsDateString()
  dateTimeOriginal?: string;

  @Optional()
  @IsLatitude()
  @ApiProperty({ type: 'number', format: 'double', required: false })
  latitude?: number;

  @Optional()
  @IsLongitude()
  @ApiProperty({ type: 'number', format: 'double', required: false })
  longitude?: number;

  /** Mark the asset as deliberately having no location. */
  @ValidateBoolean({ optional: true })
  noLocation?: boolean;

  @Optional()
  @IsInt()
  @Max(5)
  @Min(-1)
  rating?: number;

  @ValidateBoolean({ optional: true })
  isFavorite?: boolean;

  /** Albums the asset is to be added to. */
  @ValidateUUID({ each: true, optional: true })
  albumIds?: string[];

  /** Face-to-person assignments to make. */
  @Optional()
  @ValidateNested({ each: true })
  @Type(() => ReviewFaceEditDto)
  faces?: ReviewFaceEditDto[];
}

export class ReviewUpdateDto {
  @ValidateEnum({ enum: ReviewDecision, name: 'ReviewDecision', optional: true })
  decision?: ReviewDecision;

  /** Replaces every staged edit on the asset. */
  @Optional()
  @ValidateNested()
  @Type(() => ReviewEditsDto)
  edits?: ReviewEditsDto;
}

export class ReviewItemResponseDto {
  assetId!: string;

  @ValidateEnum({ enum: ReviewDecision, name: 'ReviewDecision' })
  decision!: ReviewDecision;

  edits!: ReviewEditsDto;

  createdAt!: Date;
  updatedAt!: Date;
}

export class ReviewSimilarAssetResponseDto {
  /** A library asset that looks like the pending asset. */
  assetId!: string;

  /** Visual distance between the two; smaller is more alike. */
  @ApiProperty({ type: 'number', format: 'double' })
  distance!: number;
}

export class ReviewFinishResponseDto {
  @ApiProperty({ type: 'integer' })
  kept!: number;

  @ApiProperty({ type: 'integer' })
  deleted!: number;
}

export const mapReviewItem = (item: ReviewItem): ReviewItemResponseDto => ({
  assetId: item.assetId,
  decision: item.decision,
  edits: item.edits ?? {},
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});
