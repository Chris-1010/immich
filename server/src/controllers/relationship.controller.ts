import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  CoAppearanceResponseDto,
  RelatedPersonResponseDto,
  RelationshipCreateDto,
  RelationshipOrderUpdateDto,
  RelationshipResponseDto,
  RelationshipTypeCreateDto,
  RelationshipTypeResponseDto,
  RelationshipTypeSearchDto,
  RelationshipTypeUpdateDto,
  RelationshipTypeUsageResponseDto,
  RelationshipUpdateDto,
} from 'src/dtos/relationship.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { RelationshipService } from 'src/services/relationship.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Relationships)
@Controller('relationships')
export class RelationshipController {
  constructor(private service: RelationshipService) {}

  // The type routes are declared before `:id` so that `types` is never read as a relationship id.

  @Get('types')
  @Authenticated({ permission: Permission.RelationshipTypeRead })
  @Endpoint({
    summary: 'List relationship types',
    description:
      'Retrieve every relationship type belonging to the authenticated user, each with its inverse. The starter set is created on the first call for a user who has none. Naming both people the type is being chosen for orders the list by how well each type fits the age difference between them, with the fitting ones flagged as `suggested`; this needs a birth date on both people and is ignored otherwise.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getRelationshipTypes(
    @Auth() auth: AuthDto,
    @Query() dto: RelationshipTypeSearchDto,
  ): Promise<RelationshipTypeResponseDto[]> {
    return this.service.getTypes(auth, dto);
  }

  @Post('types')
  @Authenticated({ permission: Permission.RelationshipTypeCreate })
  @Endpoint({
    summary: 'Create a relationship type',
    description:
      'Create a relationship type and its inverse. A blank or identical opposite name creates a single symmetric type that is its own inverse.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  createRelationshipType(
    @Auth() auth: AuthDto,
    @Body() dto: RelationshipTypeCreateDto,
  ): Promise<RelationshipTypeResponseDto> {
    return this.service.createType(auth, dto);
  }

  @Get('types/:id/usage')
  @Authenticated({ permission: Permission.RelationshipTypeRead })
  @Endpoint({
    summary: 'Retrieve relationship type usage',
    description:
      'Retrieve how many relationships, across how many people, deleting this relationship type and its inverse would remove.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getRelationshipTypeUsage(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
  ): Promise<RelationshipTypeUsageResponseDto> {
    return this.service.getTypeUsage(auth, id);
  }

  @Put('types/:id')
  @Authenticated({ permission: Permission.RelationshipTypeUpdate })
  @Endpoint({
    summary: 'Rename a relationship type',
    description:
      'Rename either half of a relationship type pair. The pairing itself cannot change: a symmetric type stays symmetric and an asymmetric pair stays asymmetric.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  updateRelationshipType(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: RelationshipTypeUpdateDto,
  ): Promise<RelationshipTypeResponseDto> {
    return this.service.updateType(auth, id, dto);
  }

  @Delete('types/:id')
  @Authenticated({ permission: Permission.RelationshipTypeDelete })
  @Endpoint({
    summary: 'Delete a relationship type',
    description:
      'Delete a relationship type, its inverse, and every relationship using either. The counts of what was removed are returned.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  deleteRelationshipType(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
  ): Promise<RelationshipTypeUsageResponseDto> {
    return this.service.deleteType(auth, id);
  }

  @Get('people/:id')
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: "List a person's relationships",
    description:
      "Retrieve everyone a person is related to, grouped one entry per person, with every label read from that person's end.",
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getRelatedPeople(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<RelatedPersonResponseDto[]> {
    return this.service.getRelatedPeople(auth, id);
  }

  @Put('people/:id/order')
  @Authenticated({ permission: Permission.PersonUpdate })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: "Reorder a person's relationships",
    description:
      "Record the order the people on this page should be listed in. The order applies to this page only — it does not change how this person is listed on anyone else's. Anyone omitted goes back to being ordered by relationship type.",
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  setRelatedPeopleOrder(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: RelationshipOrderUpdateDto,
  ): Promise<void> {
    return this.service.setRelatedPeopleOrder(auth, id, dto);
  }

  @Get('people/:id/co-appearances')
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'List candidate counterparts',
    description:
      'Retrieve the named, non-hidden people of the library ordered by how many photos they share with this person. The person themselves and anyone they are already related to are left out, so every result is a candidate for a new relationship.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  getCoAppearances(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<CoAppearanceResponseDto[]> {
    return this.service.getCoAppearances(auth, id);
  }

  @Post()
  @Authenticated({ permission: Permission.RelationshipCreate })
  @Endpoint({
    summary: 'Create a relationship',
    description:
      'Relate two people under one relationship type. Adding a relationship that is already recorded, in either direction, returns the existing one instead of failing.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  createRelationship(@Auth() auth: AuthDto, @Body() dto: RelationshipCreateDto): Promise<RelationshipResponseDto> {
    return this.service.createRelationship(auth, dto);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.RelationshipUpdate })
  @Endpoint({
    summary: 'Relabel a relationship',
    description:
      'Change the relationship type. The new type describes the person opposite `subjectId`, so `subjectId` must be the person whose page the type was chosen from.',
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  updateRelationship(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: RelationshipUpdateDto,
  ): Promise<RelationshipResponseDto> {
    return this.service.updateRelationship(auth, id, dto);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.RelationshipDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete a relationship',
    description: "Delete a relationship. It stops being shown on both people's pages.",
    history: new HistoryBuilder().added('v2.4.1').alpha('v2.4.1'),
  })
  deleteRelationship(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.deleteRelationship(auth, id);
  }
}
