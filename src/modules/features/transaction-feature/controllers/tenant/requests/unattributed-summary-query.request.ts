import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";

// Query for the admin dashboard's unattributed-gifts callout.
// `dateFrom`/`dateTo` bracket `Transaction.date`. When both bounds are
// absent the endpoint covers the last 7 days.
export class UnattributedSummaryQueryRequestDto extends DateRangeRequestDto {}
