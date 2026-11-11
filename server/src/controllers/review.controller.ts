import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  ReviewFinishResponseDto,
  ReviewItemResponseDto,
  ReviewSimilarAssetResponseDto,
  ReviewUpdateDto,
} from 'src/dtos/review.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { ReviewService } from 'src/services/review.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Review)
@Controller('review')
export class ReviewController {
  constructor(private service: ReviewService) {}

  @Get()
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({
    summary: 'List pending assets',
    description:
      'Retrieve every asset pending review for the authenticated user, in the order they were added, with each decision and its staged edits. Pending assets are added by uploading with `visibility` set to `review`.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getReviewItems(@Auth() auth: AuthDto): Promise<ReviewItemResponseDto[]> {
    return this.service.getAll(auth);
  }

  @Post('finish')
  @HttpCode(HttpStatus.OK)
  @Authenticated({ permission: Permission.AssetDelete })
  @Endpoint({
    summary: 'Finish the review',
    description:
      'Commit every decision in one step. Kept assets have their staged edits applied and join the library; assets decided Delete are permanently deleted. Refused while any pending asset is undecided.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  finishReview(@Auth() auth: AuthDto): Promise<ReviewFinishResponseDto> {
    return this.service.finish(auth);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.AssetUpdate })
  @Endpoint({
    summary: 'Update a pending asset',
    description:
      'Set the decision (undecided, keep or delete) and/or replace the staged edits of a pending asset. Nothing is applied to the asset until the review is finished.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  updateReviewItem(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: ReviewUpdateDto,
  ): Promise<ReviewItemResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Get(':id/similar')
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({
    summary: 'Find look-alikes in the library',
    description:
      'Library assets that look like the pending asset, closest first, using the duplicate-detection embedding. Empty until smart search has processed the asset, or when duplicate detection is disabled.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getReviewSimilar(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<ReviewSimilarAssetResponseDto[]> {
    return this.service.getSimilar(auth, id);
  }
}
