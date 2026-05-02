import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose } from "class-transformer";

import {
	ADDRESS_EXAMPLE,
	CHURCH_NAME_EXAMPLE,
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
	PHONE_NUMBER_EXAMPLE,
	TENANT_SLUG_EXAMPLE,
	URL_EXAMPLE,
} from "../dto-examples";

export class TenantDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({
		example: TENANT_SLUG_EXAMPLE,
		description:
			"URL-safe unique identifier. Used in frontend paths like /[slug]/admin/* and as a key in tenantMemberships custom claims.",
	})
	slug!: string;

	@Expose()
	@ApiProperty({ example: CHURCH_NAME_EXAMPLE, description: "Church name" })
	name!: string;

	@Expose()
	@ApiPropertyOptional({ example: ADDRESS_EXAMPLE, nullable: true })
	address!: string | null;

	@Expose()
	@ApiPropertyOptional({ example: PHONE_NUMBER_EXAMPLE, nullable: true })
	phone!: string | null;

	@Expose()
	@ApiPropertyOptional({ example: EMAIL_EXAMPLE, nullable: true })
	email!: string | null;

	@Expose()
	@ApiPropertyOptional({ example: URL_EXAMPLE, nullable: true })
	logoUrl!: string | null;

	@Expose()
	@ApiProperty({
		type: [String],
		example: ["building_fund", "youth_ministry"],
		description: "Tenant-defined custom transaction types",
	})
	customTransactionTypes!: string[];

	@Expose()
	@ApiProperty({
		example: FIREBASE_UID_EXAMPLE,
		description: "Firebase UID of creator",
	})
	createdBy!: string;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	updatedAt!: Date;

	@Expose()
	@ApiPropertyOptional({ example: DATE_UTC_EXAMPLE, nullable: true })
	deletedAt!: Date | null;
}
