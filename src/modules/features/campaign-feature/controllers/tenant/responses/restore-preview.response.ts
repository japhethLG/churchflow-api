import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

// Cascade preview for the campaign-restore confirmation modal.
//
// Keys are the child model names declared in the schema; values are the
// count of tombstones that would be brought back when the parent
// campaign is restored (rows where `deletedByCascade = true` and the FK
// matches). For this app the only cascaded child is CampaignItem — the
// response shape is left as a free-form record so the helper can grow
// without an API change.
export class RestorePreviewResponseDto {
	@Expose()
	@ApiProperty({
		example: { CampaignItem: 12 },
		description:
			"Cascade-deleted descendant counts keyed by Prisma model name. Empty when the parent has no cascaded descendants.",
		additionalProperties: { type: "number" },
	})
	cascadeCount!: Record<string, number>;
}
