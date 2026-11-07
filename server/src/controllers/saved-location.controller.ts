import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  LocationSearchDto,
  LocationSearchResultDto,
  SavedLocationCreateDto,
  SavedLocationResponseDto,
  SavedLocationsBulkCreateDto,
  SavedLocationUpdateDto,
} from 'src/dtos/saved-location.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { SavedLocationService } from 'src/services/saved-location.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.SavedLocations)
@Controller('saved-locations')
export class SavedLocationController {
  constructor(private service: SavedLocationService) {}

  // `search` and `bulk` are declared before `:id` so neither is ever read as a saved location id.

  @Get()
  @Authenticated({ permission: Permission.SavedLocationRead })
  @Endpoint({
    summary: 'List saved locations',
    description: 'Retrieve every saved location belonging to the authenticated user, in name order.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getSavedLocations(@Auth() auth: AuthDto): Promise<SavedLocationResponseDto[]> {
    return this.service.getAll(auth);
  }

  @Get('search')
  @Authenticated({ permission: Permission.SavedLocationRead })
  @Endpoint({
    summary: 'Search locations to pick',
    description:
      "Search everything the location picker offers as one ordered list: saved locations whose name contains the query, then people's places (pinned Home and Work contact fields whose person name, kind, label or value contains the query, current ones ahead of past ones), then GeoNames places. Matching ignores case and accents. Each row is tagged with its `type` and carries only the object that type names. With no query, only saved locations and current people's places are returned.",
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  searchLocations(@Auth() auth: AuthDto, @Query() dto: LocationSearchDto): Promise<LocationSearchResultDto[]> {
    return this.service.search(auth, dto);
  }

  @Post()
  @Authenticated({ permission: Permission.SavedLocationCreate })
  @Endpoint({
    summary: 'Save a location',
    description: 'Save a named pin. The name is trimmed and must not be blank.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  createSavedLocation(@Auth() auth: AuthDto, @Body() dto: SavedLocationCreateDto): Promise<SavedLocationResponseDto> {
    return this.service.create(auth, dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @Authenticated({ permission: Permission.SavedLocationCreate })
  @Endpoint({
    summary: 'Save several locations',
    description:
      'Save many named pins at once, for moving locations saved in the browser onto the server. An entry with the same trimmed name and exactly the same coordinates as one already saved, or as an earlier entry in the same request, is skipped, so sending the same list twice saves it once. Entries with a blank name are dropped. Every saved location the user now has is returned.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  createSavedLocations(
    @Auth() auth: AuthDto,
    @Body() dto: SavedLocationsBulkCreateDto,
  ): Promise<SavedLocationResponseDto[]> {
    return this.service.createAll(auth, dto);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.SavedLocationUpdate })
  @Endpoint({
    summary: 'Update a saved location',
    description:
      'Rename a saved location, move it, or both. Latitude and longitude are moved together; anything left out keeps its value.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  updateSavedLocation(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: SavedLocationUpdateDto,
  ): Promise<SavedLocationResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.SavedLocationDelete })
  @Endpoint({
    summary: 'Delete a saved location',
    description: 'Delete a saved location.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  deleteSavedLocation(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.remove(auth, id);
  }
}
